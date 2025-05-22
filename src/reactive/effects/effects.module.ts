import { combineLatest, merge, Observable, of, OperatorFunction, pipe, Subject } from 'rxjs'
import { catchError, filter, map, share, switchMap, take, withLatestFrom } from 'rxjs/operators'

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
 * Тип для базового эффекта без доступа к состоянию
 */
export type EffectBase<TDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>, TServices extends Record<string, any> = Record<string, never>> = (
  action$: Observable<Action>,
  dispatchers: TDispatchers,
  services: TServices,
) => Observable<unknown>

/**
 * Тип для эффекта с доступом к состоянию и конфигурации - это основной тип, который используется по умолчанию
 */
export type Effect<
  TState extends Record<string, any> = any,
  TDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> = (
  action$: Observable<Action>,
  state$: Observable<TState>,
  externalStates: TExternalStates,
  dispatchers: TDispatchers,
  services: TServices,
  config: TConfig,
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
    console.warn('ofType: Action function does not have actionType property', actionFn)
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
    console.warn('ofTypes: No valid action types found in array', actionFns)
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
 * Оператор для ожидания выполнения всех указанных действий
 * @param actionFns Массив функций действий
 */
export function ofTypesWaitAll<T extends DispatchFunction<any, any>[]>(actionFns: [...T]) {
  return (source$: Observable<Action>): Observable<{ [K in keyof T]: TypedAction<ExtractResultType<T[K]>> }> => {
    // Создаем потоки для каждого типа действия
    const actionTypes = actionFns.map((fn) => fn.actionType).filter(Boolean)

    if (actionTypes.length === 0) {
      console.warn('ofTypesWaitAll: No valid action types found in array', actionFns)
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
 * Оператор selectorMap для выбора частей состояния с помощью селекторов
 * @param state$ Поток состояния
 * @param selectors Селекторы для выбора частей состояния
 */
export function selectorMap<TAction, TState, TResults extends any[]>(
  state$: Observable<TState>,
  ...selectors: { [K in keyof TResults]: (state: TState) => TResults[K] }
): OperatorFunction<TAction, [TAction, TResults]> {
  return (source$: Observable<TAction>): Observable<[TAction, TResults]> => {
    return source$.pipe(
      withLatestFrom(
        state$.pipe(
          map((state) => {
            return selectors.map((selector) => selector(state)) as TResults
          }),
        ),
      ),
    )
  }
}

/**
 * Оператор validateMap для валидации данных и условного вызова API
 */
export function validateMap<T, TResult = any>({
  validator,
  apiCall,
}: {
  validator?: (value: T) => ValidateConfig
  apiCall: (value: T, utils: ValidateMapRequestUtils) => Observable<TResult>
}): OperatorFunction<T, any> {
  return pipe(
    switchMap((pipeData) => {
      /**
       * Функция вызова API-метода
       */
      const callApi = () =>
        apiCall(pipeData, {
          chunkRequest: chunkRequestParallel,
          chunkRequestConsistent: chunkRequestConsistent,
        })

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
 * Класс для управления эффектами с поддержкой доступа к состоянию и конфигурации
 * Основной класс, который следует использовать
 */
export class EffectsModule<
  TState extends Record<string, any> = any,
  TDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> {
  private effects: Effect<TState, TDispatchers, TServices, TConfig, TExternalStates>[] = []
  private subscriptions: Array<{ unsubscribe: VoidFunction }> = []
  private running = false
  private action$ = new Subject<Action>()

  /**
   * Поток состояния
   */
  public readonly state$: Observable<TState>

  /**
   * Создает модуль эффектов с доступом к состоянию, внешним состояниям и конфигурации
   * @param storage Хранилище состояния
   * @param externalStates Внешние состояния
   * @param dispatchers Объект с диспетчерами
   * @param services Объект с сервисами
   * @param config Глобальная конфигурация для всех эффектов
   */
  constructor(
    private storage: IStorage<TState>,
    private externalStates: TExternalStates = {} as TExternalStates,
    private dispatchers: TDispatchers,
    private services: TServices = {} as TServices,
    private config: TConfig = {} as TConfig,
  ) {
    this.subscribeToDispatchers()

    // Создаем поток состояния
    this.state$ = new Observable<TState>((observer) => {
      // Отправляем начальное состояние
      this.storage.getState().then((state) => observer.next(state))

      // Подписываемся на все изменения
      const unsubscribe = this.storage.subscribeToAll(() => {
        this.storage.getState().then((state) => observer.next(state))
      })

      // Отписываемся при завершении
      return () => unsubscribe()
    }).pipe(share())
  }

  /**
   * Подписывается на действия от всех диспетчеров
   */
  private subscribeToDispatchers() {
    for (const [_, dispatcher] of Object.entries(this.dispatchers)) {
      const subscription = dispatcher.actions.subscribe((action) => {
        this.action$.next(action)
      })

      this.subscriptions.push(subscription)
    }
  }

  add(effect: Effect<TState, TDispatchers, TServices, TConfig, TExternalStates>): this {
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
  addEffects(effects: Effect<TState, TDispatchers, TServices, TConfig, TExternalStates>[]): this {
    effects.forEach((effect) => this.add(effect))
    return this
  }

  /**
   * Запускает все эффекты
   * @returns Текущий модуль
   */
  start(): this {
    if (this.running) {
      return this
    }

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
    this.running = false

    return this
  }

  /**
   * Подписывается на конкретный эффект
   * @param effect Эффект для подписки
   */
  private subscribeToEffect(effect: Effect<TState, TDispatchers, TServices, TConfig, TExternalStates>): void {
    try {
      const output$ = effect(this.action$.asObservable(), this.state$, this.externalStates, this.dispatchers, this.services, this.config).pipe(
        catchError((err) => {
          console.error('Error in effect:', err)
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
            console.error('Error calling effect result function:', callError)
          }
        }
      })

      this.subscriptions.push(subscription)
    } catch (setupError) {
      console.error('Error setting up effect:', setupError)
    }
  }
}

/**
 * Вспомогательная функция для создания типизированного эффекта без состояния
 * @deprecated Используйте createEffect вместо этого
 */
export function createEffectBase<TDispatchers extends Record<string, Dispatcher<any, any>>, TServices extends Record<string, any>>(
  effect: EffectBase<TDispatchers, TServices>,
): EffectBase<TDispatchers, TServices> {
  return effect
}

/**
 * Вспомогательная функция для создания типизированного эффекта с состоянием и конфигурацией
 */
export function createEffect<
  TState extends Record<string, any>,
  TDispatchers extends Record<string, Dispatcher<any, any>>,
  TServices extends Record<string, any>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
>(effect: Effect<TState, TDispatchers, TServices, TConfig, TExternalStates>): Effect<TState, TDispatchers, TServices, TConfig, TExternalStates> {
  return effect
}

/**
 * Объединяет несколько эффектов в один
 * @param effects Эффекты для объединения
 * @returns Объединенный эффект
 */
export function combineEffects<
  TState extends Record<string, any>,
  TDispatchers extends Record<string, Dispatcher<any, any>>,
  TServices extends Record<string, any>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
>(...effects: Effect<TState, TDispatchers, TServices, TConfig, TExternalStates>[]): Effect<TState, TDispatchers, TServices, TConfig, TExternalStates> {
  return (action$, state$, externalStates, dispatchers, services, config) => {
    const outputs = effects.map((effect) => {
      try {
        return effect(action$, state$, externalStates, dispatchers, services, config)
      } catch (error) {
        console.error('Error in one of combined effects:', error)
        return of(null)
      }
    })
    return merge(...outputs)
  }
}
