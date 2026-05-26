import { combineLatest, EMPTY, from, merge, Observable, of, OperatorFunction, pipe, Subject } from 'rxjs'
import { catchError, filter, map, share, switchMap, take } from 'rxjs/operators'

import { handleCallbackError, logError } from '../../_utils/error-handling.util'
import { IStorage } from '../../core'
import { Action, ActionsResult, Dispatcher, DispatchFunction, ExtractResultType, WatcherFunction } from '../dispatcher'
import { ChunkRequestConsistent, chunkRequestConsistent, ChunkRequestParallel, chunkRequestParallel } from './utils'

/**
 * Тип действия с типизированным payload
 */
export interface TypedAction<P> extends Action<P> {
  type: string
  payload: P
}

/**
 * Тип для внешних состояний
 */
export type ExternalStates = Record<string, Observable<any>>

/**
 * Контекст эффекта — объект с зависимостями, передаваемый третьим аргументом
 */
export interface EffectContext<
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
> {
  /** Основной dispatcher текущего synapse */
  dispatcher: TDispatcher
  /** Внешние dispatcher'ы из других synapse */
  externalDispatchers: TExternalDispatchers
  /** Сервисы (API-клиенты и т.д.) */
  services: TServices
  /** Глобальная конфигурация для эффектов */
  config: TConfig
}

/**
 * Тип для эффекта с доступом к состоянию и контексту — основной тип
 */
export type Effect<
  TState extends Record<string, any> = any,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
> = (
  action$: Observable<Action>,
  state$: Observable<TState>,
  context: EffectContext<TDispatcher, TServices, TConfig, TExternalDispatchers>,
) => Observable<unknown>

/**
 * Тип для получения типов действий диспетчера
 */
export type DispatcherActions<T> = T extends Dispatcher<any, infer A> ? ActionsResult<A> : Record<string, DispatchFunction<any, any>>

/**
 * Конфигурация для валидации в validateMap
 */
export interface ValidateConfig {
  conditions: boolean[]
  skipAction: (() => any) | any | ((() => any) | any)[]
}

/**
 * Утилиты для запросов в validateMap
 */
export interface ValidateMapRequestUtils {
  chunkRequest: ChunkRequestParallel
  chunkRequestConsistent: ChunkRequestConsistent
}

/**
 * Оператор для фильтрации действий по типу с сохранением типа payload
 */
export function ofType<T extends DispatchFunction<any, any> | WatcherFunction<any>>(
  actionFn: T,
): OperatorFunction<Action, TypedAction<T extends WatcherFunction<infer R> ? R : ExtractResultType<T>>> {
  const { actionType } = actionFn

  if (!actionType) {
    logError('ofType: action function does not have actionType property', actionFn, null, 'warn')
    return filter(() => false) as any
  }

  // Определяем тип payload в зависимости от типа функции
  type PayloadType = T extends WatcherFunction<infer R> ? R : ExtractResultType<T>

  // Улучшенная реализация с явными типами
  return (source$: Observable<Action>): Observable<TypedAction<PayloadType>> => {
    return source$.pipe(filter((action): action is TypedAction<PayloadType> => action !== undefined && action.type === actionType))
  }
}

/**
 * Оператор для фильтрации действий по нескольким типам с объединением типов payload
 * @param actionFns Массив функций действий
 */
export function ofTypes<T extends DispatchFunction<any, any>[]>(actionFns: [...T]): OperatorFunction<Action, TypedAction<ExtractResultType<T[number]>>> {
  // Получаем типы действий
  const actionTypes = actionFns.map((fn) => fn.actionType).filter(Boolean)

  if (actionTypes.length === 0) {
    logError('ofTypes: no valid action types found in array', actionFns, null, 'warn')
    return filter(() => false) as OperatorFunction<Action, TypedAction<ExtractResultType<T[number]>>>
  }

  // Union тип для payload из всех действий
  type CombinedPayloadType = ExtractResultType<T[number]>

  // Улучшенная реализация с явными типами
  return (source$: Observable<Action>): Observable<TypedAction<CombinedPayloadType>> => {
    return source$.pipe(filter((action): action is TypedAction<CombinedPayloadType> => action !== undefined && actionTypes.includes(action.type)))
  }
}

