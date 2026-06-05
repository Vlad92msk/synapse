import type { IStorage } from '../../core'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Параметры исполнения действия (мемоизация)
 */
export interface ActionExecutionOptions<TParams, TResult> {
  memoize?: (currentArgs: TParams, previousArgs: TParams, previousResult: TResult) => boolean
}

/**
 * Рецепт действия — standalone-определение, не привязанное к хранилищу.
 * Привязывается к storage при регистрации в createDispatcher.
 */
export interface ActionRecipe<TState extends Record<string, any>, TParams, TResult> {
  readonly _type: 'action-recipe'
  readonly _config: {
    action: (storage: IStorage<TState>, params: TParams) => Promise<TResult> | TResult
    meta?: Record<string, any>
  }
  readonly _executionOptions?: ActionExecutionOptions<TParams, TResult>
}

/**
 * Рецепт watcher'а — standalone-определение, не привязанное к хранилищу.
 */
export interface WatcherRecipe<TState extends Record<string, any>, R> {
  readonly _type: 'watcher-recipe'
  readonly _config: {
    selector: (state: TState) => R
    meta?: Record<string, any>
    shouldTrigger?: (prev: R | undefined, current: R) => boolean
    notifyAfterSubscribe?: boolean
  }
}

/**
 * Статусы жизненного цикла API-запроса.
 *
 * Сделано const-объектом (а не TS `enum`) намеренно: значения остаются обычными
 * строковыми литералами, поэтому `ApiStatus.Loading` и строка `'loading'`
 * взаимозаменяемы и тип обратно совместим с прежним строковым union'ом. С `enum`
 * это не так — его член не присваивается к литералу и наоборот.
 *
 * `ApiStatus` — одновременно значение (для `ApiStatus.Loading` в коде) и тип
 * (union всех статусов).
 */
export const ApiStatus = {
  Idle: 'idle',
  Loading: 'loading',
  Success: 'success',
  Error: 'error',
  Reset: 'reset',
} as const

export type ApiStatus = (typeof ApiStatus)[keyof typeof ApiStatus]

/**
 * Состояние API-запроса для createApiActions / createKeyedApiActions
 */
export interface ApiRequestState {
  status: ApiStatus
  error: string | null
}

// ────────────────────────────────────────────────────────────────────────────
// defineAction
// ────────────────────────────────────────────────────────────────────────────

/**
 * Создаёт standalone-определение действия.
 * Фиксирует TState через первый вызов, TParams/TResult инферятся из action.
 *
 * @example
 * ```ts
 * const action = defineAction<MyState>()
 *
 * export const increment = action({
 *   action: (storage, amount: number) => {
 *     storage.update((s) => { s.count += amount })
 *     return amount
 *   },
 * })
 *
 * // Void action (без параметров и возврата):
 * export const reset = action({
 *   action: (storage) => {
 *     storage.update((s) => { s.count = 0 })
 *   },
 * })
 * ```
 */
