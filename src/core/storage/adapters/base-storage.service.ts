import { batchingMiddleware } from '../middlewares/storage-batching.middleware'
import { shallowCompareMiddleware } from '../middlewares/storage-shallow-compare.middleware'
import { IPluginExecutor } from '../modules/plugin/plugin.interface'
import { DefaultMiddlewares, IEventEmitter, ILogger, IStorage, StorageConfig, StorageEvent, StorageEvents } from '../storage.interface'
import { Middleware, MiddlewareModule } from '../utils/middleware-module'
import { StorageKeyType } from '../utils/storage-key'

type PathSelector<T, R> = (state: T) => R

export abstract class BaseStorage<T extends Record<string, any>> implements IStorage<T> {
  // Константа для глобальной подписки
  protected static readonly GLOBAL_SUBSCRIPTION_KEY = '*'

  name: string

  private middlewareModule: MiddlewareModule

  private initializedMiddlewares: Middleware[] | null = null

  protected subscribers = new Map<StorageKeyType, Set<(value: any) => void>>()

  constructor(
    protected readonly config: StorageConfig,
    protected readonly pluginExecutor?: IPluginExecutor,
    protected readonly eventEmitter?: IEventEmitter,
    protected readonly logger?: ILogger,
  ) {
    this.name = config.name
    this.middlewareModule = new MiddlewareModule({
      getState: this.getState.bind(this),
      // Предоставляем базовые операции хранилища
      doGet: this.doGet.bind(this),
      doSet: this.doSet.bind(this),
      doUpdate: this.doUpdate.bind(this),
      doDelete: this.doDelete.bind(this),
      doClear: this.doClear.bind(this),
      doKeys: this.doKeys.bind(this),
      // Предоставляем методы для работы с подписчиками
      notifySubscribers: this.notifySubscribers.bind(this),
      // Предоставляем плагины и эмиттер
      pluginExecutor: this.pluginExecutor,
      eventEmitter: this.eventEmitter,
      logger: this.logger,
    })

    this.initializeMiddlewares()
  }

  protected initializeMiddlewares(): void {
    if (this.config.middlewares && !this.initializedMiddlewares) {
      // Создаем middleware только один раз
      this.initializedMiddlewares = this.config.middlewares(() => this.getDefaultMiddleware())

      // Применяем их
      this.initializedMiddlewares.forEach((middleware) => this.middlewareModule.use(middleware))
    }
  }

  protected getDefaultMiddleware(): DefaultMiddlewares {
    return {
      batching: (options = {}) => batchingMiddleware(options),
      shallowCompare: (options = {}) => shallowCompareMiddleware(options),
    }
  }

  protected async initializeWithMiddlewares(): Promise<void> {
    try {
      const state = await this.getState()
      const hasExistingState = Object.keys(state).length > 0

      if (!hasExistingState && this.config.initialState) {
        // Только если нет существующих данных и есть initialState,
        // делаем dispatch для установки начального состояния
        await this.middlewareModule.dispatch({
          type: 'init',
          value: this.config.initialState,
        })
      }
    } catch (error) {
      this.logger?.error('Ошибка инициализации хранилища', { error })
      throw error
    }
  }

  public abstract initialize(): Promise<this>

  protected abstract doGet(key: StorageKeyType): Promise<any>

  protected abstract doSet(key: StorageKeyType, value: any): Promise<void>

  protected abstract doUpdate(updates: Array<{ key: StorageKeyType; value: any }>): Promise<void>

  protected abstract doDelete(key: StorageKeyType): Promise<boolean>

  protected abstract doClear(): Promise<void>

  protected abstract doKeys(): Promise<string[]>

  protected abstract doHas(key: StorageKeyType): Promise<boolean>

  protected abstract doDestroy(): Promise<void>

  public async get<R>(key: StorageKeyType): Promise<R | undefined> {
    try {
      const metadata = { operation: 'get', timestamp: Date.now(), key }

      // Передаем в middleware chain
      const middlewareResult = await this.middlewareModule.dispatch({
        type: 'get',
        key,
        metadata,
      })

      // Обрабатываем значение через плагины
      const finalResult = (await this.pluginExecutor?.executeAfterGet(key, middlewareResult, metadata)) ?? middlewareResult

      await this.emitEvent({
        type: StorageEvents.STORAGE_SELECT,
        payload: { key, value: finalResult },
      })

      return finalResult
    } catch (error) {
      this.logger?.error('Error getting value', { key, error })
      throw error
    }
  }

