import { combineLatest, EMPTY, from, merge, Observable, of, OperatorFunction, pipe, Subject } from 'rxjs'
import { catchError, filter, map, mergeMap, retry, share, switchMap, take } from 'rxjs/operators'

import { handleCallbackError, logError } from '../../_utils/error-handling.util'
import { IStorage, IStorageBase } from '../../core'
import { Action, ActionsResult, DispatcherCore, DispatchFunction, ExtractResultType, WatcherFunction } from '../dispatcher'
import { ChunkRequestConsistent, chunkRequestConsistent, ChunkRequestParallel, chunkRequestParallel, isStorage, toObservable } from './utils'

/**
 * Тип действия с типизированным payload
 */
export interface TypedAction<P> extends Action<P> {
  type: string
  payload: P
}

/**
 * Тип для внешних состояний — Observable или хранилище (IStorageBase), которое автоматически конвертируется в Observable
 */
export type ExternalStates = Record<string, Observable<any> | IStorageBase<any>>

/**
 * Контекст эффекта — объект с зависимостями, передаваемый третьим аргументом
 */
export interface EffectContext<
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> {
  /** Основной dispatcher текущего synapse */
  dispatcher: TDispatcher
  /** Внешние dispatcher'ы из других synapse */
  externalDispatchers: TExternalDispatchers
  /** Внешние состояния — Observable'ы от других хранилищ (Synapse.state$, или любой Observable) */
  externalStates: TExternalStates
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
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> = (action$: Observable<Action>, state$: Observable<TState>, context: EffectContext<TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>) => Observable<unknown>

/**
 * Опции конкретного эффекта. Прикрепляются к функции-эффекту через {@link EFFECT_OPTIONS}
 * (это делает `Effects.effect(fn, options)` из базового класса). EffectsModule читает их
 * при подписке.
 */
export interface EffectOptions {
  /**
   * Переподписаться на поток при непойманной ошибке вместо терминального завершения.
   *
   * - `true` — бесконечный немедленный resubscribe;
   * - `{ count, delay }` — лимит ретраев и задержка (мс) между ними (см. rxjs `retry`).
   *
   * По умолчанию (опция не задана) — текущее поведение: ошибка завершает эффект,
   * остальные продолжают работать.
   */
  resubscribeOnError?: boolean | { count?: number; delay?: number }
}

/**
 * Symbol-маркер, под которым опции эффекта ({@link EffectOptions}) хранятся на функции-эффекте.
 * @internal
 */
export const EFFECT_OPTIONS = Symbol('synapse.effect.options')

/**
 * Symbol-маркер с именем эффекта (имя поля class-слоя `Effects`). Проставляется
 * `Effects.getEffects()` для диагностики — EffectsModule использует его, чтобы в
 * предупреждении об упавшем эффекте назвать конкретный эффект.
 * @internal
 */
export const EFFECT_NAME = Symbol('synapse.effect.name')

/**
 * Тип для получения типов действий диспетчера
 */
export type DispatcherActions<T> = T extends DispatcherCore<any, infer A> ? ActionsResult<A> : Record<string, DispatchFunction<any, any>>

/**
 * Конфигурация для валидации в validateMap
 */
export interface ValidateConfig {
  conditions: boolean[]
  /**
   * Что сделать, если валидация не прошла. Необязательно: если не задано — эффект просто
   * ничего не делает (поток завершается без эмита). Это убирает повторяющийся бойлерплейт
   * `skipAction: () => d.loadX.reset()` там, где сбрасывать нечего.
   */
  skipAction?: (() => any) | any | ((() => any) | any)[]
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
 * Оператор наложения (flattening) для {@link requestMap} / {@link mutationMap}: задаёт стратегию
 * конкуренции между перекрывающимися срабатываниями (switchMap / exhaustMap / mergeMap / concatMap).
 * Сигнатура совпадает с rxjs-операторами, поэтому их можно передавать напрямую.
 */
export type FlattenOperator = <A, R>(project: (value: A) => Observable<R>) => OperatorFunction<A, R>

/**
 * Общая конфигурация обработки запроса. Используется и для чтения ({@link validateMap}),
 * и для записи ({@link mutationMap}) — единый словарь.
 */
export interface RequestMapConfig<T, Body, TResult> {
  /** Гейт перед запросом: `conditions` все true → запрос; иначе `skipAction` (или no-op). */
  validator?: (value: T) => ValidateConfig
  /**
   * Асинхронная сборка тела запроса ПЕРЕД apiCall (FormData, blob'ы, теги). Результат приходит
   * вторым аргументом в apiCall. Нет prepare → body = undefined. Для чтения обычно не нужен.
   */
  prepare?: (value: T) => Body | Promise<Body>
  /** Вызывается после успешной валидации, перед apiCall. Типичное использование — dispatch loading-статуса. */
  loadingAction?: (value: T) => void
  /** Вызывается при ошибке в apiCall (catchError). Получает ошибку + те же данные что loadingAction/apiCall. */
  errorAction?: (error: any, value: T) => void
  /** Сам запрос: из value (+ собранного prepare тела) строим поток. Успех обрабатывается внутри через apiResult. */
  apiCall: (value: T, body: Body, utils: ValidateMapRequestUtils) => Observable<TResult>
}

/**
 * Общее ядро обработки запроса. Накладывает на поток триггеров единый пайп:
 *   [validator] → loadingAction → [prepare] → apiCall → (apiResult success) / errorAction.
 *
 * Стратегию конкуренции задаёт `flatten`:
 *  - `switchMap`  — последний выигрывает, отменяет in-flight (ЧТЕНИЕ, см. {@link validateMap});
 *  - `exhaustMap` — одиночная операция, дабл-сабмит игнорируется, in-flight НЕ отменяется (формы);
 *  - `mergeMap`   — независимые операции над разными сущностями (реальная параллельность);
 *  - `concatMap`  — строго по очереди.
 *
 * catchError стоит ВНУТРИ проекции flatten — ошибка одного запроса не валит весь поток эффекта
 * (важно для mergeMap: падение одного удаления не убивает остальные).
 * @internal
 */
function requestMap<T, Body, TResult>(
  flatten: FlattenOperator,
  { validator, prepare, loadingAction, errorAction, apiCall }: RequestMapConfig<T, Body, TResult>,
): OperatorFunction<T, any> {
  return pipe(
    flatten((pipeData: T) => {
      /**
       * Функция вызова API-метода
       */
      const callApi = () => {
        if (loadingAction) loadingAction(pipeData)

        // нет prepare → пустое тело; иначе резол body (sync/async) перед запросом
        const body$: Observable<Body> = prepare ? from(Promise.resolve(prepare(pipeData))) : of(undefined as Body)

        const apiCall$ = body$.pipe(
          mergeMap((body) =>
            apiCall(pipeData, body, {
              chunkRequest: chunkRequestParallel,
              chunkRequestConsistent: chunkRequestConsistent,
            }),
          ),
        )

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
       * Если валидация не пройдена - вызываем экшн сброса.
       * skipAction не задан → ничего не делаем (no-op по умолчанию).
       */
      if (!conditionMet) {
        if (skipAction === undefined) return EMPTY
        if (Array.isArray(skipAction)) {
          return of(...skipAction.filter(Boolean).map((action) => (typeof action === 'function' ? action() : action)))
        }
        return of(typeof skipAction === 'function' ? skipAction() : skipAction)
      }

      return callApi()
    }),
  )
}

/**
 * Оператор для ЧТЕНИЯ (запросов-ресурсов): валидация → loading → apiCall, стратегия switchMap
 * («последний выигрывает», отменяет устаревший in-flight запрос). Для записи используйте
 * {@link mutationMap} — switchMap отменял бы in-flight мутацию (потеря ответа уже закоммиченной
 * записи, отмена первого сабмита вместо игнора дубля).
 *
 * @example
 * ```ts
 * action$.pipe(
 *   ofType(d.loadPosts),
 *   validateMap({
 *     validator: ([, { status }]) => ({ conditions: [status !== ApiStatus.Loading] }),
 *     loadingAction: () => d.loadPosts.loading(),
 *     errorAction: (err) => d.loadPosts.failure(getErrorMessage(err)),
 *     apiCall: ([action]) =>
 *       fromRequest(api.getPosts.request(action.payload)).pipe(
 *         apiResult((page) => { d.applyPosts(page); d.loadPosts.success() }),
 *       ),
 *   }),
 * )
 * ```
 */
export function validateMap<T, TResult = any>(config: {
  validator?: (value: T) => ValidateConfig
  loadingAction?: (value: T) => void
  errorAction?: (error: any, value: T) => void
  apiCall: (value: T, utils: ValidateMapRequestUtils) => Observable<TResult>
}): OperatorFunction<T, any> {
  return requestMap(switchMap, {
    validator: config.validator,
    loadingAction: config.loadingAction,
    errorAction: config.errorAction,
    // adapter: публичный apiCall чтения принимает (value, utils); ядро зовёт (value, body, utils)
    apiCall: (value, _body, utils) => config.apiCall(value, utils),
  })
}

/**
 * Оператор для ЗАПИСИ (мутаций). Тот же словарь, что у {@link validateMap}, плюс два понятия:
 *  - `flatten` — стратегия конкуренции (rxjs-оператор). У записи нет одного правильного варианта,
 *    поэтому его выбирает вызывающий под смысл операции:
 *      • `exhaustMap` — одиночная операция (форма create/update): дабл-сабмит игнорируется,
 *        in-flight НЕ отменяется;
 *      • `mergeMap`   — операции над разными сущностями (delete/toggle/repost): параллельность;
 *      • `concatMap`  — строго по очереди.
 *  - `prepare` — асинхронная сборка тела (FormData, blob'ы) перед запросом; результат приходит
 *    вторым аргументом в apiCall.
 *
 * Успех/статусы ведутся ВНУТРИ apiCall через apiResult — единообразно с {@link validateMap}.
 *
 * @example
 * ```ts
 * action$.pipe(
 *   ofType(d.createPost),
 *   mutationMap({
 *     flatten: exhaustMap,
 *     loadingAction: () => d.createPost.loading(),
 *     errorAction: (err) => d.createPost.failure(getErrorMessage(err)),
 *     prepare: (payload) => buildCreateBody(api, payload),
 *     apiCall: (_payload, body) =>
 *       fromRequest(api.createPost.request({ body })).pipe(
 *         apiResult((post) => { d.createPost.success(); d.prependPost(post) }),
 *       ),
 *   }),
 * )
 * ```
 */
export function mutationMap<T, Body = void, TResult = any>({
  flatten,
  validator,
  prepare,
  loadingAction,
  errorAction,
  apiCall,
}: {
  flatten: FlattenOperator
} & RequestMapConfig<T, Body, TResult>): OperatorFunction<T, any> {
  return requestMap(flatten, { validator, prepare, loadingAction, errorAction, apiCall })
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
    super(typeof originalError === 'string' ? originalError : (originalError?.message ?? 'API request failed'))
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
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> {
  private effects: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>[] = []
  private subscriptions: Array<{ unsubscribe: VoidFunction }> = []
  private running = false
  private action$ = new Subject<Action>()
  private externalStates: TExternalStates

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
   * @param externalStates Внешние состояния (Observable'ы от других хранилищ)
   */
  constructor(
    private storage: IStorage<TState>,
    private dispatcher: TDispatcher & { actions: Observable<Action> },
    private externalDispatchers: TExternalDispatchers = {} as TExternalDispatchers,
    private services: TServices = {} as TServices,
    private config: TConfig = {} as TConfig,
    externalStates: TExternalStates = {} as TExternalStates,
  ) {
    // Нормализуем externalStates: конвертируем storage → Observable
    this.externalStates = this.normalizeExternalStates(externalStates)

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
   * Нормализует externalStates: конвертирует IStorageBase в Observable, пропускает Observable как есть
   */
  private normalizeExternalStates(states: TExternalStates): TExternalStates {
    const normalized = {} as Record<string, Observable<any>>
    for (const [key, value] of Object.entries(states)) {
      normalized[key] = isStorage(value) ? toObservable(value) : value
    }
    return normalized as TExternalStates
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

  add(effect: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>): this {
    this.effects.push(effect)

    if (this.running) {
      this.subscribeToEffect(effect, this.effects.length - 1)
    }

    return this
  }

  /**
   * Добавляет несколько эффектов
   * @param effects Эффекты для добавления
   * @returns Текущий модуль
   */
  addEffects(effects: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>[]): this {
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

    this.effects.forEach((effect, index) => this.subscribeToEffect(effect, index))
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
  private subscribeToEffect(effect: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>, index = 0): void {
    try {
      const context: EffectContext<TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates> = {
        dispatcher: this.dispatcher,
        externalDispatchers: this.externalDispatchers,
        externalStates: this.externalStates,
        services: this.services,
        config: this.config,
      }

      let stream$ = effect(this.action$.asObservable(), this.state$, context)

      // resubscribeOnError: переподписываемся на поток вместо терминального завершения.
      // Лимит ретраев исчерпан → ошибка уходит в терминальный catchError ниже
      // (эффект умирает, остальные продолжают работать).
      const options = (effect as { [EFFECT_OPTIONS]?: EffectOptions })[EFFECT_OPTIONS]
      const resubscribeOnError = options?.resubscribeOnError
      const resubscribes = !!resubscribeOnError
      if (resubscribeOnError) {
        const config = resubscribeOnError === true ? {} : resubscribeOnError
        stream$ = stream$.pipe(retry({ count: config.count ?? Infinity, delay: config.delay, resetOnSuccess: true }))
      }

      // Имя эффекта (поле class-слоя Effects) — для понятного предупреждения; иначе индекс.
      const effectLabel = (effect as { [EFFECT_NAME]?: string })[EFFECT_NAME] ?? `#${index}`

      const output$ = stream$.pipe(
        catchError((err) => {
          // Поток эффекта дошёл до терминальной ошибки → этот эффект БОЛЬШЕ не реагирует
          // на экшены (остальные живы). Громкое сообщение, чтобы это не прошло незаметно.
          const tail = resubscribes
            ? 'resubscribeOnError исчерпал лимит ретраев.'
            : 'Чтобы эффект переподписывался после ошибки, добавьте { resubscribeOnError: true } в this.effect(fn, …).'
          handleCallbackError(`EffectsModule: эффект "${effectLabel}" УПАЛ и больше не будет реагировать на экшены (поток завершён). ${tail}`, err)
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
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
>(
  effect: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>,
): Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates> {
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
  TExternalDispatchers extends Record<string, DispatcherCore<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
>(
  ...effects: Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>[]
): Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates> {
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
