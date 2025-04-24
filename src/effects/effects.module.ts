import { combineLatest, merge, Observable, of, OperatorFunction, Subject } from 'rxjs'
import { catchError, filter, map, take } from 'rxjs/operators'

import { Action, ActionsResult, Dispatcher, DispatchFunction, ExtractResultType } from '../dispatcher/dispatcher.module'

/**
 * Тип действия с типизированным payload
 */
export interface TypedAction<P> extends Action<P> {
  type: string
  payload: P
}

/**
 * Тип для эффектов с расширенными зависимостями и поддержкой типизированных диспетчеров
 */
export type Effect<TDispatchers extends Record<string, Dispatcher<any, any>> = {}, TServices extends Record<string, any> = {}> = (
  action$: Observable<Action>,
  dispatchers: TDispatchers,
  services: TServices,
) => Observable<unknown>

/**
 * Тип для получения типов действий диспетчера
 */
export type DispatcherActions<T> = T extends Dispatcher<any, infer A> ? ActionsResult<A> : Record<string, DispatchFunction<any, any>>

/**
 * Улучшенный оператор для фильтрации действий по типу с сохранением типа payload
 * @param actionFn Функция действия из dispatcher.dispatch
 */
export function ofType<T extends DispatchFunction<any, any>>(actionFn: T): OperatorFunction<Action, TypedAction<ExtractResultType<T>>> {
  const { actionType } = actionFn

  if (!actionType) {
    console.warn('ofType: Action function does not have actionType property', actionFn)
    return filter(() => false) as OperatorFunction<Action, TypedAction<ExtractResultType<T>>>
  }

  // Улучшенная реализация с явными типами для лучшего вывода типов
  return (source$: Observable<Action>): Observable<TypedAction<ExtractResultType<T>>> => {
    return source$.pipe(filter((action): action is TypedAction<ExtractResultType<T>> => action !== undefined && action.type === actionType))
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
 * Класс для управления эффектами с расширенными возможностями
 */
export class EffectsModule<TDispatchers extends Record<string, Dispatcher<any, any>> = {}, TServices extends Record<string, any> = {}> {
  private effects: Effect<TDispatchers, TServices>[] = []
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
  add(effect: Effect<TDispatchers, TServices>): this {
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
  addEffects(effects: Effect<TDispatchers, TServices>[]): this {
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
  private subscribeToEffect(effect: Effect<TDispatchers, TServices>): void {
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
 * Вспомогательная функция для создания типизированного эффекта
 * Помогает с выводом типов при определении эффектов
 */
export function createEffect<TDispatchers extends Record<string, Dispatcher<any, any>>, TServices extends Record<string, any>>(
  effect: Effect<TDispatchers, TServices>,
): Effect<TDispatchers, TServices> {
  return effect
}

/**
 * Объединяет несколько эффектов в один
 * @param effects Эффекты для объединения
 * @returns Объединенный эффект
 */
export function combineEffects<TDispatchers extends Record<string, Dispatcher<any, any>>, TServices extends Record<string, any>>(
  ...effects: Effect<TDispatchers, TServices>[]
): Effect<TDispatchers, TServices> {
  return (action$, dispatchers, services) => {
    const outputs = effects.map((effect) => {
      try {
        return effect(action$, dispatchers, services)
      } catch (error) {
        console.error('Error in one of combined effects:', error)
        return of(null)
      }
    })
    return merge(...outputs)
  }
}
