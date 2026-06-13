import { Observable, share, Subject } from 'rxjs'

import { handleCallbackError } from '../../_utils/error-handling.util'
import type { IStorage } from '../../core'
import { TypedAction } from '../effects'
import type { ActionExecutionOptions, ActionRecipe, WatcherRecipe } from './standalone'

/**
 * Расширенное API для middleware
 */
export interface EnhancedMiddlewareAPI<T extends Record<string, any>> {
  // Базовые возможности
  getState: () => T | Promise<T>
  dispatch: (action: Action) => Promise<any>

  // Доступ к хранилищу напрямую
  storage: IStorage<T>

  // Доступ к потоку действий
  actions$: Observable<Action>

  // Доступ к зарегистрированным действиям
  actions: Record<string, DispatchFunction<any, any>>

  // Доступ к зарегистрированным наблюдателям
  watchers: Record<string, WatcherFunction<any>>

  // Вспомогательные методы
  findActionByType: (actionType: string) => DispatchFunction<any, any> | undefined
  findWatcherByType: (actionType: string) => WatcherFunction<any> | undefined
}

/**
 * Расширенное определение middleware
 */
export interface EnhancedMiddleware<T extends Record<string, any> = any> {
  (api: EnhancedMiddlewareAPI<T>): (next: (action: Action) => Promise<any>) => (action: Action) => Promise<any>
}

/**
 * Базовая структура действия
 */
export interface Action<T = unknown> {
  type: string
  payload?: T
  meta?: Record<string, any>
}

// ActionExecutionOptions импортирован из ./standalone

/**
 * Параметры для создания действия
 */
export interface ActionDefinition<TParams, TResult> {
  /** Тип действия для идентификации в потоке и эффектах. Если не указан — будет выведен из имени ключа в createDispatcher */
  type?: string
  /** Функция, выполняющая действие и возвращающая результат (payload) */
  action: (params: TParams) => Promise<TResult> | TResult
  /** Дополнительные метаданные (опционально) */
  meta?: Record<string, any>
}

/**
 * Определение типа для watcher'а
 */
interface WatcherDefinition<T, R> {
  /** Тип watcher'а для идентификации в потоке. Если не указан — будет выведен из имени ключа в createDispatcher */
  type?: string
  selector: (state: T) => R
  meta?: Record<string, any>
  // Опционально - функция для определения, изменилось ли значение
  shouldTrigger?: (prev: R | undefined, current: R) => boolean
  // Эмитить текущее значение при подписке
  notifyAfterSubscribe?: boolean
}

/**
 * Тип для функции watcher
 */
export interface WatcherFunction<R> {
  (): Observable<TypedAction<R>>
  actionType: string
  meta?: Record<string, any>
  unsubscribe: VoidFunction
}

/**
 * Расширенный тип для функции настройки действий с поддержкой дополнительных утилит
 */
export type ActionsSetupWithUtils<T extends Record<string, any>> = (
  storage: IStorage<T>,
  utils: {
    createAction: ActionCreatorFactory
    createWatcher: <R>(config: WatcherDefinition<T, R>) => WatcherFunction<R>
  },
) => Record<string, DispatchFunction<any, any> | WatcherFunction<any> | ActionRecipe<T, any, any> | WatcherRecipe<T, any>>

/**
 * Расширенная функция диспетчеризации
 */
export interface DispatchFunction<TParams, TResult> {
  /** Функция для вызова действия с параметрами */
  (params: TParams): Promise<TResult>
  /** Тип действия для использования в эффектах */
  actionType: string
  /** Метаданные действия */
  meta?: Record<string, any>
  /** Внутренний тип для идентификации */
  _type?: 'dispatch' | 'watchers'
}

/**
 * Тип для фабрики создателей действий
 */
type ActionCreatorFactory = <TParams = void, TResult = void>(
  config: ActionDefinition<TParams, TResult>,
  executionOptions?: ActionExecutionOptions<TParams, TResult>,
) => DispatchFunction<TParams, TResult>

/**
 * Извлекает тип результата из функции диспетчера
 */
export type ExtractResultType<T> = T extends DispatchFunction<any, infer R> ? R : never

/**
 * Извлекает типы из функции настройки действий
 */
