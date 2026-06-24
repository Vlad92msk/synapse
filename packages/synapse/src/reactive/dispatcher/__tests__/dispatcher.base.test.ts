// Этап 1 ROADMAP — class-based `Dispatcher<TState>` (base).
import { tap } from 'rxjs/operators'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { ofType } from '../../effects/effects.module'
import { createSynapse } from '../../../utils/createSynapse/createSynapse'
import { Dispatcher, FINALIZE } from '../dispatcher.base'
import type { EnhancedMiddleware } from '../dispatcher.module'
import { type ApiRequestState, ApiStatus } from '../standalone'

interface State extends Record<string, any> {
  count: number
  list: number[]
  api: { postsRequest: ApiRequestState }
  keyed: { commentsReq: Record<string, ApiRequestState> }
}

const initial = (): State => ({
  count: 0,
  list: [],
  api: { postsRequest: { status: 'idle', error: null } },
  keyed: { commentsReq: {} },
})

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

let uid = 0
let storage: MemoryStorage<State>

beforeEach(async () => {
  storage = new MemoryStorage<State>({ name: `dbase_${uid++}`, initialState: initial() })
  await storage.initialize()
})

afterEach(async () => {
  await storage.destroy()
})

// ── Базовый тестовый диспетчер ────────────────────────────────────────────────
class TestDispatcher extends Dispatcher<State> {
  readonly increment = this.action((store, n: number) => {
    store.update((s) => {
      s.count += n
    })
    return n
  })

  readonly mounted = this.signal<{ id: string }>('Лента смонтирована')

  readonly loadPosts = this.apiActions<{ ownerId: string }>((s) => s.api.postsRequest)

  readonly comments = this.keyedApiActions((s) => s.keyed.commentsReq)

  readonly watchCount = this.watcher({ selector: (s) => s.count, notifyAfterSubscribe: true })
}

describe('this.action', () => {
  it('actionType = [storeName]имяПоля; dispatch работает; payload = результат handler', async () => {
    const d = new TestDispatcher(storage)

    const result = await d.increment(5)

    expect(result).toBe(5)
    expect(d.increment.actionType).toBe(`[${storage.name}]increment`)
    expect(storage.getStateSync().count).toBe(5)
  })

  it('эмитит в action$ один раз с финальным payload', async () => {
    const d = new TestDispatcher(storage)
    const emitted: any[] = []
    d.action$.subscribe((a) => emitted.push(a))

    await d.increment(3)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].type).toBe(`[${storage.name}]increment`)
    expect(emitted[0].payload).toBe(3)
  })
})

describe('this.signal', () => {
  it('payload = аргумент; description в meta', async () => {
    const d = new TestDispatcher(storage)
    const payload = await d.mounted({ id: 'x' })

    expect(payload).toEqual({ id: 'x' })
    expect(d.mounted.actionType).toBe(`[${storage.name}]mounted`)
    expect(d.mounted.meta).toEqual({ description: 'Лента смонтирована' })
  })
})

describe('this.apiActions (вызываемая группа)', () => {
  it('вызов = init: idle + payload насквозь; lifecycle пишет статусы; actionTypes', async () => {
    const d = new TestDispatcher(storage)

    const payload = await d.loadPosts({ ownerId: 'u1' })
    expect(payload).toEqual({ ownerId: 'u1' })
    expect(storage.getStateSync().api.postsRequest).toEqual({ status: 'idle', error: null })

    await d.loadPosts.loading()
    expect(storage.getStateSync().api.postsRequest.status).toBe('loading')

    await d.loadPosts.success()
    expect(storage.getStateSync().api.postsRequest.status).toBe('success')

    await d.loadPosts.failure('boom')
    expect(storage.getStateSync().api.postsRequest).toEqual({ status: 'error', error: 'boom' })

    await d.loadPosts.reset()
    expect(storage.getStateSync().api.postsRequest.status).toBe('reset')

    expect(d.loadPosts.actionType).toBe(`[${storage.name}]loadPosts`)
    expect(d.loadPosts.loading.actionType).toBe(`[${storage.name}]loadPosts:loading`)
    expect(d.loadPosts.success.actionType).toBe(`[${storage.name}]loadPosts:success`)
  })

  it('ofType(d.loadPosts) ловит ТОЛЬКО init; ofType(d.loadPosts.success) — только success', async () => {
    const d = new TestDispatcher(storage)
    // финализируем имена до подписки (как это делает сборщик)
    d[FINALIZE]()

    const inits: any[] = []
    const successes: any[] = []
    d.action$.pipe(ofType(d.loadPosts)).subscribe((a) => inits.push(a))
    d.action$.pipe(ofType(d.loadPosts.success)).subscribe((a) => successes.push(a))

    await d.loadPosts({ ownerId: 'u1' })
    await d.loadPosts.loading()
    await d.loadPosts.success()

    expect(inits).toHaveLength(1)
    expect(inits[0].payload).toEqual({ ownerId: 'u1' })
    expect(successes).toHaveLength(1)
  })
})

