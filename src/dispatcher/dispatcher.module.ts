import { Observable, Subject } from 'rxjs'

import { TypedAction } from '../effects'
import { IStorage } from '../storage'

/**
 * Базовая структура действия
 */
export interface Action<T = unknown> {
  type: string
  payload?: T
  meta?: Record<string, any>
}

// Параметры исполнения функции действия
interface ActionExecutionOptions {
  // Веб-воркер для выполнения действия
  worker?: Worker
  // Функция мемоизации
  memoize?: (currentArgs: any[], previousArgs: any[], previousResult: any) => boolean
  // Другие опции выполнения
  timeout?: number
  retry?: number | { count: number; delay: number }
}

/**
 * Параметры для создания действия в новом стиле
 */
export interface ActionDefinition<TParams, TResult> {
  /** Тип действия для идентификации в потоке и эффектах */
  type: string
  /** Функция, выполняющая действие и возвращающая результат (payload) */
  action: (params: TParams) => Promise<TResult> | TResult
  /** Дополнительные метаданные (опционально) */
  meta?: Record<string, any>
}

// Определение типа для watcher'а
interface WatcherDefinition<T, R> {
  type: string
  selector: (state: T) => R
  meta?: Record<string, any>
  // Опционально - функция для определения, изменилось ли значение
  shouldTrigger?: (prev: R | undefined, current: R) => boolean
}

// Тип для функции watcher
interface WatcherFunction<R> {
  (): Observable<TypedAction<R>>
  actionType: string
  meta?: Record<string, any>
}

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
}

/**
 * Тип для фабрики создателей действий
 */
type ActionCreatorFactory = <TParams, TResult>(config: ActionDefinition<TParams, TResult>, executionOptions?: ActionExecutionOptions) => DispatchFunction<TParams, TResult>

/**
 * Тип для функции настройки действий
 * Похож на настройку эндпоинтов в API модуле
 */
export type ActionsSetup<T extends Record<string, unknown>> = (create: ActionCreatorFactory, storage: IStorage<T>) => Record<string, DispatchFunction<any, any>>

/**
 * Вспомогательные типы для извлечения типов из Dispatcher
 */

/** Извлекает тип результата (payload) из функции диспетчера */
export type ExtractResultType<T> = T extends DispatchFunction<any, infer R> ? R : never

/** Тип для извлечения типов из функции настройки действий */
export type ActionsResult<F> = F extends (create: ActionCreatorFactory, storage: any) => infer R ? R : Record<string, DispatchFunction<any, any>>

/**
 * Класс Dispatcher для интеграции хранилищ с реактивной системой
 */
/**
 * Класс Dispatcher для интеграции хранилищ с реактивной системой.
 * Фокусируется только на создании и диспетчеризации действий,
 * делегируя хранение и получение данных непосредственно хранилищу.
 */
export class Dispatcher<T extends Record<string, any>, TActionsFn extends ActionsSetup<T> = ActionsSetup<T>> {
  // Поток действий
  private actions$ = new Subject<Action>()

  // Публичный Observable для действий
  public readonly actions: Observable<Action> = this.actions$.asObservable()

  public watchers: Record<string, WatcherFunction<any>> = {}

  // Методы диспетчеризации действий с типизацией
  public dispatch: ActionsResult<TActionsFn> & Record<string, DispatchFunction<any, any>> = {} as ActionsResult<TActionsFn> & Record<string, DispatchFunction<any, any>>

  /**
   * Создает новый экземпляр Dispatcher
   * @param storage Хранилище данных
   * @param actionsSetup Функция настройки действий
   */
  constructor(
    private storage: IStorage<T>,
    actionsSetup?: TActionsFn,
  ) {
    // Настраиваем действия, если они переданы
    if (actionsSetup) {
      this.setupActions(actionsSetup)
    }
  }

  /**
   * Получает все действия с улучшенной типизацией
   * @returns Типизированный объект действий
   */
  public getActions(): ActionsResult<TActionsFn> {
    return this.dispatch as ActionsResult<TActionsFn>
  }

