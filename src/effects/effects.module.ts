import { combineLatest, merge, Observable, of, OperatorFunction, Subject } from 'rxjs'
import { catchError, filter, map, share, take, withLatestFrom } from 'rxjs/operators'

import { Action, ActionsResult, Dispatcher, DispatchFunction, ExtractResultType, WatcherFunction } from '../dispatcher/dispatcher.module'
import { IStorage } from '../storage'

/**
 * Тип действия с типизированным payload
 */
export interface TypedAction<P> extends Action<P> {
  type: string
  payload: P
}

/**
 * Тип для базового эффекта без доступа к состоянию
 */
export type EffectBase<TDispatchers extends Record<string, Dispatcher<any, any>> = {}, TServices extends Record<string, any> = {}> = (
  action$: Observable<Action>,
  dispatchers: TDispatchers,
  services: TServices,
) => Observable<unknown>

/**
 * Тип для эффекта с доступом к состоянию - это основной тип, который используется по умолчанию
 */
export type Effect<TState extends Record<string, any> = any, TDispatchers extends Record<string, Dispatcher<any, any>> = {}, TServices extends Record<string, any> = {}> = (
  action$: Observable<Action>,
  state$: Observable<TState>,
  dispatchers: TDispatchers,
  services: TServices,
) => Observable<unknown>

/**
 * Тип для получения типов действий диспетчера
 */
export type DispatcherActions<T> = T extends Dispatcher<any, infer A> ? ActionsResult<A> : Record<string, DispatchFunction<any, any>>

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
 * Версия ofType, которая принимает несколько функций действий и возвращает оператор,
 * который фильтрует по любому из указанных типов действий.
 * Результирующий тип payload будет объединением типов payload всех функций.
 */
export function ofOneOf<T extends DispatchFunction<any, any>[]>(...actionFns: T): OperatorFunction<Action, TypedAction<ExtractResultType<T[number]>>> {
  return ofTypes(actionFns)
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
 * Базовый класс для управления эффектами без поддержки состояния
 * Оставлен для обратной совместимости
 */
export class EffectsModuleBase<TDispatchers extends Record<string, Dispatcher<any, any>> = {}, TServices extends Record<string, any> = {}> {
  private effects: EffectBase<TDispatchers, TServices>[] = []
  private subscriptions: Array<{ unsubscribe: () => void }> = []
  private running = false
  private action$ = new Subject<Action>()

  /**
   * Создает модуль эффектов
   * @param dispatchers Объект с диспетчерами
   * @param services Объект с сервисами
   */
  constructor(
    private dispatchers: TDispatchers,
    private services: TServices = {} as TServices,
  ) {
    // Подписываемся на действия от всех диспетчеров
    this.subscribeToDispatchers()
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

  /**
   * Добавляет эффект в модуль
   * @param effect Эффект для добавления
   * @returns Текущий модуль
   */
  add(effect: EffectBase<TDispatchers, TServices>): this {
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
  addEffects(effects: EffectBase<TDispatchers, TServices>[]): this {
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
  private subscribeToEffect(effect: EffectBase<TDispatchers, TServices>): void {
    try {
      // Запускаем эффект с обработкой ошибок
      const output$ = effect(this.action$.asObservable(), this.dispatchers, this.services).pipe(
        catchError((err) => {
          console.error('Error in effect:', err)
          return of(null)
        }),
      )

      // Подписываемся на результат
      const subscription = output$.subscribe((result) => {
        if (result === null || result === undefined) {
          return // Игнорируем null и undefined
        }

        // Если результат - функция, вызываем ее
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
 * Класс для управления эффектами с поддержкой доступа к состоянию
 * Основной класс, который следует использовать
 */
export class EffectsModule<TState extends Record<string, any> = any, TDispatchers extends Record<string, Dispatcher<any, any>> = {}, TServices extends Record<string, any> = {}> {
  private effects: Effect<TState, TDispatchers, TServices>[] = []
  private subscriptions: Array<{ unsubscribe: () => void }> = []
  private running = false
  private action$ = new Subject<Action>()

  /**
   * Поток состояния
   */
  public readonly state$: Observable<TState>

  /**
   * Создает модуль эффектов с доступом к состоянию
   * @param dispatchers Объект с диспетчерами
   * @param services Объект с сервисами
   * @param storage Хранилище состояния
   */
  constructor(
    private dispatchers: TDispatchers,
    private services: TServices = {} as TServices,
    private storage: IStorage<TState>,
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
    }).pipe(
      // Используем share() чтобы не создавать множество подписок
      share(),
    )
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

  /**
   * Добавляет эффект в модуль
   * @param effect Эффект для добавления
   * @returns Текущий модуль
   */
  add(effect: Effect<TState, TDispatchers, TServices>): this {
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
  addEffects(effects: Effect<TState, TDispatchers, TServices>[]): this {
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
  private subscribeToEffect(effect: Effect<TState, TDispatchers, TServices>): void {
    try {
      // Запускаем эффект с обработкой ошибок
      const output$ = effect(this.action$.asObservable(), this.state$, this.dispatchers, this.services).pipe(
        catchError((err) => {
          console.error('Error in effect:', err)
          return of(null)
        }),
      )

      // Подписываемся на результат
      const subscription = output$.subscribe((result) => {
        if (result === null || result === undefined) {
          return // Игнорируем null и undefined
        }

        // Если результат - функция, вызываем ее
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
 * Вспомогательная функция для создания типизированного эффекта с состоянием
 * @deprecated Используйте createEffect вместо этого
 */
export function createEffectBase<TDispatchers extends Record<string, Dispatcher<any, any>>, TServices extends Record<string, any>>(
  effect: EffectBase<TDispatchers, TServices>,
): EffectBase<TDispatchers, TServices> {
  return effect
}

/**
 * Вспомогательная функция для создания типизированного эффекта с состоянием
 */
export function createEffect<TState extends Record<string, any>, TDispatchers extends Record<string, Dispatcher<any, any>>, TServices extends Record<string, any>>(
  effect: Effect<TState, TDispatchers, TServices>,
): Effect<TState, TDispatchers, TServices> {
  return effect
}

/**
 * Объединяет несколько эффектов в один
 * @param effects Эффекты для объединения
 * @returns Объединенный эффект
 */
export function combineEffects<TState extends Record<string, any>, TDispatchers extends Record<string, Dispatcher<any, any>>, TServices extends Record<string, any>>(
  ...effects: Effect<TState, TDispatchers, TServices>[]
): Effect<TState, TDispatchers, TServices> {
  return (action$, state$, dispatchers, services) => {
    const outputs = effects.map((effect) => {
      try {
        return effect(action$, state$, dispatchers, services)
      } catch (error) {
        console.error('Error in one of combined effects:', error)
        return of(null)
      }
    })
    return merge(...outputs)
  }
}