export type ActionsResult<F> = F extends (create: ActionCreatorFactory, storage: any, ...args: any[]) => infer R ? R : Record<string, DispatchFunction<any, any>>

/**
 * Типизированный объект действий
 */
type ResolveDispatch<T> = T extends DispatchFunction<any, any> ? T : T extends ActionRecipe<any, infer P, infer R> ? DispatchFunction<P, R> : never

export type DispatchActions<T> = {
  [K in keyof T]: ResolveDispatch<T[K]>
}

/**
 * Типизированный объект watchers
 */
type ResolveWatcher<T> = T extends WatcherFunction<any> ? T : T extends WatcherRecipe<any, infer R> ? WatcherFunction<R> : never

export type WatcherActions<T> = {
  [K in keyof T]: ResolveWatcher<T[K]>
}

/**
 * Параметры для Dispatcher
 */
interface DispatcherOptions<T extends Record<string, any>> {
  // Хранилище - обязательный параметр
  storage: IStorage<T>
  // DispatcherMiddleware для обработки действий
  middlewares?: EnhancedMiddleware<T>[]
}

/**
 * Внутренний движок диспетчера для интеграции хранилищ с реактивной системой.
 *
 * Прежнее имя — `Dispatcher`. Переименован в `DispatcherCore`, поскольку публичным
 * `Dispatcher` теперь является abstract class-based слой (`dispatcher.base.ts`),
 * который строится поверх этого движка. `createDispatcher` продолжает работать
 * поверх `DispatcherCore` без изменений.
 */
export class DispatcherCore<T extends Record<string, any>, TActionsFn extends ActionsSetupWithUtils<T> = ActionsSetupWithUtils<T>> {
  // Поток действий
  private actions$ = new Subject<Action>()

  // Публичный Observable для действий
  public readonly actions: Observable<Action> = this.actions$.asObservable()

  // Методы диспетчеризации действий с типизацией
  public dispatch: Record<string, DispatchFunction<any, any>> = {}

  // Watcher'ы для реактивной подписки на изменения
  public watchers: Record<string, WatcherFunction<any>> = {}

  // Ссылка на хранилище
  private storage: IStorage<T>

  // Только один массив для хранения инициализированных middleware
  private middlewareFunctions: Array<(next: (action: Action) => Promise<any>) => (action: Action) => Promise<any>> = []

  // Pre-built middleware chain (null if no middlewares)
  private dispatchChain: ((action: Action) => Promise<any>) | null = null

  // Registry of action executors by action type
  private actionRegistry = new Map<string, { action: (params: any) => Promise<any> | any }>()

  // Temporary storage for passing params through middleware chain without polluting action object
  private actionParams = new WeakMap<object, any>()

  // API для инициализации middleware
  private middlewareAPI: EnhancedMiddlewareAPI<T>

  /**
   * Создает новый экземпляр Dispatcher
   */
  constructor(options: DispatcherOptions<T>) {
    this.storage = options.storage

    // Создаем API для middleware сразу
    this.middlewareAPI = {
      getState: () => this.storage.getState(),
      dispatch: (action: Action) => this.executeChain(action),
      storage: this.storage,
      actions$: this.actions,
      actions: this.dispatch,
      watchers: this.watchers,
      findActionByType: (type) => this.findActionByType(type),
      findWatcherByType: (type) => this.findWatcherByType(type),
    }

    // Если есть middleware в options, добавляем их
    if (options.middlewares && options.middlewares.length > 0) {
      this.use(...options.middlewares)
    }
  }

  /**
   * Добавляет middleware в цепочку обработки
   */
  public use(...middlewares: EnhancedMiddleware<T>[]): this {
    // Инициализируем каждый middleware и добавляем только инициализированную версию
    for (let i = 0; i < middlewares.length; i++) {
      try {
        // Инициализируем middleware с API
        const initializedMiddleware = middlewares[i](this.middlewareAPI)
        this.middlewareFunctions.push(initializedMiddleware)
      } catch (error) {
        handleCallbackError(`Dispatcher: error initializing middleware [${i}]`, error)
      }
    }
    this.rebuildChain()
    return this
  }

  /**
   * Base executor: runs the registered action handler or passes through
   */
  private baseExecute = async (action: Action): Promise<any> => {
    // No params in WeakMap means this is a pass-through dispatch (via api.dispatch)
    if (!this.actionParams.has(action)) {
      return action.payload
    }

    const entry = this.actionRegistry.get(action.type)
    if (!entry) {
      return action.payload
    }

    const params = this.actionParams.get(action)
    return Promise.resolve(entry.action(params))
  }