  /**
   * Настраивает действия
   * @param setupActions Функция настройки действий
   */
  private setupActions(setupActions: ActionsSetup<T>) {
    // Вспомогательная функция для выполнения в worker
    async function executeInWorker<TParams, TResult>(
      worker: Worker,
      actionType: string,
      args: TParams[],
      fallbackAction?: (...args: TParams[]) => Promise<TResult> | TResult,
    ): Promise<TResult> {
      return new Promise((resolve, reject) => {
        const requestId = `${actionType}_${Date.now()}_${Math.random()}`

        const handleMessage = (event: MessageEvent) => {
          if (event.data.requestId === requestId) {
            worker.removeEventListener('message', handleMessage)

            if (event.data.error) {
              reject(new Error(event.data.error))
            } else {
              resolve(event.data.result)
            }
          }
        }

        worker.addEventListener('message', handleMessage)

        worker.postMessage({
          type: actionType,
          args,
          requestId,
        })

        // Опционально: таймаут
        setTimeout(() => {
          worker.removeEventListener('message', handleMessage)
          reject(new Error(`Worker execution timeout for action: ${actionType}`))
        }, 30000)
      })
    }

    const actionCreator: ActionCreatorFactory = <TParams, TResult>(
      actionConfig: ActionDefinition<TParams, TResult>,
      executionOptions?: ActionExecutionOptions,
    ): DispatchFunction<TParams, TResult> => {
      // Для мемоизации храним последние аргументы и результат
      let lastArgs: TParams[] | null = null
      let lastResult: TResult | null = null

      // Создаем функцию диспетчеризации
      const dispatchFn = async (...args: TParams[]): Promise<TResult> => {
        // Проверяем мемоизацию
        if (executionOptions?.memoize && lastArgs && lastResult) {
          if (executionOptions.memoize(args, lastArgs, lastResult)) {
            return lastResult
          }
        }

        let result: TResult

        // Выполняем действие в worker или напрямую
        if (executionOptions?.worker) {
          result = await executeInWorker(executionOptions.worker, actionConfig.type, args, actionConfig.action)
        } else {
          // Обычное выполнение
          // @ts-ignore
          result = await Promise.resolve(actionConfig.action(...args))
        }

        // Сохраняем аргументы и результат для мемоизации
        lastArgs = [...args]
        lastResult = result

        // Отправляем информацию о действии в поток
        this.actions$.next({
          type: actionConfig.type,
          payload: result,
          meta: actionConfig.meta,
        })

        return result
      }

      // Добавляем тип действия как свойство функции
      Object.defineProperty(dispatchFn, 'actionType', {
        value: actionConfig.type,
        writable: false,
        enumerable: true,
      })

      // Добавляем метаданные, если они есть
      if (actionConfig.meta) {
        Object.defineProperty(dispatchFn, 'meta', {
          value: actionConfig.meta,
          writable: false,
          enumerable: true,
        })
      }

      return dispatchFn as DispatchFunction<TParams, TResult>
    }

    // Создаем действия
    const actions = setupActions(actionCreator, this.storage)

    // Регистрируем действия в диспетчере
    for (const [key, dispatchFn] of Object.entries(actions)) {
      //@ts-ignore
      this.dispatch[key] = dispatchFn
    }
  }

  public createWatcher<R>(config: WatcherDefinition<T, R>): WatcherFunction<R> {
    // Создаем Subject для этого watcher'а
    const subject = new Subject<TypedAction<R>>()

    // Предыдущее значение для сравнения
    let prevValue: R | undefined

    // Подписываемся на изменения состояния
    const unsubscribe = this.storage.subscribe(config.selector, (value: R) => {
      // Проверяем, нужно ли генерировать событие
      if (!config.shouldTrigger || config.shouldTrigger(prevValue, value)) {
        // Создаем действие
        const action: TypedAction<R> = {
          type: config.type,
          payload: value,
          meta: config.meta,
        }

        // Отправляем в основной поток действий
        this.actions$.next(action)

        // Отправляем в поток этого watcher'а
        subject.next(action)

        // Обновляем предыдущее значение
        prevValue = value
      }
    })

    // Создаем функцию watcher'а
    const watcherFn = () => subject.asObservable()

    // Добавляем свойства
    Object.defineProperty(watcherFn, 'actionType', {
      value: config.type,
      writable: false,
      enumerable: true,
    })

    if (config.meta) {
      Object.defineProperty(watcherFn, 'meta', {
        value: config.meta,
        writable: false,
        enumerable: true,
      })
    }

    // Добавляем метод для отписки
    Object.defineProperty(watcherFn, 'unsubscribe', {
      value: unsubscribe,
      writable: false,
      enumerable: true,
    })

    // Регистрируем watcher
    this.watchers[config.type] = watcherFn as WatcherFunction<R>

    return watcherFn as WatcherFunction<R>
  }
}

/**
 * Функция для создания типизированного диспетчера
 * Помогает с выводом типов при создании диспетчера
 */
export function createTypedDispatcher<TState extends Record<string, any>, TActions extends ActionsSetup<TState>>(
  storage: IStorage<TState>,
  actions: TActions,
): Dispatcher<TState, TActions> {
  return new Dispatcher(storage, actions)
}
