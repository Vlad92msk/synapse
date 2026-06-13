// Страховочные тесты Dispatcher / createDispatcher / standalone (этап 0 ROADMAP).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { DispatcherCore, EnhancedMiddleware, createDispatcher } from '../dispatcher.module'
import { createApiActions, createKeyedApiActions, defineAction, defineWatcher } from '../standalone'

interface State extends Record<string, any> {
  count: number
  api: { listReq: { status: string; error: string | null } }
  keyed: { commentsReq: Record<string, { status: string; error: string | null }> }
}

const initial = (): State => ({
  count: 0,
  api: { listReq: { status: 'idle', error: null } },
  keyed: { commentsReq: {} },
})

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

let storage: MemoryStorage<State>

beforeEach(async () => {
  storage = new MemoryStorage<State>({ name: `disp_${Math.random()}`, initialState: initial() })
  await storage.initialize()
})

afterEach(async () => {
  await storage.destroy()
})

describe('createAction / createDispatcher', () => {
  it('payload экшена = возвращаемое значение handler; actionType = [storeName]key', async () => {
    const increment = defineAction<State>()({
      action: (s, n: number) => {
        s.update((st) => {
          st.count += n
        })
        return n
      },
    })
    const d = createDispatcher({ storage }, { increment })

    const result = await d.dispatch.increment(5)

    expect(result).toBe(5)
    expect(d.dispatch.increment.actionType).toBe(`[${storage.name}]increment`)
    expect(storage.getStateSync().count).toBe(5)
  })

  it('action$ эмитит один раз на dispatch с финальным payload', async () => {
    const increment = defineAction<State>()({ action: (_s, n: number) => n })
    const d = createDispatcher({ storage }, { increment })

    const emitted: any[] = []
    d.actions.subscribe((a) => emitted.push(a))

    await d.dispatch.increment(7)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].type).toBe(`[${storage.name}]increment`)
    expect(emitted[0].payload).toBe(7)
  })

  it('dispatch до назначения типа бросает понятную ошибку', async () => {
    const disp = new DispatcherCore<State>({ storage })
    const fn = disp.createAction({ action: () => 1 }) // type не задан, _assignType не вызван
    await expect(fn()).rejects.toThrow(/Action type not assigned/)
  })

  it('memoize: повторный вызов с теми же params отдаёт кэш', async () => {
    const spy = vi.fn((_s: any, n: number) => n)
    const act = defineAction<State>()({ action: spy }, { memoize: (cur, prev) => cur === prev })
    const d = createDispatcher({ storage }, { act })

    await d.dispatch.act(1)
    await d.dispatch.act(1)
    expect(spy).toHaveBeenCalledTimes(1)

    await d.dispatch.act(2)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('destroy(): action$ завершается', () => {
    const d = createDispatcher({ storage }, { act: defineAction<State>()({ action: () => 1 }) })
    let completed = false
    d.actions.subscribe({ complete: () => (completed = true) })

    d.destroy()
    expect(completed).toBe(true)
  })
})

describe('middleware', () => {
  it('порядок композиции и доступ к getState/storage', async () => {
    const order: string[] = []
    let seenState: State | undefined
    let seenStorage: unknown

    const mwA: EnhancedMiddleware<State> = () => (next) => async (action) => {
      order.push('A:before')
      const r = await next(action)
      order.push('A:after')
      return r
    }
    const mwB: EnhancedMiddleware<State> = (api) => (next) => async (action) => {
      order.push('B:before')
      seenState = (await api.getState()) as State
      seenStorage = api.storage
      const r = await next(action)
      order.push('B:after')
      return r
    }

    const increment = defineAction<State>()({ action: (_s, n: number) => n })
    const d = createDispatcher({ storage, middlewares: [mwA, mwB] }, { increment })

    await d.dispatch.increment(1)

    expect(order).toEqual(['A:before', 'B:before', 'B:after', 'A:after'])
    expect(seenState?.count).toBe(0)
    expect(seenStorage).toBe(storage)
  })
})