  /**
   * Executes action through middleware chain and emits to actions$ (single emission point)
   */
  private async executeChain(action: Action): Promise<any> {
    const executor = this.dispatchChain ?? this.baseExecute
    const result = await executor(action)

    // Single emission point for all dispatches
    action.payload = result
    this.actionParams.delete(action)
    this.actions$.next(action)

    return result
  }

  /**
   * Rebuilds the pre-composed middleware chain. Called once on use(), not on every dispatch.
   */
  private rebuildChain(): void {
    if (this.middlewareFunctions.length === 0) {
      this.dispatchChain = null
      return
    }

    let chain = this.baseExecute as (action: Action) => Promise<any>
    for (let i = this.middlewareFunctions.length - 1; i >= 0; i--) {
      chain = this.middlewareFunctions[i](chain)
    }
    this.dispatchChain = chain
  }

  /**
   * Получает все действия с улучшенной типизацией
   */
  public getActions(): ActionsResult<TActionsFn> {
    return this.dispatch as ActionsResult<TActionsFn>
  }

  /**
   * Получает типизированные действия диспетчера
   */
  public getTypedDispatch<A extends Record<string, any>>(): DispatchActions<A> {
    return this.dispatch as DispatchActions<A>
  }

  /**
   * Получает типизированные watcher'ы
   */
  public getTypedWatchers<A extends Record<string, any>>(): WatcherActions<A> {
    return this.watchers as WatcherActions<A>
  }

  /**
   * Находит действие по типу
   */
  public findActionByType(actionType: string): DispatchFunction<any, any> | undefined {
    return Object.values(this.dispatch).find((action) => {
      return action.actionType.split(`[${this.storage.name}]`)[1] === actionType
    })
  }

  /**
   * Находит наблюдатель по типу
   */
  public findWatcherByType(actionType: string): WatcherFunction<any> | undefined {
    return Object.values(this.watchers).find((watcher) => {
      return watcher.actionType.split(`[${this.storage.name}]`)[1] === actionType
    })
  }

  /**
   * Уничтожает dispatcher: отписывает watchers, завершает поток действий, очищает состояние
   */
  public destroy(): void {
    Object.values(this.watchers).forEach((w) => w.unsubscribe())
    this.actions$.complete()
    this.dispatch = {}
    this.watchers = {}
    this.middlewareFunctions = []
    this.dispatchChain = null
    this.actionRegistry.clear()
  }

