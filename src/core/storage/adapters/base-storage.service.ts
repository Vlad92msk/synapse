import { batchingMiddleware } from '../middlewares/storage-batching.middleware'
import { shallowCompareMiddleware } from '../middlewares/storage-shallow-compare.middleware'
import { IPluginExecutor } from '../modules/plugin/plugin.interface'
import { DefaultMiddlewares, IEventEmitter, ILogger, IStorage, StorageConfig, StorageEvent, StorageEvents, StorageInitStatus, StorageStatus } from '../storage.interface'
import { Middleware, MiddlewareModule } from '../utils/middleware-module'
import { StorageKeyType } from '../utils/storage-key'
import { getValueByPath } from './path.utils'

type PathSelector<T, R> = (state: T) => R

export abstract class BaseStorage<T extends Record<string, any>> implements IStorage<T> {
  // Константа для глобальной подписки
  protected static readonly GLOBAL_SUBSCRIPTION_KEY = '*'

  name: string

  // Статус инициализации
  private _initStatus: StorageInitStatus = {
    status: StorageStatus.IDLE,
  }

  // Подписчики на изменения статуса
  private statusSubscribers = new Set<(status: StorageInitStatus) => void>()

  private selectorPathCache = new WeakMap<PathSelector<any, any>, string>()

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

  get initStatus(): StorageInitStatus {
    return { ...this._initStatus }
  }

  // Ожидание готовности хранилища
  async waitForReady(): Promise<this> {
    if (this._initStatus.status === StorageStatus.READY) {
      return this
    }

    if (this._initStatus.status === StorageStatus.ERROR) {
      throw this._initStatus.error || new Error('Storage initialization failed')
    }

    return new Promise((resolve, reject) => {
      const unsubscribe = this.onStatusChange((status) => {
        if (status.status === StorageStatus.READY) {
          unsubscribe()
          resolve(this)
        } else if (status.status === StorageStatus.ERROR) {
          unsubscribe()
          reject(status.error || new Error('Storage initialization failed'))
        }
      })
    })
  }

  // Подписка на изменения статуса
  onStatusChange(callback: (status: StorageInitStatus) => void): VoidFunction {
    this.statusSubscribers.add(callback)

    // Немедленно вызываем callback с текущим статусом
    callback(this.initStatus)

    return () => {
      this.statusSubscribers.delete(callback)
    }
  }

  // Обновление статуса инициализации
  private updateInitStatus(update: Partial<StorageInitStatus>): void {
    const previousStatus = this._initStatus.status

    this._initStatus = {
      ...this._initStatus,
      ...update,
    }

    // Логирование изменений статуса
    if (previousStatus !== this._initStatus.status) {
      this.logger?.debug(`Storage "${this.name}" status changed: ${previousStatus} -> ${this._initStatus.status}`)
    }

    // Уведомляем подписчиков
    const statusCopy = this.initStatus
    this.statusSubscribers.forEach((callback) => {
      try {
        callback(statusCopy)
      } catch (error) {
        this.logger?.error('Error in status change callback', { error })
      }
    })
  }

  // Обертка для инициализации с отслеживанием статуса
  public async initialize(): Promise<this> {
    // Если уже инициализировано
    if (this._initStatus.status === StorageStatus.READY) {
      return this
    }

    // Если уже в процессе инициализации, ждем завершения
    if (this._initStatus.status === StorageStatus.LOADING) {
      return this.waitForReady()
    }

    // Начинаем инициализацию
    this.updateInitStatus({
      status: StorageStatus.LOADING,
      error: undefined,
    })

    try {
      const result = await this.doInitialize()

      this.updateInitStatus({
        status: StorageStatus.READY,
        error: undefined,
      })

      return result
    } catch (error) {
      this.updateInitStatus({
        status: StorageStatus.ERROR,
        error: error instanceof Error ? error : new Error(String(error)),
      })

      throw error
    }
  }

  // Абстрактный метод для реальной инициализации
  protected abstract doInitialize(): Promise<this>