describe('watcher', () => {
  it('notifyAfterSubscribe эмитит начальное значение, изменения эмитят в action$', async () => {
    const watchCount = defineWatcher<State>()({ selector: (s) => s.count, notifyAfterSubscribe: true })
    const d = createDispatcher({ storage }, { watchCount })

    const fromWatcher: any[] = []
    const fromActions: any[] = []
    d.actions.subscribe((a) => fromActions.push(a))
    d.watchers.watchCount().subscribe((a) => fromWatcher.push(a))

    await tick()
    expect(fromWatcher[0].payload).toBe(0)
    expect(fromWatcher[0].meta.isInitial).toBe(true)

    await storage.update((s) => {
      s.count = 7
    })
    await tick()

    expect(fromWatcher.some((e) => e.payload === 7)).toBe(true)
    // watcher эмитит в общий action$
    expect(fromActions.some((e) => e.payload === 7)).toBe(true)
  })

  it('shouldTrigger: ленивая фильтрация эмиссий', async () => {
    const watchCount = defineWatcher<State>()({
      selector: (s) => s.count,
      shouldTrigger: (_prev, cur) => cur >= 10,
    })
    const d = createDispatcher({ storage }, { watchCount })

    const emissions: any[] = []
    d.watchers.watchCount().subscribe((a) => emissions.push(a))
    await tick()

    await storage.update((s) => {
      s.count = 5
    })
    await tick()
    expect(emissions).toHaveLength(0)

    await storage.update((s) => {
      s.count = 10
    })
    await tick()
    expect(emissions.map((e) => e.payload)).toContain(10)
  })
})

describe('createApiActions', () => {
  it('init несёт payload и сбрасывает статус в idle; loading/success/failure/reset пишут по пути accessor', async () => {
    const listReq = createApiActions<State, { id: number }>((d) => d.api.listReq)
    const d = createDispatcher(
      { storage },
      {
        loadInit: listReq.init,
        loadLoading: listReq.loading,
        loadSuccess: listReq.success,
        loadFailure: listReq.failure,
        loadReset: listReq.reset,
      },
    )

    const payload = await d.dispatch.loadInit({ id: 1 })
    expect(payload).toEqual({ id: 1 })
    expect(storage.getStateSync().api.listReq).toEqual({ status: 'idle', error: null })

    await d.dispatch.loadLoading()
    expect(storage.getStateSync().api.listReq.status).toBe('loading')

    await d.dispatch.loadSuccess()
    expect(storage.getStateSync().api.listReq.status).toBe('success')

    await d.dispatch.loadFailure('boom')
    expect(storage.getStateSync().api.listReq).toEqual({ status: 'error', error: 'boom' })

    await d.dispatch.loadReset()
    expect(storage.getStateSync().api.listReq.status).toBe('reset')
  })

  it('actionType init = [storeName]loadInit, success = [storeName]loadSuccess', () => {
    const listReq = createApiActions<State>((d) => d.api.listReq)
    const d = createDispatcher({ storage }, { loadInit: listReq.init, loadSuccess: listReq.success })
    expect(d.dispatch.loadInit.actionType).toBe(`[${storage.name}]loadInit`)
    expect(d.dispatch.loadSuccess.actionType).toBe(`[${storage.name}]loadSuccess`)
  })
})

describe('createKeyedApiActions', () => {
  it('статусы по ключу изолированы; failure принимает {key,error}', async () => {
    const commentsReq = createKeyedApiActions<State>((d) => d.keyed.commentsReq)
    const d = createDispatcher(
      { storage },
      {
        cLoading: commentsReq.loading,
        cSuccess: commentsReq.success,
        cFailure: commentsReq.failure,
      },
    )

    await d.dispatch.cLoading('a')
    await d.dispatch.cSuccess('b')

    expect(storage.getStateSync().keyed.commentsReq.a.status).toBe('loading')
    expect(storage.getStateSync().keyed.commentsReq.b.status).toBe('success')

    await d.dispatch.cFailure({ key: 'a', error: 'x' })

    expect(storage.getStateSync().keyed.commentsReq.a).toEqual({ status: 'error', error: 'x' })
    // ключ b не затронут
    expect(storage.getStateSync().keyed.commentsReq.b.status).toBe('success')
  })
})