  public async set<R>(key: StorageKeyType, value: R): Promise<void> {
    try {
      const metadata = { operation: 'set', timestamp: Date.now(), key }

      // Обрабатываем значение через плагины
      const processedValue = (await this.pluginExecutor?.executeBeforeSet(value, metadata)) ?? value

      // Передаем в middleware chain
      const middlewareResult = await this.middlewareModule.dispatch({
        type: 'set',
        key,
        value: processedValue,
        metadata,
      })

      // Проверяем метаданные, добавленные shallowCompare middleware
      const valueNotChanged = middlewareResult?.__metadata?.valueNotChanged === true
      // Финальная обработка значения, передаем оригинальный ключ
      let finalResult

      if (valueNotChanged && middlewareResult?.__metadata?.originalValue !== undefined) {
        // Если значение не изменилось, используем оригинальное значение без метаданных
        finalResult = middlewareResult.__metadata.originalValue
      } else {
        finalResult = (await this.pluginExecutor?.executeAfterSet(key, middlewareResult, metadata)) ?? middlewareResult
      }

      // Уведомляем подписчиков только если значение изменилось
      if (!valueNotChanged) {
        this.notifySubscribers(key, finalResult)
        this.notifySubscribers(BaseStorage.GLOBAL_SUBSCRIPTION_KEY, {
          type: StorageEvents.STORAGE_UPDATE,
          key,
          value: finalResult,
        })

        await this.emitEvent({
          type: StorageEvents.STORAGE_UPDATE,
          payload: { key, value: finalResult },
        })
      }
    } catch (error) {
      this.logger?.error('Error setting value', { key, error })
      throw error
    }
  }

  public async update(updater: (state: T) => void): Promise<void> {
    try {
      const metadata = { operation: 'update', timestamp: Date.now() }

      // Получаем текущее состояние
      const currentState = (await this.getState()) as T
      const newState = { ...currentState } as T

      // Применяем обновление
      updater(newState)

      // Определяем, какие ключи изменились
      const changedKeys = Object.keys(newState).filter((key) => !this.isEqual(currentState[key], newState[key]))

      // Если нет изменений, завершаем метод
      if (changedKeys.length === 0) return

      // Обрабатываем каждый измененный ключ
      const updates = await Promise.all(
        changedKeys.map(async (key: string) => {
          // Добавляем ключ в метаданные для каждого обновления
          const keyMetadata = { ...metadata, key }

          // Обрабатываем значение через плагины с метаданными содержащими ключ
          const processedValue = (await this.pluginExecutor?.executeBeforeSet(newState[key], keyMetadata)) ?? newState[key]
          return { key, value: processedValue }
        }),
      )

      // Делаем dispatch для batch-обновления
      const result = await this.middlewareModule.dispatch({
        type: 'update',
        value: updates,
        metadata: {
          ...metadata,
          batchUpdate: true,
        },
      })

      // Преобразуем результат в объект для удобной работы
      let updatedValues: Record<string, any> = {}

      if (Array.isArray(result)) {
        // Если результат - массив обновлений
        result.forEach((update) => {
          if (update && typeof update === 'object' && 'key' in update && 'value' in update) {
            updatedValues[update.key as string] = update.value
          }
        })
      } else if (result && typeof result === 'object') {
        // Если результат - объект с ключами и значениями
        updatedValues = { ...result }
      }

      // Определяем, какие ключи действительно изменились после обработки middleware
      const actuallyChangedKeys = Object.keys(updatedValues).filter((key) => !this.isEqual(currentState[key], updatedValues[key]))

      // Если нет реальных изменений после обработки middleware, завершаем работу
      if (actuallyChangedKeys.length === 0) return

      // Создаем объект только с действительно измененными значениями
      const finalUpdates: Record<string, any> = {}
      actuallyChangedKeys.forEach((key) => {
        finalUpdates[key] = updatedValues[key]
      })

      // Уведомляем подписчиков о глобальном обновлении, только если есть реальные изменения
      this.notifySubscribers(BaseStorage.GLOBAL_SUBSCRIPTION_KEY, {
        type: StorageEvents.STORAGE_UPDATE,
        key: actuallyChangedKeys,
        value: finalUpdates,
      })

      // Уведомляем подписчиков только для действительно измененных ключей
      Object.entries(finalUpdates).forEach(([key, finalResult]) => {
        this.notifySubscribers(key, finalResult)
      })

      // Отправляем событие только с реально измененными данными
      await this.emitEvent({
        type: StorageEvents.STORAGE_UPDATE,
        payload: {
          state: finalUpdates,
          key: actuallyChangedKeys,
        },
      })
    } catch (error) {
      this.logger?.error('Error updating state', { error })
      throw error
    }
  }