/**
 * Оператор для ожидания выполнения всех указанных действий.
 *
 * **Важно:** Использует `combineLatest` — Observable не эмитит, пока КАЖДЫЙ из
 * указанных action не будет диспатчнут хотя бы один раз. Если хотя бы один action
 * никогда не будет вызван, поток зависнет навсегда без уведомления.
 * Убедитесь, что все указанные actions гарантированно будут диспатчнуты,
 * либо используйте `ofTypes` с ручной агрегацией при необходимости таймаута.
 *
 * @param actionFns Массив функций действий
 */
export function ofTypesWaitAll<T extends DispatchFunction<any, any>[]>(actionFns: [...T]) {
  return (source$: Observable<Action>): Observable<{ [K in keyof T]: TypedAction<ExtractResultType<T[K]>> }> => {
    // Создаем потоки для каждого типа действия
    const actionTypes = actionFns.map((fn) => fn.actionType).filter(Boolean)

    if (actionTypes.length === 0) {
      logError('ofTypesWaitAll: no valid action types found in array', actionFns, null, 'warn')
      return of([]) as any
    }

    // Для каждого типа действия создаем поток,
    // который берет первое срабатывание
    const actionStreams = actionTypes.map((type, index) =>
      source$.pipe(
        filter((action) => action.type === type),
        take(1),
        map((action) =>
          // Сохраняем ассоциацию с индексом, чтобы соответствовать
          // порядку в исходном массиве actionFns
          ({ index, action }),
        ),
      ),
    )

    // Ждем, пока все потоки выдадут значения, и сортируем результаты
    // по индексу для сохранения порядка
    return combineLatest(actionStreams).pipe(
      map((results) => {
        // Сортируем по индексу
        results.sort((a, b) => a.index - b.index)
        // Убираем индекс и возвращаем только действия
        return results.map((r) => r.action) as any
      }),
    )
  }
}

/**
 * Создает Observable с выбранными данными из состояния
 * @param state$ Поток состояния
 * @param selectors Селекторы для выбора частей состояния
 * @returns Observable с массивом выбранных значений
 */
export function selectorMap<TState, TResults extends any[]>(
  state$: Observable<TState>,
  ...selectors: { [K in keyof TResults]: (state: TState) => TResults[K] }
): Observable<TResults> {
  return state$.pipe(
    map((state) => {
      return selectors.map((selector) => selector(state)) as TResults
    }),
  )
}

/**
 * Создает именованный объект вместо массива
 * @param state$ Поток состояния
 * @param selectors Объект с селекторами
 * @returns Observable с объектом выбранных значений
 */
export function selectorObject<TState, TResult extends Record<string, any>>(
  state$: Observable<TState>,
  selectors: { [K in keyof TResult]: (state: TState) => TResult[K] },
): Observable<TResult> {
  return state$.pipe(
    map((state) => {
      const result = {} as TResult
      for (const [key, selector] of Object.entries(selectors)) {
        result[key as keyof TResult] = selector(state)
      }
      return result
    }),
  )
}

/**
 * Оператор validateMap для валидации данных и условного вызова API
 */
export function validateMap<T, TResult = any>({
  validator,
  loadingAction,
  errorAction,
  apiCall,
}: {
  validator?: (value: T) => ValidateConfig
  /** Вызывается после успешной валидации, перед apiCall. Типичное использование — dispatch loading-статуса. */
  loadingAction?: (value: T) => void
  /** Вызывается при ошибке в apiCall (catchError). Получает ошибку + те же данные что loadingAction/apiCall. */
  errorAction?: (error: any, value: T) => void
  apiCall: (value: T, utils: ValidateMapRequestUtils) => Observable<TResult>
}): OperatorFunction<T, any> {
  return pipe(
    switchMap((pipeData) => {
      /**
       * Функция вызова API-метода
       */
      const callApi = () => {
        if (loadingAction) loadingAction(pipeData)

        const apiCall$ = apiCall(pipeData, {
          chunkRequest: chunkRequestParallel,
          chunkRequestConsistent: chunkRequestConsistent,
        })

        if (!errorAction) return apiCall$

        return apiCall$.pipe(
          catchError((err) => {
            errorAction(err, pipeData)
            return EMPTY
          }),
        )
      }

      /**
       * Если валидацию не используем - сразу вызываем запрос
       */
      if (!validator) return callApi()

      const validateConfig = validator(pipeData)
      const { conditions, skipAction } = validateConfig
      const conditionMet = conditions.every(Boolean)

      /**
       * Если валидация не пройдена - вызываем экшн сброса
       */
      if (!conditionMet) {
        if (Array.isArray(skipAction)) {
          // eslint-disable-next-line no-unsafe-optional-chaining
          return of(...skipAction?.filter(Boolean).map((action) => (typeof action === 'function' ? action() : action)))
        }
        return of(typeof skipAction === 'function' ? skipAction() : skipAction)
      }

      return callApi()
    }),
  )
}

