import type { Observable } from 'rxjs'

import type { IStorage } from '../../core'
import type { Action, DispatchFunction, EnhancedMiddleware, WatcherFunction } from './dispatcher.module'
import { DispatcherCore } from './dispatcher.module'
import { resolvePath, setByPath } from './path.util'
import { type ApiRequestState, ApiStatus } from './standalone'

/**
 * Маркер метода финализации диспетчера.
 *
 * Имя экшена/вотчера берётся из имени поля класса, но прочитать имена полей можно
 * только ПОСЛЕ полного конструирования инстанса (инициализаторы полей derived-класса
 * выполняются после конструктора базового класса). Поэтому имена назначаются отдельным
 * шагом-финализацией:
 *
 * 1. **Сборщик `createSynapse(factory)`** вызывает `dispatcher[FINALIZE]()` до старта
 *    эффектов (эффекты читают `actionType` при сборке пайплайна).
 * 2. **Ленивая само-финализация** — страховка для standalone-использования и тестов:
 *    первый dispatch экшена или первое обращение к реестру `dispatch`/`watchers`
 *    финализирует инстанс, если это ещё не сделано.
 */
export const FINALIZE = Symbol('synapse.dispatcher.finalize')

/**
 * Внутренний маркер «продукта фабрики» на функции экшена/вотчера.
 * `_type` уже выставляется движком (`DispatcherCore.createAction/createWatcher`),
 * здесь — те же значения, что и у движка.
 */
type FactoryKind = 'dispatch' | 'watchers'

/** Имена членов базового класса, которые нельзя переопределять полями-экшенами. */
const RESERVED_NAMES = new Set(['storage', 'action$', 'actions', 'dispatch', 'watchers', 'use', 'destroy'])

/**
 * Вызываемая группа жизненного цикла API-запроса.
 *
 * Сам вызов группы — это `init` (намерение): сбрасывает статус в `idle` и пробрасывает
 * payload намерения дальше эффектам. Жизненный цикл — через методы-поля.
 *
 * `ofType(d.loadPosts)` ловит ТОЛЬКО init; чтобы среагировать на успех —
 * `ofType(d.loadPosts.success)`.
 */
export interface ApiActions<TInitPayload = void> extends DispatchFunction<TInitPayload, TInitPayload> {
  loading: DispatchFunction<void, void>
  success: DispatchFunction<void, void>
  failure: DispatchFunction<string, void>
  reset: DispatchFunction<void, void>
}

/**
 * Keyed-вариант: статус хранится по ключу. `init`/`loading`/`success`/`reset` принимают
 * `key`, `failure` — `{ key, error }`.
 */
export interface KeyedApiActions<TInitPayload extends { key: string } = { key: string }> extends DispatchFunction<TInitPayload, TInitPayload> {
  loading: DispatchFunction<string, string>
  success: DispatchFunction<string, string>
  failure: DispatchFunction<{ key: string; error: string }, { key: string; error: string }>
  reset: DispatchFunction<string, string>
}

/** Опции конструктора базового диспетчера. */
export interface DispatcherBaseOptions<TState extends Record<string, any>> {
  middlewares?: EnhancedMiddleware<TState>[]
}

/** Внутренняя форма фабричной обёртки. */
interface Wrapper {
  (params?: any): any
  _type: FactoryKind
  /** Реальная функция движка, на которую делегирует обёртка. */
  _inner: any
  /** Для API-групп: вложенные lifecycle-обёртки. */
  _apiGroup?: Record<string, Wrapper>
}

function isWrapper(value: unknown): value is Wrapper {
  return typeof value === 'function' && ((value as any)._type === 'dispatch' || (value as any)._type === 'watchers')
}

/**
 * Публичный class-based слой диспетчера. Экшены объявляются как поля класса через
 * фабрики `this.action` / `this.signal` / `this.apiActions` / `this.keyedApiActions`
 * / `this.watcher`. Имя экшена = имя поля.
 *
 * Внутреннее состояние базы — hard-private (`#`-поля/методы): их имена в отдельном
 * namespace и НЕ конфликтуют с полями-экшенами подкласса. Запрещённые имена экшенов —
 * только `protected`/публичная поверхность из `RESERVED_NAMES`.
 *
 * @example
 * ```ts
 * class PostsDispatcher extends Dispatcher<PostsState> {
 *   readonly loadPosts = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)
 *   readonly mounted   = this.signal<FeedLifecyclePayload>('Лента смонтирована')
 *   readonly applyPosts = this.action((store, page: PostsFeedResponseDto) =>
 *     store.update((s) => { s.list = page.data }))
 * }
 * ```
 */
export abstract class Dispatcher<TState extends Record<string, any>> {
  protected readonly storage: IStorage<TState>

  /** Движок, поверх которого работает class-слой. */
  readonly #core: DispatcherCore<TState>