  public async delete(key: StorageKeyType): Promise<void> {
    try {
      const metadata = { operation: 'delete', timestamp: Date.now(), key }

      // Проверяем возможность удаления
      if (await this.pluginExecutor?.executeBeforeDelete(key, metadata)) {
        const middlewareResult = await this.middlewareModule.dispatch({
          type: 'delete',
          key,
          metadata,
        })

        // Выполняем afterDelete с оригинальным ключом
        await this.pluginExecutor?.executeAfterDelete(key, metadata)

        // Уведомляем подписчиков используя оригинальный ключ
        this.notifySubscribers(key, undefined)
        this.notifySubscribers(BaseStorage.GLOBAL_SUBSCRIPTION_KEY, {
          type: StorageEvents.STORAGE_UPDATE,
          key,
          value: undefined,
          result: middlewareResult,
        })

        await this.emitEvent({
          type: StorageEvents.STORAGE_UPDATE,
          payload: { key, value: undefined, result: middlewareResult },
        })
      }
    } catch (error) {
      this.logger?.error('Error deleting value', { key, error })
      throw error
    }
  }

  public async clear(): Promise<void> {
    try {
      this.pluginExecutor?.executeOnClear()

      await this.middlewareModule.dispatch({
        type: 'clear',
      })
    } catch (error) {
      this.logger?.error('Error clearing storage', { error })
      throw error
    }
  }

  public async keys(): Promise<string[]> {
    try {
      return await this.middlewareModule.dispatch({
        type: 'keys',
      })
    } catch (error) {
      this.logger?.error('Error getting keys', { error })
      throw error
    }
  }

  public async has(key: StorageKeyType): Promise<boolean> {
    try {
      return await this.doHas(key)
    } catch (error) {
      this.logger?.error('Error checking value existence', { key, error })
      throw error
    }
  }

  public async getState(): Promise<T> {
    try {
      const value = await this.doGet('')
      return value || {}
    } catch (error) {
      this.logger?.error('Error getting state', { error })
      throw error
    }
  }

  // Вспомогательный метод для подписки на все изменения
  public subscribeToAll(callback: (event: { type: 'set' | 'delete' | 'clear'; key?: string[] | string; value?: any }) => void): VoidFunction {
    return this.subscribe(BaseStorage.GLOBAL_SUBSCRIPTION_KEY, callback)
  }

  // Перегрузки метода subscribe
  public subscribe(key: string, callback: (value: any) => void): VoidFunction

  public subscribe<R>(pathSelector: PathSelector<T, R>, callback: (value: R) => void): VoidFunction

  public subscribe<R>(keyOrSelector: string | PathSelector<T, R>, callback: (value: any) => void): VoidFunction {
    if (typeof keyOrSelector === 'string') {
      // Существующая логика для строкового ключа
      return this.subscribeByKey(keyOrSelector, callback)
    }
    // Новая логика для селектора пути
    return this.subscribeBySelector(keyOrSelector, callback)
  }

  private subscribeByKey(key: string, callback: (value: any) => void): VoidFunction {
    // Создаем коллекцию подписчиков, если ее еще нет
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }

    // Флаг для отслеживания отправки начального значения
    let initialValueSent = false

    // Добавляем колбэк в набор подписчиков
    this.subscribers.get(key)!.add(callback)

    // Получаем и отправляем начальное значение, но только один раз
    this.get(key).then((value) => {
      try {
        if (!initialValueSent) {
          initialValueSent = true
          callback(value)
        }
      } catch (error) {
        this.logger?.error('Error in initial callback', { key, error })
      }
    })