/**
 * Метаданные ответа API, доступные в колбэках apiResult.
 */
export interface ApiResultMeta {
  status: number
  statusText: string
  headers: Headers
  fromCache?: boolean
}

/**
 * Ошибка API-запроса. Бросается apiResult при !result.ok.
 * Ловится errorAction в validateMap.
 */
export class ApiError extends Error {
  constructor(
    public readonly originalError: any,
    public readonly meta: ApiResultMeta,
  ) {
    super(typeof originalError === 'string' ? originalError : originalError?.message ?? 'API request failed')
    this.name = 'ApiError'
  }
}

/**
 * Оператор для обработки успешного результата API-запроса (QueryResult).
 *
 * При `result.ok` — вызывает callback с `data` и `meta`.
 * При `!result.ok` — бросает `ApiError`, который ловится `errorAction` в `validateMap`.
 *
 * @example
 * ```ts
 * // Простой случай
 * validateMap({
 *   errorAction: (err) => dispatcher.dispatch.loadError(String(err)),
 *   apiCall: () => from(api.request('getList', params)).pipe(
 *     apiResult((data) => dispatcher.dispatch.loadSuccess(data)),
 *   ),
 * })
 *
 * // С доступом к headers (пагинация)
 * apiResult((data, meta) => {
 *   const total = Number(meta.headers.get('X-Total-Count'))
 *   dispatcher.dispatch.loadSuccess({ items: data, total })
 * })
 * ```
 */
export function apiResult<TData, TResult = void>(
  onSuccess: (data: TData, meta: ApiResultMeta) => TResult | Promise<TResult>,
): OperatorFunction<{ ok: boolean; data?: TData; error?: any; status?: number; statusText?: string; headers?: Headers; fromCache?: boolean }, TResult> {
  return pipe(
    switchMap((result) => {
      const meta: ApiResultMeta = {
        status: result.status ?? 0,
        statusText: result.statusText ?? '',
        headers: result.headers ?? new Headers(),
        fromCache: result.fromCache,
      }
      if (result.ok && result.data !== undefined) {
        const out = onSuccess(result.data, meta)
        return from(Promise.resolve(out))
      }
      throw new ApiError(result.error ?? 'Unknown error', meta)
    }),
  )
}

/**
 * Класс для управления эффектами с поддержкой доступа к состоянию и контексту
 * Основной класс, который следует использовать
 */
export class EffectsModule<
  TState extends Record<string, any> = any,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
