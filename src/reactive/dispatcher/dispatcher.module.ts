import { Observable, Subject } from 'rxjs'

import { IStorage } from '../../core/storage'
import { TypedAction } from '../effects'

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
}

/**
 * Параметры для создания действия
 */
export interface ActionDefinition<TParams, TResult> {
  /** Тип действия для идентификации в потоке и эффектах */
  type: string
  /** Функция, выполняющая действие и возвращающая результат (payload) */
  action: (params: TParams) => Promise<TResult> | TResult
  /** Дополнительные метаданные (опционально) */
  meta?: Record<string, any>
}

/**
 * Определение типа для watcher'а
 */
interface WatcherDefinition<T, R> {
  type: string
  selector: (state: T) => R
  meta?: Record<string, any>
  // Опционально - функция для определения, изменилось ли значение
  shouldTrigger?: (prev: R | undefined, current: R) => boolean
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
export type ActionsSetupWithUtils<T extends Record<string, unknown>> = (
  storage: IStorage<T>,
  utils: {
    createAction: ActionCreatorFactory
    createWatcher: <R>(config: WatcherDefinition<T, R>) => WatcherFunction<R>
  },
) => Record<string, DispatchFunction<any, any> | WatcherFunction<any>>

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
type ActionCreatorFactory = <TParams, TResult>(config: ActionDefinition<TParams, TResult>, executionOptions?: ActionExecutionOptions) => DispatchFunction<TParams, TResult>

/**
 * Тип для функции настройки действий
 */
export type ActionsSetup<T extends Record<string, unknown>> = (create: ActionCreatorFactory, storage: IStorage<T>) => Record<string, DispatchFunction<any, any>>

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
export type DispatchActions<T> = {
  [K in keyof T]: T[K] extends DispatchFunction<any, any> ? T[K] : never
}

/**
 * Типизированный объект watchers
 */
export type WatcherActions<T> = {
  [K in keyof T]: T[K] extends WatcherFunction<any> ? T[K] : never
}

/**
 * Параметры для Dispatcher
 */
interface DispatcherOptions<T extends Record<string, any>> {
  // Хранилище - обязательный параметр
  storage: IStorage<T>
  // Опциональные параметры
  worker?: Worker
}

/**
 * Класс Dispatcher для интеграции хранилищ с реактивной системой
 */
export class Dispatcher<T extends Record<string, any>, TActionsFn extends ActionsSetupWithUtils<T> = ActionsSetupWithUtils<T>> {
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

  /**
   * Создает новый экземпляр Dispatcher
   */
  constructor(private options: DispatcherOptions<T>) {
    this.storage = options.storage
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
   * Создает действие
   */
  public createAction<TParams, TResult>(actionConfig: ActionDefinition<TParams, TResult>, executionOptions?: ActionExecutionOptions): DispatchFunction<TParams, TResult> {
    const actionType = `[${this.storage.name}]${actionConfig.type}`
    // Для мемоизации храним последние аргументы и результат
    let lastArgs: TParams[] | null = null
    let lastResult: TResult | null = null

    // Создаем функцию диспетчеризации
    const dispatchFn = async (params: TParams): Promise<TResult> => {
      const args = [params] as TParams[]

      // Проверяем мемоизацию
      if (executionOptions?.memoize && lastArgs && lastResult) {
        if (executionOptions.memoize(args, lastArgs, lastResult)) {
          return lastResult
        }
      }

      let result: TResult

      // Выполняем действие в worker или напрямую
      if (executionOptions?.worker) {
        result = await this.executeInWorker(executionOptions.worker, actionType, args, actionConfig.action)
      } else {
        // Обычное выполнение
        result = await Promise.resolve(actionConfig.action(params))
      }

      // Сохраняем аргументы и результат для мемоизации
      lastArgs = [...args]
      lastResult = result

      // Отправляем информацию о действии в поток
      this.actions$.next({
        type: actionType,
        payload: result,
        meta: actionConfig.meta,
      })

      return result
    }

    dispatchFn._type = 'dispatch'
    // Добавляем тип действия как свойство функции
    Object.defineProperty(dispatchFn, 'actionType', {
      value: actionType,
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

  /**
   * Создает watcher для отслеживания изменений в хранилище
   */
  public createWatcher<R>(config: WatcherDefinition<T, R>): WatcherFunction<R> {
    const actionType = `[${this.storage.name}]${config.type}`

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
          type: actionType,
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
    watcherFn._type = 'watchers'
    // Добавляем свойства
    Object.defineProperty(watcherFn, 'actionType', {
      value: actionType,
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

    //@ts-ignore
    return watcherFn as WatcherFunction<R>
  }

  /**
   * Выполняет действие в worker
   */
  private async executeInWorker<TParams, TResult>(
    worker: Worker,
    actionType: string,
    args: TParams[],
    fallbackAction?: (params: TParams) => Promise<TResult> | TResult,
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
      }, 30000) // 30 секунд таймаут
    })
  }
}

/**
 * Функция для создания типизированного диспетчера
 */
export function createTypedDispatcher<TState extends Record<string, any>, TActions extends ActionsSetupWithUtils<TState>>(
  options: DispatcherOptions<TState>,
  actionsSetup: TActions,
): Dispatcher<TState, TActions> & {
  dispatch: DispatchActions<ReturnType<TActions>>
  watchers: WatcherActions<ReturnType<TActions>>
} {
  // Создаем экземпляр диспетчера
  const dispatcher = new Dispatcher<TState, TActions>(options)

  // Вызываем функцию настройки действий с обновленной структурой аргументов
  const actions = actionsSetup(options.storage, {
    createAction: (actionConfig, executionOptions) => dispatcher.createAction(actionConfig, executionOptions),
    createWatcher: (config) => dispatcher.createWatcher(config),
  })

  // Регистрируем все созданные объекты в соответствующих коллекциях
  for (const [key, fn] of Object.entries(actions)) {
    if (typeof fn === 'function') {
      const type = (fn as any)._type
      // @ts-ignore
      dispatcher[type][key] = fn
    }
  }

  return dispatcher as Dispatcher<TState, TActions> & {
    dispatch: DispatchActions<ReturnType<TActions>>
    watchers: WatcherActions<ReturnType<TActions>>
  }
}
