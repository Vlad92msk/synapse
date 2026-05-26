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
 * Состояние API-запроса для createApiActions
 */
export interface ApiRequestState {
  status: 'idle' | 'loading' | 'success' | 'error' | 'reset'
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
 * ```
 */
export function createApiActions<TState extends Record<string, any>>(
  accessor: (draft: TState) => ApiRequestState,
) {
  const path = resolvePath(accessor)
  const action = defineAction<TState>()

  const update = (storage: IStorage<TState>, request: ApiRequestState) => {
    storage.update((s) => setByPath(s, path, request))
  }

  return {
    init: action({
      action: (storage) => update(storage, { status: 'idle', error: null }),
    }),

    loading: action({
      action: (storage) => update(storage, { status: 'loading', error: null }),
    }),

    success: action({
      action: (storage) => update(storage, { status: 'success', error: null }),
    }),

    failure: action({
      action: (storage, error: string) => update(storage, { status: 'error', error }),
    }),

    reset: action({
      action: (storage) => update(storage, { status: 'reset', error: null }),
    }),
  }
}