  /**
   * Создает действие
   */
  public createAction<TParams = void, TResult = void>(
    actionConfig: ActionDefinition<TParams, TResult>,
    executionOptions?: ActionExecutionOptions<TParams, TResult>,
  ): DispatchFunction<TParams, TResult> {
    const hasExplicitType = !!actionConfig.type
    let actionType = hasExplicitType ? `[${this.storage.name}]${actionConfig.type}` : ''

    // Register action executor in the registry (сразу, если тип известен)
    if (hasExplicitType) {
      this.actionRegistry.set(actionType, { action: actionConfig.action })
    }

    // Для мемоизации храним последние аргументы и результат
    let lastParams: TParams | undefined
    let lastResult: TResult | undefined
    let hasCached = false

    // Создаем функцию диспетчеризации
    const dispatchFn = async (params: TParams): Promise<TResult> => {
      if (!actionType) {
        throw new Error('Action type not assigned. Provide "type" in config or use within createDispatcher.')
      }

      // Проверяем мемоизацию
      if (executionOptions?.memoize && hasCached) {
        if (executionOptions.memoize(params, lastParams!, lastResult!)) {
          return lastResult!
        }
      }

      // Создаем объект действия
      const actionObject: Action<TResult> = {
        type: actionType,
        meta: actionConfig.meta,
      }

      // Store params for base executor to retrieve via WeakMap
      this.actionParams.set(actionObject, params)

      // Execute through middleware chain (includes single emission to actions$)
      const result = (await this.executeChain(actionObject)) as TResult

      // Сохраняем аргументы и результат для мемоизации
      lastParams = params
      lastResult = result
      hasCached = true

      return result
    }

    dispatchFn._type = 'dispatch'
    // Добавляем тип действия как свойство функции (configurable для deferred assignment)
    Object.defineProperty(dispatchFn, 'actionType', {
      value: actionType,
      writable: false,
      enumerable: true,
      configurable: true,
    })

    // Добавляем метаданные, если они есть
    if (actionConfig.meta) {
      Object.defineProperty(dispatchFn, 'meta', {
        value: actionConfig.meta,
        writable: false,
        enumerable: true,
      })
    }

    // Deferred type assignment — используется в createDispatcher для авто-генерации типа из имени ключа
    if (!hasExplicitType) {
      ;(dispatchFn as any)._assignType = (name: string) => {
        actionType = `[${this.storage.name}]${name}`

        this.actionRegistry.set(actionType, { action: actionConfig.action })

        Object.defineProperty(dispatchFn, 'actionType', {
          value: actionType,
          writable: false,
          enumerable: true,
          configurable: true,
        })
      }
    }

    return dispatchFn as DispatchFunction<TParams, TResult>
  }
  /**
   * Создает watcher для отслеживания изменений в хранилище
   */
  public createWatcher<R>(config: WatcherDefinition<T, R>): WatcherFunction<R> {
    const hasExplicitType = !!config.type
    let actionType = hasExplicitType ? `[${this.storage.name}]${config.type}` : ''

    // Lazy-подписка: подписываемся на storage только при первом subscribe на Observable
    let storageUnsubscribe: VoidFunction | null = null

    const sharedObservable = new Observable<TypedAction<R>>((subscriber) => {
      // Инициализируем prevValue текущим значением при первой подписке
      let prevValue: R | undefined
      let disposed = false

      const initAndSubscribe = async () => {
        try {
          const currentState = await Promise.resolve(this.storage.getState())
          prevValue = config.selector(currentState)
        } catch {
          // Если не удалось получить начальное значение — продолжаем с undefined
        }

        if (disposed) return

        // Если нужно уведомить о текущем значении при подписке
        if (config.notifyAfterSubscribe && prevValue !== undefined) {
          if (!config.shouldTrigger || config.shouldTrigger(undefined, prevValue)) {
            const initialAction: TypedAction<R> = {
              type: actionType,
              payload: prevValue,
              meta: {
                ...config.meta,
                isInitial: true,
              },
            }
            this.actions$.next(initialAction)
            subscriber.next(initialAction)
          }
        }

        // Подписываемся на изменения storage
        storageUnsubscribe = this.storage.subscribe(config.selector, (value: R) => {
          if (!config.shouldTrigger || config.shouldTrigger(prevValue, value)) {
            const action: TypedAction<R> = {
              type: actionType,
              payload: value,
              meta: config.meta,
            }

            this.actions$.next(action)
            subscriber.next(action)

            prevValue = value
          }
        })

        // Если отписались пока шла асинхронная инициализация — сразу очищаем
        if (disposed) {
          storageUnsubscribe()
          storageUnsubscribe = null
        }
      }

      initAndSubscribe()

      return () => {
        disposed = true
        if (storageUnsubscribe) {
          storageUnsubscribe()
          storageUnsubscribe = null
        }
      }
    }).pipe(share())

    // Создаем функцию watcher'а
    const watcherFn = () => sharedObservable

    watcherFn._type = 'watchers'

    Object.defineProperty(watcherFn, 'actionType', {
      value: actionType,
      writable: false,
      enumerable: true,
      configurable: true,
    })

    if (config.meta) {
      Object.defineProperty(watcherFn, 'meta', {
        value: config.meta,
        writable: false,
        enumerable: true,
      })
    }

    Object.defineProperty(watcherFn, 'unsubscribe', {
      value: () => {
        if (storageUnsubscribe) {
          storageUnsubscribe()
          storageUnsubscribe = null
        }
      },
      writable: false,
      enumerable: true,
    })

    // Deferred type assignment — используется в createDispatcher для авто-генерации типа из имени ключа
    if (!hasExplicitType) {
      ;(watcherFn as any)._assignType = (name: string) => {
        actionType = `[${this.storage.name}]${name}`

        Object.defineProperty(watcherFn, 'actionType', {
          value: actionType,
          writable: false,
          enumerable: true,
          configurable: true,
        })
      }
    }

    //@ts-ignore
    return watcherFn as WatcherFunction<R>
  }
}

