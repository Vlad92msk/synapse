// Этап 2 ROADMAP — class-based `Effects<TState, TDispatcher, TExternalDispatchers?>` (base).
import { BehaviorSubject, EMPTY, Observable, of } from 'rxjs'
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { loggerConsole } from '../../../_utils/logger-console.util'
import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { Dispatcher, FINALIZE } from '../../dispatcher/dispatcher.base'
import type { ApiRequestState } from '../../dispatcher/standalone'
import { Effects } from '../effects.base'
import { type Effect, EffectsModule, ofType } from '../effects.module'

// ── Доменные типы ─────────────────────────────────────────────────────────────
interface State extends Record<string, any> {
  list: number[]
  api: { loadReq: ApiRequestState }
}

const initial = (): State => ({ list: [], api: { loadReq: { status: 'idle', error: null } } })

interface CoreState extends Record<string, any> {
  userId: string | null
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

// ── Диспетчер (этап 1) ────────────────────────────────────────────────────────
class TestDispatcher extends Dispatcher<State> {
  readonly loadPosts = this.apiActions<{ ownerId: string }>((s) => s.api.loadReq)
  readonly applyPosts = this.action((store, items: number[]) =>
    store.update((s) => {
      s.list = items
    }),
  )
  readonly ping = this.signal<void>()
}

// Внешний диспетчер (для ctx.external / externalDispatchers)
class CoreDispatcher extends Dispatcher<CoreState> {
  readonly logout = this.signal<void>()
}

// Простой сервис, инжектируемый в конструктор Effects
interface Api {
  fetch: (ownerId: string) => number[]
}

// Трекер подключений (объект, не функция — чтобы не путать с эффектом-полем)
interface Tracker {
  connect: (userId: string | null) => void
}

// ── Тестовые эффекты ──────────────────────────────────────────────────────────
class TestEffects extends Effects<State, TestDispatcher> {
  constructor(
    private readonly api: Api,
    private readonly core$: Observable<CoreState>,
    private readonly tracker: Tracker,
  ) {
    super()
  }

  /** ofType(d.loadPosts) ловит init → сервис из замыкания → applyPosts. */
  readonly loadPosts = this.effect((action$, _state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadPosts),
      mergeMap((action) => {
        const items = this.api.fetch(action.payload.ownerId)
        d.applyPosts(items)
        d.loadPosts.success()
        return EMPTY
      }),
    ),
  )

  /** Внешний стор как конструкторный Observable. */
  readonly connection = this.effect(() =>
    this.core$.pipe(
      map((c) => c.userId),
      distinctUntilChanged(),
      tap((userId) => this.tracker.connect(userId)),
    ),
  )

  override onDestroy = vi.fn()
}

// Эффект на чужой экшен (ctx.external) — отдельный класс, требует внешнего диспетчера.
class LogoutEffects extends Effects<State, TestDispatcher, { core: CoreDispatcher }> {
  constructor(private readonly api: Api) {
    super()
  }

  readonly onCoreLogout = this.effect((action$, _state$, { external }) =>
    action$.pipe(
      ofType(external.core.logout),
      mergeMap(() => {
        this.api.fetch('__logout__')
        return EMPTY
      }),
    ),
  )
}

// ── Хелпер: собрать EffectsModule поверх class-эффектов (мини-имитация сборщика) ─
function mountEffects(
  storage: MemoryStorage<State>,
  dispatcher: TestDispatcher,
  effectsInstance: Effects<State, TestDispatcher, any>,
  externalDispatchers: Record<string, any> = {},
  extraEffects: Effect[] = [],
) {
  dispatcher[FINALIZE]()
  for (const ext of Object.values(externalDispatchers)) ext[FINALIZE]?.()
  const mod = new EffectsModule<State, TestDispatcher>(storage, dispatcher, externalDispatchers)
  mod.addEffects([...effectsInstance.getEffects(), ...extraEffects])
  return mod
}

let uid = 0
let storage: MemoryStorage<State>
let dispatcher: TestDispatcher

beforeEach(async () => {
  storage = new MemoryStorage<State>({ name: `effbase_${uid++}`, initialState: initial() })
  await storage.initialize()
  dispatcher = new TestDispatcher(storage)
})

afterEach(async () => {
  await storage.destroy()
})