  /** Реестры по имени (наполняются при финализации). Делят ссылку с движком. */
  readonly #dispatch: Record<string, DispatchFunction<any, any>>
  readonly #watchers: Record<string, WatcherFunction<any>>

  #finalized = false

  /** Поток всех экшенов модуля (его потребляет EffectsModule). */
  readonly action$: Observable<Action>

  constructor(storage: IStorage<TState>, options?: DispatcherBaseOptions<TState>) {
    this.storage = storage
    this.#core = new DispatcherCore<TState>({ storage, middlewares: options?.middlewares })
    this.#dispatch = this.#core.dispatch
    this.#watchers = this.#core.watchers
    this.action$ = this.#core.actions
  }

  // ── Публичные реестры: обращение к ним финализирует (страховка) ──────────────

  /** Реестр экшенов по имени — для middleware/devtools. */
  get dispatch(): Record<string, DispatchFunction<any, any>> {
    this.#ensureFinalized()
    return this.#dispatch
  }

  get watchers(): Record<string, WatcherFunction<any>> {
    this.#ensureFinalized()
    return this.#watchers
  }

  /** Алиас потока экшенов для совместимости с EffectsModule (`dispatcher.actions`). */
  get actions(): Observable<Action> {
    return this.action$
  }

  // ── Фабрики для class fields ─────────────────────────────────────────────────

