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
      this.logger?.error('Error initializing storage', { error })
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
      const metadata = { operation: 'get', timestamp: Date.now() }

      // Декодируем ключ для хранилища
      const decodedKey = (await this.pluginExecutor?.executeKeyDecode(key)) ?? key

      // Передаем в middleware chain
      const middlewareResult = await this.middlewareModule.dispatch({
        type: 'get',
        key: decodedKey,
        metadata,
      })

      // Обрабатываем значение через плагины, передавая оригинальный ключ
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
      const metadata = { operation: 'set', timestamp: Date.now() }

      // Обрабатываем значение через плагины
      const processedValue = (await this.pluginExecutor?.executeBeforeSet(value, metadata)) ?? value

      // Кодируем ключ для хранилища
      const encodedKey = (await this.pluginExecutor?.executeKeyEncode(key)) ?? key

      // Передаем в middleware chain
      const middlewareResult = await this.middlewareModule.dispatch({
        type: 'set',
        key: encodedKey,
        value: processedValue,
        metadata,
      })

      // Финальная обработка значения, передаем оригинальный ключ
      const finalResult = (await this.pluginExecutor?.executeAfterSet(key, middlewareResult, metadata)) ?? middlewareResult

      // Уведомляем подписчиков используя оригинальный ключ
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

      const changedKeys = Object.keys(newState).filter((key) => !this.isEqual(currentState[key], newState[key]))
      if (changedKeys.length === 0) return

      // Обрабатываем каждый измененный ключ
      const updates = await Promise.all(
        changedKeys.map(async (key: string) => {
          // Кодируем ключ для хранилища
          const encodedKey = (await this.pluginExecutor?.executeKeyEncode(key)) ?? key
          // Обрабатываем значение через плагины
          const processedValue = (await this.pluginExecutor?.executeBeforeSet(newState[key], metadata)) ?? newState[key]
          return { key: encodedKey, value: processedValue }
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

      // Уведомляем подписчиков
      this.notifySubscribers(BaseStorage.GLOBAL_SUBSCRIPTION_KEY, {
        type: StorageEvents.STORAGE_UPDATE,
        value: result,
      })

      await this.emitEvent({
        type: StorageEvents.STORAGE_UPDATE,
        payload: { state: result },
      })
    } catch (error) {
      this.logger?.error('Error updating state', { error })
      throw error
    }
  }

  public async delete(key: StorageKeyType): Promise<void> {
    try {
      const metadata = { operation: 'delete', timestamp: Date.now() }

      // Кодируем ключ для хранилища
      const encodedKey = (await this.pluginExecutor?.executeKeyEncode(key)) ?? key

      // Проверяем возможность удаления
      if (await this.pluginExecutor?.executeBeforeDelete(encodedKey, metadata)) {
        const middlewareResult = await this.middlewareModule.dispatch({
          type: 'delete',
          key: encodedKey,
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
      // Кодируем ключ для хранилища
      const encodedKey = (await this.pluginExecutor?.executeKeyEncode(key)) ?? key
      return await this.doHas(encodedKey)
    } catch (error) {
      this.logger?.error('Error checking value existence', { key, error })
      throw error
    }
  }

  public async getState(): Promise<Record<string, any>> {
    try {
      // Кодируем пустой ключ для получения корневого состояния
      const encodedKey = (await this.pluginExecutor?.executeKeyEncode('')) ?? ''
      const value = await this.doGet(encodedKey)
      return value || {}
    } catch (error) {
      this.logger?.error('Error getting state', { error })
      throw error
    }
  }

  // Вспомогательный метод для подписки на все изменения
  public subscribeToAll(callback: (event: { type: 'set' | 'delete' | 'clear'; key?: string; value?: any }) => void): VoidFunction {
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

  private subscribeByKey(key: string, callback: (value: any) => void): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }

    this.subscribers.get(key)!.add(callback)

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

  private subscribeBySelector<R>(pathSelector: PathSelector<T, R>, callback: (value: R) => void): () => void {
    // Получаем путь из селектора
    const dummyState = this.createDummyState()
    const path = this.extractPath(pathSelector, dummyState)

    // Используем полученный путь для подписки
    return this.subscribeByKey(path, callback)
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
    const paths: string[] = []
    const handler = {
      get: (target: any, prop: string) => {
        paths.push(prop)
        return target[prop]
      },
    }

    const proxiedState = new Proxy(dummyState, handler)
    selector(proxiedState)
    return paths.join('.')
  }

  protected notifySubscribers(key: StorageKeyType, value: any): void {
    const subscribers = this.subscribers.get(key)
    if (!subscribers?.size) return

    subscribers.forEach((callback) => {
      try {
        callback(value)
      } catch (error) {
        console.error('Error in subscriber callback:', error)
        this.logger?.error('Error in subscriber callback', { key, error })
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