    // Возвращаем функцию отписки
    return () => {
      const subscribers = this.subscribers.get(key)
      if (subscribers) {
        subscribers.delete(callback)
        if (subscribers.size === 0) {
          this.subscribers.delete(key)
        }
      }
    }
  }

  private subscribeBySelector<R>(pathSelector: PathSelector<T, R>, callback: (value: R) => void): VoidFunction {
    // Получаем базовый путь из селектора (это будет наиболее верхний уровень объекта)
    const dummyState = this.createDummyState()
    const basePath = this.extractPath(pathSelector, dummyState)

    // Сохраняем оригинальный селектор
    const originalSelector = pathSelector

    // Создаем обертку для колбэка, которая применяет оригинальный селектор к текущему состоянию
    const wrappedCallback = async (value: any) => {
      try {
        // Получаем текущее полное состояние
        const currentState = (await this.getState()) as T

        // Если значение undefined или null, просто передаем его в callback
        if (value === undefined || value === null) {
          callback(value as R)
          return
        }

        // Применяем оригинальный селектор к текущему состоянию
        const selectedValue = originalSelector(currentState)

        // Передаем результат в callback
        callback(selectedValue as R)
      } catch (error) {
        this.logger?.error('Error in selector callback', { basePath, error })
        // В случае ошибки передаем исходное значение
        callback(value as R)
      }
    }

    // Используем полученный базовый путь для подписки
    return this.subscribeByKey(basePath, wrappedCallback)
  }

  // Вспомогательные методы
  private createDummyState(): T {
    const handler = {
      get: (target: any, prop: string) => {
        target[prop] = target[prop] || new Proxy({}, handler)
        return target[prop]
      },
    }
    return new Proxy({} as T, handler)
  }

  private extractPath(selector: (state: T) => any, dummyState: T): string {
    let lastAccessedPath = ''

    // Создаем прокси с рекурсивным обработчиком
    const createProxyHandler = (path = ''): ProxyHandler<any> => ({
      get: (target: any, prop: string) => {
        // Игнорируем служебные свойства Symbol
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop)
        }

        // Формируем текущий путь
        const currentPath = path ? `${path}.${prop}` : prop

        // Обновляем последний доступный путь
        lastAccessedPath = currentPath

        // Возвращаем новый прокси для вложенного свойства
        return new Proxy({}, createProxyHandler(currentPath))
      },

      // Обработка опциональной цепочки (?.)
      has: (target: any, prop: string) => {
        // Симулируем, что свойство существует для работы опциональной цепочки
        return true
      },
    })

    try {
      // Применяем селектор к прокси для отслеживания пути
      selector(new Proxy(dummyState, createProxyHandler()))
    } catch (error) {
      // Игнорируем ошибки - они могут возникать из-за доступа к несуществующим свойствам
    }

    // Получаем первую часть пути (до первой точки)
    const basePathParts = lastAccessedPath.split('.')
    if (basePathParts.length > 0) {
      return basePathParts[0]
    }

    return lastAccessedPath
  }

  protected notifySubscribers(key: StorageKeyType, value: any): void {
    const subscribers = this.subscribers.get(key)
    if (!subscribers?.size) return

    // Создаем безопасную копию подписчиков для итерации
    const subscribersCopy = new Set(subscribers)

    subscribersCopy.forEach((callback) => {
      try {
        callback(value)
      } catch (error) {
        this.logger?.error('Ошибка в подписчике на колбэк', { key, error })
      }
    })
  }

  private isEqual(a: any, b: any): boolean {
    // Простое сравнение для примера
    // В реальном приложении здесь должна быть более сложная логика сравнения
    return JSON.stringify(a) === JSON.stringify(b)
  }

  public async destroy(): Promise<void> {
    try {
      await this.clear()
      await this.doDestroy()

      // Очищаем middleware и соединения
      if (this.initializedMiddlewares) {
        // Если у middleware есть метод cleanup/destroy - вызываем его
        await Promise.all(
          this.initializedMiddlewares.map(async (middleware) => {
            if ('cleanup' in middleware) {
              await middleware.cleanup?.()
            }
          }),
        )
        this.initializedMiddlewares = null
      }

      await this.emitEvent({
        type: StorageEvents.STORAGE_DESTROY,
      })
    } catch (error) {
      this.logger?.error('Error destroying storage', { error })
      throw error
    }
  }

  protected async emitEvent(event: StorageEvent): Promise<void> {
    try {
      await this.eventEmitter?.emit({
        ...event,
        metadata: {
          ...(event.metadata || {}),
          timestamp: Date.now(),
          storageName: this.name,
        },
      })
    } catch (error) {
      this.logger?.error('Error emitting event', { event, error })
    }
  }
}