  /**
   * Экшен: handler в «рецептной» сигнатуре `(storage, params) => result`.
   * payload экшена = возвращаемое значение handler'а.
   */
  protected action<TParams = void, TResult = void>(
    handler: (storage: IStorage<TState>, params: TParams) => TResult | Promise<TResult>,
    options?: {
      type?: string
      meta?: Record<string, any>
      memoize?: (cur: TParams, prev: TParams, prevResult: TResult) => boolean
    },
  ): DispatchFunction<TParams, TResult> {
    const inner = this.#core.createAction<TParams, TResult>(
      {
        type: options?.type,
        meta: options?.meta,
        action: (params: TParams) => handler(this.storage, params),
      },
      options?.memoize ? { memoize: options.memoize } : undefined,
    )
    return this.#wrapDispatch(inner) as unknown as DispatchFunction<TParams, TResult>
  }

  /** Чистый сигнал: `(_store, p) => p`. `description` уходит в meta. */
  protected signal<TPayload = void>(description?: string): DispatchFunction<TPayload, TPayload> {
    return this.action<TPayload, TPayload>((_storage, payload) => payload, description ? { meta: { description } } : undefined)
  }

  /** Вызываемая группа жизненного цикла API-запроса. Сам вызов = init (намерение). */
  protected apiActions<TInitPayload = void>(accessor: (state: TState) => ApiRequestState): ApiActions<TInitPayload> {
    const path = resolvePath(accessor)
    const write = (storage: IStorage<TState>, request: ApiRequestState) => storage.update((s) => setByPath(s, path, request))

    const init = this.action<TInitPayload, TInitPayload>((storage, payload) => {
      write(storage, { status: ApiStatus.Idle, error: null })
      return payload
    }) as ApiActions<TInitPayload>

    init.loading = this.action((storage) => write(storage, { status: ApiStatus.Loading, error: null }))
    init.success = this.action((storage) => write(storage, { status: ApiStatus.Success, error: null }))
    init.failure = this.action<string, void>((storage, error) => write(storage, { status: ApiStatus.Error, error }))
    init.reset = this.action((storage) => write(storage, { status: ApiStatus.Reset, error: null }))

    return this.#markApiGroup(init)
  }

  /** То же для статусов по ключу (`Record<string, ApiRequestState>`). */
  protected keyedApiActions<TInitPayload extends { key: string } = { key: string }>(accessor: (state: TState) => Record<string, ApiRequestState>): KeyedApiActions<TInitPayload> {
    const path = resolvePath(accessor)
    const write = (storage: IStorage<TState>, key: string, request: ApiRequestState) => storage.update((s) => setByPath(s, [...path, key], request))

    const init = this.action<TInitPayload, TInitPayload>((storage, payload) => {
      write(storage, payload.key, { status: ApiStatus.Idle, error: null })
      return payload
    }) as KeyedApiActions<TInitPayload>

    init.loading = this.action<string, string>((storage, key) => {
      write(storage, key, { status: ApiStatus.Loading, error: null })
      return key
    })
    init.success = this.action<string, string>((storage, key) => {
      write(storage, key, { status: ApiStatus.Success, error: null })
      return key
    })
    init.reset = this.action<string, string>((storage, key) => {
      write(storage, key, { status: ApiStatus.Reset, error: null })
      return key
    })
    init.failure = this.action<{ key: string; error: string }, { key: string; error: string }>((storage, payload) => {
      write(storage, payload.key, { status: ApiStatus.Error, error: payload.error })
      return payload
    })

    return this.#markApiGroup(init)
  }

  protected watcher<R>(config: {
    selector: (state: TState) => R
    shouldTrigger?: (prev: R | undefined, current: R) => boolean
    notifyAfterSubscribe?: boolean
    type?: string
    meta?: Record<string, any>
  }): WatcherFunction<R> {
    const inner = this.#core.createWatcher<R>(config)
    return this.#wrapWatcher(inner) as unknown as WatcherFunction<R>
  }

  // ── Жизненный цикл ───────────────────────────────────────────────────────────

  use(...middlewares: EnhancedMiddleware<TState>[]): this {
    this.#core.use(...middlewares)
    return this
  }

  destroy(): void {
    // Движок отпишет вотчеры (реестр общий) и завершит action$.
    this.#core.destroy()
  }

  /**
   * Финализация: скан own enumerable полей, назначение имён (`_assignType(имя поля)`)
   * и регистрация в реестрах `dispatch`/`watchers`. Идемпотентна.
   */
  [FINALIZE](): void {
    if (this.#finalized) return
    this.#finalized = true

    // Для детекции полей-алиасов (одна функция под двумя именами).
    const seen = new Map<Wrapper, string>()

    for (const [name, value] of Object.entries(this)) {
      if (!isWrapper(value)) continue

      if (RESERVED_NAMES.has(name)) {
        throw new Error(`Dispatcher: поле "${name}" конфликтует с зарезервированным членом базового класса. Переименуйте экшен.`)
      }

      if (seen.has(value)) {
        throw new Error(`Dispatcher: поле "${name}" является алиасом поля "${seen.get(value)}" — один экшен не может иметь два имени. Объявите отдельный экшен.`)
      }
      seen.set(value, name)

      if (value._apiGroup) {
        this.#finalizeApiGroup(name, value)
      } else if (value._type === 'watchers') {
        this.#finalizeNamed(name, value, this.#watchers)
      } else {
        this.#finalizeNamed(name, value, this.#dispatch)
      }
    }
  }

  // ── Внутреннее ───────────────────────────────────────────────────────────────

  #ensureFinalized(): void {
    if (!this.#finalized) this[FINALIZE]()
  }

  /** Назначает имя через `_assignType` (если тип не был задан явно) и регистрирует обёртку. */
  #finalizeNamed(name: string, wrapper: Wrapper, registry: Record<string, any>): void {
    if (typeof wrapper._inner._assignType === 'function') {
      wrapper._inner._assignType(name)
    }
    registry[name] = wrapper
  }

  #finalizeApiGroup(name: string, init: Wrapper): void {
    this.#finalizeNamed(name, init, this.#dispatch)
    const group = init._apiGroup!
    this.#finalizeNamed(`${name}:loading`, group.loading, this.#dispatch)
    this.#finalizeNamed(`${name}:success`, group.success, this.#dispatch)
    this.#finalizeNamed(`${name}:failure`, group.failure, this.#dispatch)
    this.#finalizeNamed(`${name}:reset`, group.reset, this.#dispatch)
  }

  #markApiGroup<T extends DispatchFunction<any, any>>(init: T): T {
    const w = init as unknown as Wrapper
    w._apiGroup = {
      loading: (init as any).loading,
      success: (init as any).success,
      failure: (init as any).failure,
      reset: (init as any).reset,
    }
    return init
  }

  /**
   * Оборачивает функцию-экшен движка: на первый вызов лениво финализирует диспетчер,
   * затем делегирует. `actionType`/`meta` форвардятся «вживую» (значение появляется
   * после `_assignType` при финализации).
   */
  #wrapDispatch(inner: DispatchFunction<any, any>): Wrapper {
    const wrapper = ((params?: any) => {
      this.#ensureFinalized()
      return inner(params)
    }) as Wrapper
    wrapper._type = 'dispatch'
    wrapper._inner = inner
    Object.defineProperty(wrapper, 'actionType', { get: () => inner.actionType, enumerable: true, configurable: true })
    Object.defineProperty(wrapper, 'meta', { get: () => inner.meta, enumerable: true, configurable: true })
    return wrapper
  }

  #wrapWatcher(inner: WatcherFunction<any>): Wrapper {
    const wrapper = (() => {
      this.#ensureFinalized()
      return inner()
    }) as unknown as Wrapper
    wrapper._type = 'watchers'
    wrapper._inner = inner
    Object.defineProperty(wrapper, 'actionType', { get: () => inner.actionType, enumerable: true, configurable: true })
    Object.defineProperty(wrapper, 'meta', { get: () => inner.meta, enumerable: true, configurable: true })
    Object.defineProperty(wrapper, 'unsubscribe', { value: () => inner.unsubscribe(), enumerable: true, configurable: true })
    return wrapper
  }
}