describe('this.effect — ленивость и контекст', () => {
  it('рецепт НЕ вызывается при конструировании; вызывается один раз при start() с (action$, state$, ctx)', async () => {
    const recipe = vi.fn(() => EMPTY)
    class LazyEffects extends Effects<State, TestDispatcher> {
      readonly e = this.effect(recipe)
    }
    const inst = new LazyEffects()

    expect(recipe).not.toHaveBeenCalled()

    const mod = mountEffects(storage, dispatcher, inst)
    await mod.start()

    expect(recipe).toHaveBeenCalledTimes(1)
    const [action$, state$, ctx] = recipe.mock.calls[0] as any
    expect(action$).toBeInstanceOf(Observable)
    expect(state$).toBeInstanceOf(Observable)
    expect(ctx.dispatcher).toBe(dispatcher)

    mod.stop()
  })

  it('ctx.dispatcher — инстанс class-диспетчера: ofType(d.loadPosts) + d.applyPosts(...)', async () => {
    const api: Api = { fetch: vi.fn((ownerId) => [ownerId.length, 1, 2]) }
    const inst = new TestEffects(api, of({ userId: null }), { connect: () => {} })
    const mod = mountEffects(storage, dispatcher, inst)
    await mod.start()

    await dispatcher.loadPosts({ ownerId: 'user' })
    await tick()

    expect(api.fetch).toHaveBeenCalledWith('user')
    expect(storage.getStateSync().list).toEqual([4, 1, 2])
    expect(storage.getStateSync().api.loadReq.status).toBe('success')

    mod.stop()
  })

  it('сервисы из конструктора доступны в замыкании (this.api) в момент исполнения', async () => {
    const api: Api = { fetch: vi.fn(() => [99]) }
    const inst = new TestEffects(api, of({ userId: null }), { connect: () => {} })
    const mod = mountEffects(storage, dispatcher, inst)
    await mod.start()

    await dispatcher.loadPosts({ ownerId: 'x' })
    await tick()

    expect(api.fetch).toHaveBeenCalled()
    expect(storage.getStateSync().list).toEqual([99])

    mod.stop()
  })

  it('внешний стор как конструкторный Observable (core$) — эффект реагирует на чужой стейт', async () => {
    const core$ = new BehaviorSubject<CoreState>({ userId: null })
    const seen: Array<string | null> = []
    const inst = new TestEffects({ fetch: () => [] }, core$, { connect: (u) => seen.push(u) })
    const mod = mountEffects(storage, dispatcher, inst)
    await mod.start()
    await tick()

    core$.next({ userId: 'u1' })
    core$.next({ userId: 'u1' }) // дубль — distinctUntilChanged отфильтрует
    core$.next({ userId: 'u2' })
    await tick()

    expect(seen).toEqual([null, 'u1', 'u2'])

    mod.stop()
  })

  it('ctx.external: экшен внешнего диспетчера ловится ofType (влит в action$)', async () => {
    const core = new CoreDispatcher(new MemoryStorage<CoreState>({ name: `core_${uid++}`, initialState: { userId: null } }))
    const api: Api = { fetch: vi.fn(() => []) }
    const inst = new LogoutEffects(api)
    const mod = mountEffects(storage, dispatcher, inst, { core })
    await mod.start()

    await core.logout()
    await tick()

    expect(api.fetch).toHaveBeenCalledWith('__logout__')

    mod.stop()
  })
})

describe('эффект, эмитящий функцию → функция вызывается', () => {
  it('emit функции исполняется EffectsModule', async () => {
    const sideEffect = vi.fn()
    class FnEffects extends Effects<State, TestDispatcher> {
      readonly e = this.effect((action$, _s, { dispatcher: d }) =>
        action$.pipe(
          ofType(d.ping),
          map(() => sideEffect),
        ),
      )
    }
    const mod = mountEffects(storage, dispatcher, new FnEffects())
    await mod.start()

    await dispatcher.ping()
    await tick()

    expect(sideEffect).toHaveBeenCalledTimes(1)
    mod.stop()
  })
})

describe('обработка ошибок', () => {
  it('ошибка в одном эффекте не убивает остальные', async () => {
    const survivor = vi.fn()
    class MixedEffects extends Effects<State, TestDispatcher> {
      readonly boom = this.effect(
        () =>
          new Observable(() => {
            throw new Error('boom')
          }),
      )
      readonly ok = this.effect((action$, _s, { dispatcher: d }) =>
        action$.pipe(
          ofType(d.ping),
          tap(() => survivor()),
        ),
      )
    }
    const mod = mountEffects(storage, dispatcher, new MixedEffects())
    await mod.start()

    await dispatcher.ping()
    await tick()

    expect(survivor).toHaveBeenCalledTimes(1)
    mod.stop()
  })

  it('resubscribeOnError: поток переподписывается, лимит ретраев соблюдается', async () => {
    let subscribeCount = 0
    const survivor = vi.fn()
    class RetryEffects extends Effects<State, TestDispatcher> {
      readonly flaky = this.effect(
        () =>
          new Observable(() => {
            subscribeCount++
            throw new Error('flaky')
          }),
        { resubscribeOnError: { count: 2 } },
      )
      readonly ok = this.effect((action$, _s, { dispatcher: d }) =>
        action$.pipe(
          ofType(d.ping),
          tap(() => survivor()),
        ),
      )
    }
    const mod = mountEffects(storage, dispatcher, new RetryEffects())
    await mod.start()

    // 1 первичная подписка + 2 ретрая = 3, потом терминальный catchError
    expect(subscribeCount).toBe(3)

    // сосед продолжает работать после исчерпания ретраев
    await dispatcher.ping()
    await tick()
    expect(survivor).toHaveBeenCalledTimes(1)

    mod.stop()
  })
})