  // Проверка готовности перед операциями
  private ensureReady(): void {
    if (this._initStatus.status !== StorageStatus.READY) {
      throw new Error(`Storage "${this.name}" is not ready. Current status: ${this._initStatus.status}`)
    }
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

  protected abstract doGet(key: StorageKeyType): Promise<any>

  protected abstract doSet(key: StorageKeyType, value: any): Promise<void>

  protected abstract doUpdate(updates: Array<{ key: StorageKeyType; value: any }>): Promise<void>

  protected abstract doDelete(key: StorageKeyType): Promise<boolean>

  protected abstract doClear(): Promise<void>

  protected abstract doKeys(): Promise<string[]>

  protected abstract doHas(key: StorageKeyType): Promise<boolean>

  protected abstract doDestroy(): Promise<void>

  public async get<R>(key: StorageKeyType): Promise<R | undefined> {
    this.ensureReady()

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
    this.ensureReady()

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
        // Просто берем путь из первого параметра
        const keyStr = key.toString()
        const changedPaths = [keyStr]

        // Уведомляем подписчиков конкретного ключа
        this.notifySubscribers(key, finalResult)

        // Уведомляем глобальных подписчиков с информацией о пути
        this.notifySubscribers(BaseStorage.GLOBAL_SUBSCRIPTION_KEY, {
          type: StorageEvents.STORAGE_UPDATE,
          key,
          value: finalResult,
          changedPaths,
        })

        await this.emitEvent({
          type: StorageEvents.STORAGE_UPDATE,
          payload: {
            key,
            value: finalResult,
            changedPaths,
          },
        })
      }
    } catch (error) {
      this.logger?.error('Error setting value', { key, error })
      throw error
    }
  }

  public async update(updater: (state: T) => void): Promise<void> {
    this.ensureReady()

    try {
      const metadata = { operation: 'update', timestamp: Date.now() }

      // Получаем текущее состояние
      const currentState = (await this.getState()) as T

      // Используем structuredClone для создания глубокой копии
      const newState = structuredClone(currentState) as T

      // Применяем обновление
      updater(newState)

      // Находим все изменившиеся пути
      const changedPaths = this.findChangedPaths(currentState, newState)

      // Если нет изменений, завершаем метод
      if (changedPaths.size === 0) {
        if (this.logger?.debug) {
          this.logger.debug('No changes detected in update')
        }
        return
      }

      if (this.logger?.debug) {
        this.logger.debug('Changed paths:', { paths: Array.from(changedPaths) })
      }

      // Определяем изменившиеся верхнеуровневые ключи для middleware
      const changedTopLevelKeys = new Set<string>()
      for (const path of changedPaths) {
        const topLevelKey = path.split('.')[0]
        changedTopLevelKeys.add(topLevelKey)
      }

      // Подготавливаем обновления для middleware (только верхнеуровневые ключи)
      const updates = await Promise.all(
        Array.from(changedTopLevelKeys).map(async (key: string) => {
          const keyMetadata = { ...metadata, key }

          // Обрабатываем значение через плагины
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
          changedPaths: Array.from(changedPaths),
        },
      })

      // Преобразуем результат в объект
      let updatedValues: Record<string, any> = {}

      if (Array.isArray(result)) {
        result.forEach((update) => {
          if (update && typeof update === 'object' && 'key' in update && 'value' in update) {
            updatedValues[update.key as string] = update.value
          }
        })
      } else if (result && typeof result === 'object') {
        updatedValues = { ...result }
      }

      // Определяем действительно измененные ключи после middleware
      const actuallyChangedKeys = Object.keys(updatedValues).filter((key) => !this.isEqual(currentState[key], updatedValues[key]))

      if (actuallyChangedKeys.length === 0) {
        if (this.logger?.debug) {
          this.logger.debug('No actual changes after middleware processing')
        }
        return
      }

      // Создаем объект с измененными значениями
      const finalUpdates: Record<string, any> = {}
      actuallyChangedKeys.forEach((key) => {
        finalUpdates[key] = updatedValues[key]
      })

      if (this.logger?.debug) {
        this.logger.debug('Notifying subscribers about changes:', { keys: actuallyChangedKeys })
      }

      // Уведомляем о глобальном обновлении
      this.notifySubscribers(BaseStorage.GLOBAL_SUBSCRIPTION_KEY, {
        type: StorageEvents.STORAGE_UPDATE,
        key: actuallyChangedKeys,
        value: finalUpdates,
        changedPaths: Array.from(changedPaths), // Добавляем информацию о всех изменившихся путях
      })

      // Уведомляем подписчиков на ТОЧНЫЕ ИЗМЕНИВШИЕСЯ ПУТИ
      // Важное отличие от предыдущей реализации - уведомляем только о тех путях, которые
      // действительно изменились, а не обо всех вложенных объектах
      for (const path of changedPaths) {
        try {
          // Находим верхнеуровневый ключ
          const topLevelKey = path.split('.')[0]

          // Если верхнеуровневый ключ был изменен, используем его обновленное значение
          if (topLevelKey in finalUpdates) {
            let value

            if (path === topLevelKey) {
              // Если это верхнеуровневый ключ, используем его напрямую
              value = finalUpdates[topLevelKey]
            } else {
              // Иначе получаем значение по вложенному пути
              const restPath = path.substring(topLevelKey.length + 1)
              value = getValueByPath(finalUpdates[topLevelKey], restPath)
            }

            // Уведомляем подписчиков для этого конкретного пути
            if (value !== undefined) {
              this.notifySubscribers(path, value)
            }
          }
        } catch (error) {
          this.logger?.error('Error notifying path subscribers', { path, error })
        }
      }

      // Отправляем событие
      await this.emitEvent({
        type: StorageEvents.STORAGE_UPDATE,
        payload: {
          state: finalUpdates,
          key: actuallyChangedKeys,
          changedPaths: Array.from(changedPaths),
        },
      })
    } catch (error) {
      this.logger?.error('Error updating state', { error })
      throw error
    }
  }

  public async delete(key: StorageKeyType): Promise<void> {
    this.ensureReady()

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

        // Определяем путь изменения (по аналогии с set)
        const keyStr = key.toString()
        const changedPaths = [keyStr]

        // Уведомляем подписчиков используя оригинальный ключ
        this.notifySubscribers(key, undefined)
        this.notifySubscribers(BaseStorage.GLOBAL_SUBSCRIPTION_KEY, {
          type: StorageEvents.STORAGE_UPDATE,
          key,
          value: undefined,
          result: middlewareResult,
          changedPaths,
        })

        await this.emitEvent({
          type: StorageEvents.STORAGE_UPDATE,
          payload: {
            key,
            value: undefined,
            result: middlewareResult,
            changedPaths,
          },
        })
      }
    } catch (error) {
      this.logger?.error('Error deleting value', { key, error })
      throw error
    }
  }

  public async clear(): Promise<void> {
    this.ensureReady()

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
    this.ensureReady()

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
    this.ensureReady()
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
  public subscribeToAll(callback: (event: { type: string; key?: StorageKeyType[] | StorageKeyType; value?: any; changedPaths?: string[] }) => void): VoidFunction {
    // Подписываемся на глобальный ключ, который получает уведомления обо всех изменениях
    if (!this.subscribers.has(BaseStorage.GLOBAL_SUBSCRIPTION_KEY)) {
      this.subscribers.set(BaseStorage.GLOBAL_SUBSCRIPTION_KEY, new Set())
    }

    // Добавляем колбэк в набор подписчиков для глобального ключа
    this.subscribers.get(BaseStorage.GLOBAL_SUBSCRIPTION_KEY)!.add(callback)

    // Возвращаем функцию отписки
    return () => {
      const subscribers = this.subscribers.get(BaseStorage.GLOBAL_SUBSCRIPTION_KEY)
      if (subscribers) {
        subscribers.delete(callback)
        if (subscribers.size === 0) {
          this.subscribers.delete(BaseStorage.GLOBAL_SUBSCRIPTION_KEY)
        }
      }
    }
  }

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

      // Очищаем подписчиков статуса
      this.statusSubscribers.clear()

      // Сбрасываем статус
      this.updateInitStatus({
        status: StorageStatus.IDLE,
      })

      await this.emitEvent({
        type: StorageEvents.STORAGE_DESTROY,
      })
    } catch (error) {
      this.logger?.error('Error destroying storage', { error })
      throw error
    }
  }

  // Вспомогательные методы

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

  private createDummyState(): T {
    const handler = {
      get: (target: any, prop: string) => {
        target[prop] = target[prop] || new Proxy({}, handler)
        return target[prop]
      },
    }
    return new Proxy({} as T, handler)
  }

  private isEqual(a: any, b: any): boolean {
    // Если ссылки одинаковые, объекты равны
    if (a === b) return true

    // Если хотя бы один из объектов null/undefined, они равны только если оба null/undefined
    if (a == null || b == null) return a === b

    // Если типы различаются, объекты не равны
    const typeA = typeof a
    const typeB = typeof b
    if (typeA !== typeB) return false

    // Обработка примитивных типов
    if (typeA !== 'object') return a === b

    // Обработка различных типов объектов

    // Обработка Date объектов
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime()
    }

    // Обработка массивов
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false

      for (let i = 0; i < a.length; i++) {
        if (!this.isEqual(a[i], b[i])) return false
      }

      return true
    }

    // Обработка обычных объектов
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)

    if (keysA.length !== keysB.length) return false

    return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && this.isEqual(a[key], b[key]))
  }

  /**
   * Возвращает полный путь, а не только корневой ключ
   */
  private extractPath(selector: (state: T) => any, dummyState: T): string {
    // Проверяем кэш
    if (this.selectorPathCache.has(selector)) {
      return this.selectorPathCache.get(selector)!
    }

    const accessedPaths: string[] = []

    // Создаем прокси с рекурсивным обработчиком для отслеживания доступа к свойствам
    const createProxyHandler = (path = ''): ProxyHandler<any> => ({
      get: (target: any, prop: string) => {
        // Игнорируем служебные свойства Symbol
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop)
        }

        // Формируем текущий путь
        const currentPath = path ? `${path}.${prop}` : prop

        // Сохраняем путь в список
        accessedPaths.push(currentPath)

        // Возвращаем новый прокси для вложенного свойства
        return new Proxy({}, createProxyHandler(currentPath))
      },

      // Обработка опциональной цепочки (?.)
      has: (target: any, prop: string) => {
        // Симулируем, что свойство существует для работы опциональной цепочки
        return true
      },

      // Поддержка для Array.prototype.map и других операций над массивами
      ownKeys: () => [],
      getOwnPropertyDescriptor: () => ({
        configurable: true,
        enumerable: true,
      }),

      apply: (target: any, thisArg: any, args: any[]) => {
        // Обработка вызова функций (например, массивы могут иметь методы)
        return new Proxy(() => {}, createProxyHandler(path))
      },
    })

    try {
      // Применяем селектор к прокси для отслеживания пути
      selector(new Proxy(dummyState, createProxyHandler()))
    } catch (error) {
      // Игнорируем ошибки - они могут возникать из-за доступа к несуществующим свойствам
    }

    // Если нет доступа к путям, возвращаем пустую строку
    if (accessedPaths.length === 0) return ''

    // Сортируем пути по длине (самый длинный первым), так мы получим самый специфичный путь
    accessedPaths.sort((a, b) => b.length - a.length)

    // Возвращаем наиболее специфичный путь (самый длинный)
    this.selectorPathCache.set(selector, accessedPaths[0])
    return accessedPaths[0]
  }

  protected notifySubscribers(key: StorageKeyType, value: any): void {
    const keyStr = key.toString()

    // 1. Точное соответствие - уведомляем подписчиков для этого конкретного ключа
    const exactSubscribers = this.subscribers.get(keyStr)
    if (exactSubscribers?.size) {
      // Создаем безопасную копию подписчиков для итерации
      const subscribersCopy = new Set(exactSubscribers)
      subscribersCopy.forEach((callback) => {
        try {
          callback(value)
        } catch (error) {
          this.logger?.error('Ошибка в подписчике на колбэк', { key: keyStr, error })
        }
      })
    }
  }

  /**
   * Метод для определения изменившихся путей между двумя объектами
   */
  private findChangedPaths(oldObj: any, newObj: any, prefix = '', changedPaths: Set<string> = new Set<string>(), visited = new WeakMap()): Set<string> {
    // Если ссылки идентичны, нет изменений
    if (oldObj === newObj) return changedPaths

    // Если один из объектов не является объектом или null, проверяем на изменения
    if (typeof oldObj !== 'object' || typeof newObj !== 'object' || oldObj === null || newObj === null) {
      if (oldObj !== newObj) {
        changedPaths.add(prefix || '')
      }
      return changedPaths
    }

    // Проверка на циклические ссылки
    if (visited.has(oldObj)) return changedPaths

    visited.set(oldObj, true)

    // Собираем все ключи из обоих объектов
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})])

    // Для каждого ключа проверяем изменения
    for (const key of allKeys) {
      const oldValue = oldObj[key]
      const newValue = newObj[key]

      // Если значения идентичны, пропускаем
      if (oldValue === newValue) continue

      const path = prefix ? `${prefix}.${key}` : key

      // Если оба значения - объекты (но не массивы), рекурсивно проверяем их
      if (oldValue && newValue && typeof oldValue === 'object' && typeof newValue === 'object' && !Array.isArray(oldValue) && !Array.isArray(newValue)) {
        this.findChangedPaths(oldValue, newValue, path, changedPaths, visited)
      }
      // Если оба значения - массивы, используем isEqual для сравнения
      else if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        if (!this.isEqual(oldValue, newValue)) {
          changedPaths.add(path)
        }
      }
      // Для остальных типов данных - просто сравниваем
      else if (!this.isEqual(oldValue, newValue)) {
        changedPaths.add(path)
      }
    }

    return changedPaths
  }

  private subscribeBySelector<R>(pathSelector: PathSelector<T, R>, callback: (value: R) => void): VoidFunction {
    // Получаем полный путь из селектора (не только корневой ключ)
    const dummyState = this.createDummyState()
    const fullPath = this.extractPath(pathSelector, dummyState)

    if (this.logger?.debug) {
      this.logger.debug('Subscribing to path:', { path: fullPath })
    }

    // Создаем обертку для колбэка, которая применяет оригинальный селектор к текущему состоянию
    const wrappedCallback = async (value: any) => {
      try {
        // Для значений undefined или null, нам нужно получить текущее состояние
        if (value === undefined || value === null) {
          const currentState = (await this.getState()) as T
          const selectedValue = pathSelector(currentState)
          callback(selectedValue as R)
          return
        }

        // Если значение не объект или точно соответствует ожидаемому типу,
        // передаем его напрямую
        if (typeof value !== 'object' || value === null) {
          callback(value as R)
          return
        }

        // Для объектов запускаем селектор, чтобы получить точное значение
        const currentState = (await this.getState()) as T
        const selectedValue = pathSelector(currentState)
        callback(selectedValue as R)
      } catch (error) {
        this.logger?.error('Error in selector callback', { path: fullPath, error })
        // В случае ошибки передаем исходное значение
        callback(value as R)
      }
    }

    // Если путь не удалось извлечь, подписываемся на глобальные изменения
    if (!fullPath) {
      return this.subscribeToAll(() => {
        this.getState().then((state) => {
          callback(pathSelector(state as T))
        })
      })
    }

    // Подписываемся на полный путь, а не только на корневой ключ
    return this.subscribeByKey(fullPath, wrappedCallback)
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