/**
 * Функция для создания типизированного диспетчера.
 *
 * Поддерживает два варианта:
 * 1. Объект standalone-рецептов (ActionRecipe / WatcherRecipe)
 * 2. Setup-функция с доступом к createAction / createWatcher (inline-определение)
 *
 * @example
 * ```ts
 * // Вариант 1: объект рецептов (рекомендуемый)
 * createDispatcher({ storage }, {
 *   loadList,
 *   loadListLoading: listRequest.loading,
 *   watchCount,
 * })
 *
 * // Вариант 2: setup-функция (для смешанного использования)
 * createDispatcher({ storage }, (storage, { createAction }) => ({
 *   loadList,
 *   custom: createAction({ action: () => { ... } }),
 * }))
 * ```
 */

// Overload: объект standalone-рецептов
export function createDispatcher<TState extends Record<string, any>, TRecord extends Record<string, ActionRecipe<TState, any, any> | WatcherRecipe<TState, any>>>(
  options: DispatcherOptions<TState>,
  actions: TRecord,
): DispatcherCore<TState> & {
  dispatch: DispatchActions<TRecord>
  watchers: WatcherActions<TRecord>
}

// Overload: setup-функция
export function createDispatcher<TState extends Record<string, any>, TActions extends ActionsSetupWithUtils<TState>>(
  options: DispatcherOptions<TState>,
  actionsSetup: TActions,
): DispatcherCore<TState, TActions> & {
  dispatch: DispatchActions<ReturnType<TActions>>
  watchers: WatcherActions<ReturnType<TActions>>
}

// Implementation
export function createDispatcher<TState extends Record<string, any>>(options: DispatcherOptions<TState>, actionsOrSetup: Record<string, any> | ((...args: any[]) => any)) {
  // Создаем экземпляр диспетчера
  const dispatcher = new DispatcherCore<TState>(options)

  // Получаем объект действий: из функции или напрямую
  const actions =
    typeof actionsOrSetup === 'function'
      ? actionsOrSetup(options.storage, {
          createAction: (actionConfig: any, executionOptions: any) => dispatcher.createAction(actionConfig, executionOptions),
          createWatcher: (config: any) => dispatcher.createWatcher(config),
        })
      : actionsOrSetup

  // Регистрируем все созданные объекты в соответствующих коллекциях
  for (const [key, fn] of Object.entries(actions)) {
    // Standalone action recipe — привязываем к storage и создаём реальный action
    if (typeof fn === 'object' && fn !== null && (fn as any)._type === 'action-recipe') {
      const recipe = fn as ActionRecipe<TState, any, any>
      const boundConfig = {
        meta: recipe._config.meta,
        action: (params: any) => recipe._config.action(options.storage, params),
      }
      const dispatchFn = dispatcher.createAction(boundConfig, recipe._executionOptions)
      if (typeof (dispatchFn as any)._assignType === 'function') {
        ;(dispatchFn as any)._assignType(key)
        delete (dispatchFn as any)._assignType
      }
      dispatcher.dispatch[key] = dispatchFn
      continue
    }

    // Standalone watcher recipe — привязываем к storage и создаём реальный watcher
    if (typeof fn === 'object' && fn !== null && (fn as any)._type === 'watcher-recipe') {
      const recipe = fn as WatcherRecipe<TState, any>
      const watcherFn = dispatcher.createWatcher(recipe._config)
      if (typeof (watcherFn as any)._assignType === 'function') {
        ;(watcherFn as any)._assignType(key)
        delete (watcherFn as any)._assignType
      }
      dispatcher.watchers[key] = watcherFn
      continue
    }

    // Inline action/watcher (существующая логика)
    if (typeof fn === 'function') {
      const type = (fn as any)._type
      if (type === 'dispatch' || type === 'watchers') {
        // Авто-назначение типа из имени ключа, если type не был указан явно
        if (typeof (fn as any)._assignType === 'function') {
          ;(fn as any)._assignType(key)
          delete (fn as any)._assignType
        }
        // @ts-ignore
        dispatcher[type][key] = fn
      }
    }
  }

  return dispatcher
}
export type CreateDispatcherType = ReturnType<typeof createDispatcher>
