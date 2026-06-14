// Страховочные тесты движка DispatcherCore (этап 0 ROADMAP).
// Публичный class-слой Dispatcher покрыт в dispatcher.base.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { DispatcherCore, EnhancedMiddleware } from '../dispatcher.module'

interface State extends Record<string, any> {
  count: number
}

const initial = (): State => ({ count: 0 })

let storage: MemoryStorage<State>

beforeEach(async () => {
  storage = new MemoryStorage<State>({ name: `disp_${Math.random()}`, initialState: initial() })
  await storage.initialize()
})

afterEach(async () => {
  await storage.destroy()
})

describe('DispatcherCore.createAction', () => {
  it('explicit type: payload = результат handler; actionType = [storeName]type', async () => {
    const d = new DispatcherCore<State>({ storage })
    const increment = d.createAction<number, number>({
      type: 'increment',
      action: (n) => {
        storage.update((st) => {
          st.count += n
        })
        return n
      },
    })

    const result = await increment(5)

    expect(result).toBe(5)
    expect(increment.actionType).toBe(`[${storage.name}]increment`)
    expect(storage.getStateSync().count).toBe(5)
  })

  it('action$ эмитит один раз на dispatch с финальным payload', async () => {
    const d = new DispatcherCore<State>({ storage })
    const increment = d.createAction<number, number>({ type: 'inc', action: (n) => n })

    const emitted: any[] = []
    d.actions.subscribe((a) => emitted.push(a))

    await increment(7)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].type).toBe(`[${storage.name}]inc`)
    expect(emitted[0].payload).toBe(7)
  })

  it('dispatch до назначения типа бросает понятную ошибку', async () => {
    const d = new DispatcherCore<State>({ storage })
    const fn = d.createAction({ action: () => 1 }) // type не задан, _assignType не вызван
    await expect(fn()).rejects.toThrow(/Action type not assigned/)
  })

  it('memoize: повторный вызов с теми же params отдаёт кэш', async () => {
    const spy = vi.fn((n: number) => n)
    const d = new DispatcherCore<State>({ storage })
    const act = d.createAction<number, number>({ type: 'act', action: spy }, { memoize: (cur, prev) => cur === prev })

    await act(1)
    await act(1)
    expect(spy).toHaveBeenCalledTimes(1)

    await act(2)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('destroy(): action$ завершается', () => {
    const d = new DispatcherCore<State>({ storage })
    d.createAction({ type: 'a', action: () => 1 })
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

    const d = new DispatcherCore<State>({ storage, middlewares: [mwA, mwB] })
    const increment = d.createAction<number, number>({ type: 'inc', action: (n) => n })

    await increment(1)

    expect(order).toEqual(['A:before', 'B:before', 'B:after', 'A:after'])
    expect(seenState?.count).toBe(0)
    expect(seenStorage).toBe(storage)
  })
})

describe('createWatcher', () => {
  const tick = () => new Promise<void>((r) => setTimeout(r, 0))

  it('notifyAfterSubscribe эмитит начальное значение, изменения эмитят в action$', async () => {
    const d = new DispatcherCore<State>({ storage })
    const watchCount = d.createWatcher<number>({ type: 'watchCount', selector: (s) => s.count, notifyAfterSubscribe: true })

    const fromWatcher: any[] = []
    const fromActions: any[] = []
    d.actions.subscribe((a) => fromActions.push(a))
    watchCount().subscribe((a) => fromWatcher.push(a))

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
    const d = new DispatcherCore<State>({ storage })
    const watchCount = d.createWatcher<number>({ type: 'watchHigh', selector: (s) => s.count, shouldTrigger: (_prev, cur) => cur >= 10 })

    const emissions: any[] = []
    watchCount().subscribe((a) => emissions.push(a))
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