describe('this.keyedApiActions', () => {
  it('статус по ключу; изоляция ключей; failure({key,error})', async () => {
    const d = new TestDispatcher(storage)

    await d.comments.loading('a')
    await d.comments.success('b')

    expect(storage.getStateSync().keyed.commentsReq.a.status).toBe('loading')
    expect(storage.getStateSync().keyed.commentsReq.b.status).toBe('success')

    await d.comments.failure({ key: 'a', error: 'x' })
    expect(storage.getStateSync().keyed.commentsReq.a).toEqual({ status: 'error', error: 'x' })
    // ключ b не затронут
    expect(storage.getStateSync().keyed.commentsReq.b.status).toBe('success')
  })
})

describe('this.watcher', () => {
  it('эмитит в action$; notifyAfterSubscribe + shouldTrigger', async () => {
    const d = new TestDispatcher(storage)

    const fromWatcher: any[] = []
    const fromActions: any[] = []
    d.action$.subscribe((a) => fromActions.push(a))
    d.watchCount().subscribe((a) => fromWatcher.push(a))
    await tick()

    expect(fromWatcher[0].payload).toBe(0)
    expect(fromWatcher[0].meta.isInitial).toBe(true)

    await storage.update((s) => {
      s.count = 7
    })
    await tick()

    expect(fromWatcher.some((e) => e.payload === 7)).toBe(true)
    expect(fromActions.some((e) => e.payload === 7)).toBe(true)
    expect(d.watchCount.actionType).toBe(`[${storage.name}]watchCount`)
  })

  it('shouldTrigger фильтрует эмиссии', async () => {
    class WD extends Dispatcher<State> {
      readonly watchHigh = this.watcher({ selector: (s) => s.count, shouldTrigger: (_p, c) => c >= 10 })
    }
    const d = new WD(storage)
    const emissions: any[] = []
    d.watchHigh().subscribe((a) => emissions.push(a))
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

describe('финализация', () => {
  it('FINALIZE назначает имена и наполняет реестр dispatch до использования', () => {
    const d = new TestDispatcher(storage)
    d[FINALIZE]()

    expect(Object.keys(d.dispatch)).toEqual(
      expect.arrayContaining(['increment', 'mounted', 'loadPosts', 'loadPosts:loading', 'loadPosts:success', 'loadPosts:failure', 'loadPosts:reset']),
    )
    expect(Object.keys(d.watchers)).toContain('watchCount')
    expect(d.increment.actionType).toBe(`[${storage.name}]increment`)
  })

  it('идемпотентна: повторный FINALIZE не ломает', async () => {
    const d = new TestDispatcher(storage)
    d[FINALIZE]()
    d[FINALIZE]()
    await expect(d.increment(1)).resolves.toBe(1)
  })

  it('ленивая само-финализация: первый dispatch без сборщика проходит', async () => {
    const d = new TestDispatcher(storage)
    // ни FINALIZE, ни обращения к реестру — только вызов экшена
    const result = await d.increment(2)
    expect(result).toBe(2)
    expect(d.increment.actionType).toBe(`[${storage.name}]increment`)
  })

  it('обращение к реестру dispatch финализирует (страховка для createSynapse config)', () => {
    const d = new TestDispatcher(storage)
    // getter dispatch финализирует
    expect(d.dispatch.increment).toBeDefined()
    expect(d.dispatch.increment.actionType).toBe(`[${storage.name}]increment`)
  })
})

describe('dev-проверки', () => {
  it('поле-алиас → ошибка с именами обоих полей', () => {
    class AliasD extends Dispatcher<State> {
      readonly original = this.signal<void>()
      readonly alias = this.original
    }
    const d = new AliasD(storage)
    expect(() => d[FINALIZE]()).toThrow(/алиас/)
  })

  it('коллизия с зарезервированным именем → ошибка', () => {
    class ReservedD extends Dispatcher<State> {
      // @ts-expect-error поле перекрывает зарезервированный член базового класса (action$)
      readonly action$ = this.signal<void>()
    }
    const d = new ReservedD(storage)
    expect(() => d[FINALIZE]()).toThrow(/зарезервированным/)
  })
})

describe('options.type', () => {
  it('переопределяет имя поля', async () => {
    class TypeD extends Dispatcher<State> {
      readonly bump = this.action(
        (store, n: number) =>
          store.update((s) => {
            s.count += n
          }),
        { type: 'CUSTOM_BUMP' },
      )
    }
    const d = new TypeD(storage)
    d[FINALIZE]()
    expect(d.bump.actionType).toBe(`[${storage.name}]CUSTOM_BUMP`)
    await d.bump(1)
    expect(storage.getStateSync().count).toBe(1)
  })
})

describe('middleware и memoize', () => {
  it('middleware через конструктор и через use()', async () => {
    const order: string[] = []
    const mwCtor: EnhancedMiddleware<State> = () => (next) => async (a) => {
      order.push('ctor')
      return next(a)
    }
    const mwUse: EnhancedMiddleware<State> = () => (next) => async (a) => {
      order.push('use')
      return next(a)
    }

    const d = new TestDispatcher(storage, { middlewares: [mwCtor] })
    d.use(mwUse)

    await d.increment(1)
    expect(order).toEqual(['ctor', 'use'])
  })

  it('memoize-опция: повторный вызов с теми же params отдаёт кэш', async () => {
    const spy = vi.fn((_s: any, n: number) => n)
    class MemoD extends Dispatcher<State> {
      readonly act = this.action(spy, { memoize: (cur, prev) => cur === prev })
    }
    const d = new MemoD(storage)

    await d.act(1)
    await d.act(1)
    expect(spy).toHaveBeenCalledTimes(1)

    await d.act(2)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('наследование', () => {
  it('поля Base и Child финализируются на обоих уровнях', async () => {
    class Base extends Dispatcher<State> {
      readonly baseAct = this.action((store, n: number) =>
        store.update((s) => {
          s.count += n
        }),
      )
    }
    class Child extends Base {
      readonly childAct = this.action((store, n: number) =>
        store.update((s) => {
          s.count -= n
        }),
      )
    }
    const d = new Child(storage)
    d[FINALIZE]()

    expect(d.baseAct.actionType).toBe(`[${storage.name}]baseAct`)
    expect(d.childAct.actionType).toBe(`[${storage.name}]childAct`)

    await d.baseAct(10)
    await d.childAct(3)
    expect(storage.getStateSync().count).toBe(7)
  })
})

describe('интеграция с createSynapse(factory)', () => {
  it('инстанс класса как dispatcher; эффект-функция реагирует через action$', async () => {
    const seen: number[] = []

    const handle = createSynapse(() => ({
      storage,
      dispatcher: new TestDispatcher(storage),
      effects: [
        (action$: any, _state$: any, { dispatcher }: any) =>
          action$.pipe(
            ofType((dispatcher as TestDispatcher).increment),
            tap((a: any) => seen.push(a.payload)),
          ),
      ],
    }))

    const synapse = await handle
    const d = synapse.dispatcher as TestDispatcher
    expect('dispatch' in d).toBe(true)

    await d.increment(42)
    await tick()

    expect(seen).toContain(42)
    expect(storage.getStateSync().count).toBe(42)

    await handle.destroy()
  })
})

describe('строгая типизация (компилируемые type-тесты)', () => {
  it('payload/params выводятся из фабрик без any', () => {
    const d = new TestDispatcher(storage)

    expectTypeOf(d.increment).parameter(0).toEqualTypeOf<number>()
    expectTypeOf(d.increment).returns.resolves.toEqualTypeOf<number>()

    expectTypeOf(d.mounted).parameter(0).toEqualTypeOf<{ id: string }>()

    expectTypeOf(d.loadPosts).parameter(0).toEqualTypeOf<{ ownerId: string }>()
    expectTypeOf(d.loadPosts.failure).parameter(0).toEqualTypeOf<string>()

    // статусные значения остаются строковыми литералами
    expectTypeOf(ApiStatus.Loading).toEqualTypeOf<'loading'>()
  })
})