> {
  private effects: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers>[] = []
  private subscriptions: Array<{ unsubscribe: VoidFunction }> = []
  private running = false
  private action$ = new Subject<Action>()

  /**
   * Поток состояния
   */
  public readonly state$: Observable<TState>

  /**
   * Создает модуль эффектов
   * @param storage Хранилище состояния
   * @param dispatcher Основной dispatcher текущего synapse
   * @param externalDispatchers Внешние dispatcher'ы из других synapse
   * @param services Сервисы (API-клиенты и т.д.)
   * @param config Глобальная конфигурация для всех эффектов
   */
  constructor(
    private storage: IStorage<TState>,
    private dispatcher: TDispatcher & { actions: Observable<Action> },
    private externalDispatchers: TExternalDispatchers = {} as TExternalDispatchers,
    private services: TServices = {} as TServices,
    private config: TConfig = {} as TConfig,
  ) {
    this.subscribeToDispatchers()

    // Создаем поток состояния
    this.state$ = new Observable<TState>((observer) => {
      // Отправляем начальное состояние
      Promise.resolve(this.storage.getState()).then((state: TState) => observer.next(state))

      // Подписываемся на все изменения
      const unsubscribe = this.storage.subscribeToAll(() => {
        Promise.resolve(this.storage.getState()).then((state: TState) => observer.next(state))
      })

      // Отписываемся при завершении
      return () => unsubscribe()
    }).pipe(share())
  }

  /**
   * Подписывается на действия от основного dispatcher'а и внешних dispatcher'ов
   */
  private subscribeToDispatchers() {
    // Основной dispatcher
    const mainSub = this.dispatcher.actions.subscribe((action) => {
      this.action$.next(action)
    })
    this.subscriptions.push(mainSub)

    // Внешние dispatcher'ы
    for (const [_, dispatcher] of Object.entries(this.externalDispatchers)) {
      const subscription = dispatcher.actions.subscribe((action) => {
        this.action$.next(action)
      })
      this.subscriptions.push(subscription)
    }
  }

  add(effect: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers>): this {
    this.effects.push(effect)

    if (this.running) {
      this.subscribeToEffect(effect)
    }

    return this
  }

  /**
   * Добавляет несколько эффектов
   * @param effects Эффекты для добавления
   * @returns Текущий модуль
   */
  addEffects(effects: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers>[]): this {
    effects.forEach((effect) => this.add(effect))
    return this
  }

  /**
   * Запускает все эффекты
   * @returns Текущий модуль
   */
  async start(): Promise<this> {
    if (this.running) {
      return this
    }
    // Ждем готовности основного хранилища
    await this.storage.waitForReady()

    // Переподписываемся на dispatchers (подписки были очищены в stop())
    this.subscribeToDispatchers()

    this.effects.forEach((effect) => this.subscribeToEffect(effect))
    this.running = true

    return this
  }

  /**
   * Останавливает все эффекты
   * @returns Текущий модуль
   */
  stop(): this {
    this.subscriptions.forEach((sub) => sub.unsubscribe())
    this.subscriptions = []
    this.action$.complete()
    this.action$ = new Subject<Action>()
    this.running = false

    return this
  }

  /**
   * Подписывается на конкретный эффект
   * @param effect Эффект для подписки
   */
  private subscribeToEffect(effect: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers>): void {
    try {
      const context: EffectContext<TDispatcher, TServices, TConfig, TExternalDispatchers> = {
        dispatcher: this.dispatcher,
        externalDispatchers: this.externalDispatchers,
        services: this.services,
        config: this.config,
      }

      const output$ = effect(this.action$.asObservable(), this.state$, context).pipe(
        catchError((err) => {
          handleCallbackError('EffectsModule: error in effect', err)
          return of(null)
        }),
      )

      const subscription = output$.subscribe((result) => {
        if (result === null || result === undefined) {
          return
        }

        if (typeof result === 'function') {
          try {
            result()
          } catch (callError) {
            handleCallbackError('EffectsModule: error calling effect result function', callError)
          }
        }
      })

      this.subscriptions.push(subscription)
    } catch (setupError) {
      handleCallbackError('EffectsModule: error setting up effect', setupError)
    }
  }
}

/**
 * Вспомогательная функция для создания типизированного эффекта
 */
export function createEffect<
  TState extends Record<string, any>,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
>(effect: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers>): Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers> {
  return effect
}

/**
 * Объединяет несколько эффектов в один
 * @param effects Эффекты для объединения
 * @returns Объединенный эффект
 */
export function combineEffects<
  TState extends Record<string, any>,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
>(...effects: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers>[]): Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers> {
  return (action$, state$, context) => {
    const outputs = effects.map((effect) => {
      try {
        return effect(action$, state$, context)
      } catch (error) {
        handleCallbackError('combineEffects: error in one of combined effects', error)
        return of(null)
      }
    })
    return merge(...outputs)
  }
}