export function defineAction<TState extends Record<string, any>>() {
  return <TParams = void, TResult = void>(
    config: {
      action: (storage: IStorage<TState>, params: TParams) => Promise<TResult> | TResult
      meta?: Record<string, any>
    },
    executionOptions?: ActionExecutionOptions<TParams, TResult>,
  ): ActionRecipe<TState, TParams, TResult> => ({
    _type: 'action-recipe' as const,
    _config: config,
    _executionOptions: executionOptions,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// defineWatcher
// ────────────────────────────────────────────────────────────────────────────

/**
 * Создаёт standalone-определение watcher'а.
 *
 * @example
 * ```ts
 * export const watchCount = defineWatcher<MyState>()({
 *   selector: (s) => s.items.length,
 *   notifyAfterSubscribe: true,
 * })
 * ```
 */
export function defineWatcher<TState extends Record<string, any>>() {
  return <R>(config: {
    selector: (state: TState) => R
    meta?: Record<string, any>
    shouldTrigger?: (prev: R | undefined, current: R) => boolean
    notifyAfterSubscribe?: boolean
  }): WatcherRecipe<TState, R> => ({
    _type: 'watcher-recipe' as const,
    _config: config,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// createApiActions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Вычисляет путь к свойству через Proxy-перехват обращений.
 */
function resolvePath<T>(accessor: (draft: T) => any): string[] {
  const path: string[] = []
  const handler: ProxyHandler<any> = {
    get(_, prop) {
      if (typeof prop === 'string') {
        path.push(prop)
      }
      return new Proxy({}, handler)
    },
  }
  accessor(new Proxy({}, handler) as T)
  return path
}

/**
 * Записывает значение по пути в объекте.
 */
function setByPath(obj: any, path: string[], value: any): void {
  let current = obj
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]]
  }
  current[path[path.length - 1]] = value
}

/**
 * Создаёт набор шаблонных lifecycle-действий для API-запроса.
 * Accessor указывает на поле ApiRequestState в стейте — путь вычисляется автоматически.
 *
 * @param accessor - Функция-accessor, указывающая на поле ApiRequestState в стейте
 *
 * @typeParam TInitPayload - Тип payload'а `init`-экшена. По умолчанию `void`
 *   (init без параметров). Если задать — `init` принимает payload и возвращает
 *   его, что удобно для intent-паттерна: эффект слушает `init` и читает payload
 *   намерения (target, фильтры и т.п.), а статус при этом сбрасывается в `idle`.
 *
 * @example
 * ```ts
 * const listRequest = createApiActions<MyState>(
 *   (draft) => draft.api.listRequest
 * )
 *
 * // В dispatcher:
 * createDispatcher({ storage }, {
 *   loadListInit:    listRequest.init,
 *   loadListLoading: listRequest.loading,
 *   loadListSuccess: listRequest.success,
 *   loadListFailure: listRequest.failure,
 *   loadListReset:   listRequest.reset,
 * })
 *
 * // init с payload (intent): эффект получит { entityId } из возврата экшена.
 * const usersReq = createApiActions<MyState, { entityId: string }>(
 *   (draft) => draft.api.usersRequest
 * )
 * ```
 */
export function createApiActions<TState extends Record<string, any>, TInitPayload = void>(accessor: (draft: TState) => ApiRequestState) {
  const path = resolvePath(accessor)
  const action = defineAction<TState>()

  const update = (storage: IStorage<TState>, request: ApiRequestState) => {
    storage.update((s) => setByPath(s, path, request))
  }

  return {
    init: action<TInitPayload, TInitPayload>({
      // Сбрасываем статус в idle и пробрасываем payload намерения дальше (эффектам).
      action: (storage, payload: TInitPayload) => {
        update(storage, { status: ApiStatus.Idle, error: null })
        return payload
      },
    }),

    loading: action({
      action: (storage) => update(storage, { status: ApiStatus.Loading, error: null }),
    }),

    success: action({
      action: (storage) => update(storage, { status: ApiStatus.Success, error: null }),
    }),

    failure: action({
      action: (storage, error: string) => update(storage, { status: ApiStatus.Error, error }),
    }),

    reset: action({
      action: (storage) => update(storage, { status: ApiStatus.Reset, error: null }),
    }),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// createKeyedApiActions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Keyed-вариант createApiActions: статус хранится ПО КЛЮЧУ в `Record<string,
 * ApiRequestState>`, а не один на весь запрос. Нужен, когда один и тот же запрос
 * летит параллельно для нескольких независимых ключей и у каждого свой
 * loading/error: комменты по таргетам, детали сущностей по id, per-row действия
 * в таблице/ленте, пагинация по секциям — всё, что лежит как `Record<key, data>`.
 *
 * Все статус-экшены принимают `key` (и возвращают его — удобно эффектам), кроме
 * `failure`, который принимает `{ key, error }`. Записи мутируются иммутабельно
 * по одному ключу — соседние ключи (их срезы) по ссылке не затрагиваются, что и
 * нужно для гранулярной изоляции ре-рендеров (см. useKeyedSliceSelector).
 *
 * @param accessor - Функция-accessor, указывающая на поле `Record<string, ApiRequestState>`
 *
 * @example
 * ```ts
 * const commentsReq = createKeyedApiActions<MyState>((d) => d.api.commentsRequest)
 *
 * createDispatcher({ storage }, {
 *   commentsInit:    commentsReq.init,     // (key) => key
 *   commentsLoading: commentsReq.loading,  // (key) => key
 *   commentsSuccess: commentsReq.success,  // (key) => key
 *   commentsFailure: commentsReq.failure,  // ({ key, error })
 *   commentsReset:   commentsReq.reset,    // (key) => key
 * })
 * ```
 */
export function createKeyedApiActions<TState extends Record<string, any>>(accessor: (draft: TState) => Record<string, ApiRequestState>) {
  const path = resolvePath(accessor)
  const action = defineAction<TState>()

  const write = (storage: IStorage<TState>, key: string, request: ApiRequestState) => {
    // [...path, key] → setByPath доходит до самого Record и кладёт значение по ключу
    storage.update((s) => setByPath(s, [...path, key], request))
  }

  const writer = (status: ApiStatus) =>
    action<string, string>({
      action: (storage, key: string) => {
        write(storage, key, { status, error: null })
        return key
      },
    })

  return {
    init: writer(ApiStatus.Idle),
    loading: writer(ApiStatus.Loading),
    success: writer(ApiStatus.Success),
    reset: writer(ApiStatus.Reset),

    failure: action<{ key: string; error: string }, { key: string; error: string }>({
      action: (storage, payload: { key: string; error: string }) => {
        write(storage, payload.key, { status: ApiStatus.Error, error: payload.error })
        return payload
      },
    }),
  }
}