describe('жизненный цикл', () => {
  it('stop()/start(): эффекты класса переподписываются корректно', async () => {
    const api: Api = { fetch: vi.fn(() => [1]) }
    const inst = new TestEffects(api, of({ userId: null }), { connect: () => {} })
    const mod = mountEffects(storage, dispatcher, inst)

    await mod.start()
    await dispatcher.loadPosts({ ownerId: 'a' })
    await tick()
    expect(api.fetch).toHaveBeenCalledTimes(1)

    mod.stop()
    await dispatcher.loadPosts({ ownerId: 'b' }) // во время stop — игнорируется
    await tick()
    expect(api.fetch).toHaveBeenCalledTimes(1)

    await mod.start()
    await dispatcher.loadPosts({ ownerId: 'c' })
    await tick()
    expect(api.fetch).toHaveBeenCalledTimes(2)

    mod.stop()
  })

  it('onDestroy объявляется как override и вызывается потребителем (сборщик — этап 4)', async () => {
    const inst = new TestEffects({ fetch: () => [] }, of({ userId: null }), { connect: () => {} })
    expect(typeof inst.onDestroy).toBe('function')

    // Сборщик вызовет onDestroy при synapse.destroy(); проверяем контракт напрямую.
    await inst.onDestroy?.()
    expect(inst.onDestroy).toHaveBeenCalledTimes(1)
  })
})

describe('совместимость и реестр', () => {
  it('getEffects() сохраняет порядок объявления полей', () => {
    const inst = new TestEffects({ fetch: () => [] }, of({ userId: null }), { connect: () => {} })
    expect(inst.getEffects()).toHaveLength(2)
  })

  it('смешанный массив [инстанс.getEffects(), legacyFn] — оба работают', async () => {
    const legacyHit = vi.fn()
    const legacy: Effect<State, TestDispatcher> = (action$, _s, { dispatcher }) =>
      action$.pipe(
        ofType((dispatcher as TestDispatcher).ping),
        tap(() => legacyHit()),
      )

    const api: Api = { fetch: vi.fn(() => [7]) }
    const inst = new TestEffects(api, of({ userId: null }), { connect: () => {} })
    const mod = mountEffects(storage, dispatcher, inst, {}, [legacy])
    await mod.start()

    await dispatcher.ping()
    await dispatcher.loadPosts({ ownerId: 'z' })
    await tick()

    expect(legacyHit).toHaveBeenCalledTimes(1)
    expect(storage.getStateSync().list).toEqual([7])

    mod.stop()
  })

  it('юнит-тестируемость эффекта в изоляции: рецепт вызывается напрямую с фейковым ctx', async () => {
    const api: Api = { fetch: vi.fn(() => [3, 4]) }
    const inst = new TestEffects(api, of({ userId: null }), { connect: () => {} })
    dispatcher[FINALIZE]()

    const action$ = of({ type: dispatcher.loadPosts.actionType, payload: { ownerId: 'iso' } } as any)
    const out$ = inst.loadPosts(action$, of(initial()), { dispatcher, external: {} as any })

    await new Promise<void>((resolve) => out$.subscribe({ complete: resolve }))

    expect(api.fetch).toHaveBeenCalledWith('iso')
    expect(storage.getStateSync().list).toEqual([3, 4])
  })
})

describe('dev-проверки', () => {
  it('предупреждает о поле-функции без обёртки this.effect', () => {
    const warn = vi.spyOn(loggerConsole, 'warn').mockImplementation(() => {})
    class ForgotEffects extends Effects<State, TestDispatcher> {
      readonly real = this.effect(() => EMPTY)
      // забыл this.effect — обычная функция-поле
      readonly forgot = (action$: Observable<any>) => action$
    }
    new ForgotEffects().getEffects()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('forgot'), expect.anything())
    warn.mockRestore()
  })
})

describe('строгая типизация (компилируемые type-тесты)', () => {
  it('ctx.dispatcher и ctx.external выводятся из generic-слотов', () => {
    class TypedEffects extends Effects<State, TestDispatcher, { core: CoreDispatcher }> {
      readonly e = this.effect((_a, _s, ctx) => {
        expectTypeOf(ctx.dispatcher).toEqualTypeOf<TestDispatcher>()
        expectTypeOf(ctx.external).toEqualTypeOf<{ core: CoreDispatcher }>()
        return EMPTY
      })
    }
    expect(new TypedEffects().getEffects()).toHaveLength(1)
  })
})
