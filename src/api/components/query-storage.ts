import { IndexedDBStorage, IStorage, LocalStorage, MemoryStorage, StorageKeyType, StorageType } from '../../core/storage'
import { CacheEntry, CacheUtils } from '../../core/storage/utils/cache.util'
import { CacheConfig, CreateApiClientOptions } from '../types/api.interface'
import { EndpointConfig } from '../types/endpoint.interface'
import { QueryOptions } from '../types/query.interface'

/**
 * Менеджер хранилища для API
 * Объединяет в себе функционал хранилища и управления кэшем
 */
export class QueryStorage {
  /** Экземпляр хранилища */
  private storage: IStorage | null = null

  private cleanupInterval: NodeJS.Timeout | number | null = null

  /** Настройки кэша по умолчанию */
  private defaultCacheOptions: Exclude<CacheConfig, boolean> = {
    ttl: 5 * 60 * 1000, // 5 минут по умолчанию
    cleanup: {
      enabled: true,
      interval: 10 * 60 * 1000, // 10 минут
    },
    invalidateOnError: true,
  }

  constructor(
    private readonly storageExternal: CreateApiClientOptions['storage'],
    private readonly globalCacheConfig: CreateApiClientOptions['cache'],
  ) {}

  public async initialize(): Promise<this> {
    // 1. Создаем хранилище
    await this.createStorage()
    // 2. Запускаем периодическую очистку, если это указано в настройках
    this.startCleanupInterval()

    return this
  }

  private async createStorage() {
    try {
      const s: IStorage = this.storageExternal

      await s.initialize()
      this.storage = s
    } catch (error) {
      console.error('Ошибка инициализации хранилища', error)
      throw error
    }
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    // Получаем настройки очистки
    const cleanupConfig = typeof this.globalCacheConfig === 'object' ? this.globalCacheConfig.cleanup : this.defaultCacheOptions.cleanup

    // Запускаем интервал очистки, если он включен
    if (cleanupConfig?.enabled && cleanupConfig.interval) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup().catch((err) => console.error('Ошибка при очистке кэша:', err))
      }, cleanupConfig.interval)
    }
  }

  /**
   * Получает экземпляр хранилища
   */
  public getStorage(): IStorage | null {
    return this.storage
  }

  /**
   * Создает ключ кэша для запроса с учетом заголовков
   * @param endpoint Имя эндпоинта
   * @param params Параметры запроса (все что посчитаем нужным)
   */
  public createCacheKey<CacheParams extends Record<string, any>>(endpoint: string, params: CacheParams) {
    return CacheUtils.createApiKey(endpoint, params)
  }

  /**
   * Получает результат запроса из кэша
   */
  public async getCachedResult<T>(cacheKey: StorageKeyType): Promise<T | undefined> {
    if (!this.storage) throw new Error('Хранилище не инициализировано')

    const cachedEntry = await this.storage.get<CacheEntry<T>>(cacheKey)
    if (!cachedEntry) return undefined

    // Проверяем срок годности кэша
    if (CacheUtils.isExpired(cachedEntry.metadata)) {
      await this.storage.delete(cacheKey)
      return undefined
    }

    // Обновляем метаданные кэша (счетчик доступа, время обновления)
    const updatedEntry: CacheEntry<T> = {
      ...cachedEntry,
      metadata: CacheUtils.updateMetadata(cachedEntry.metadata),
    }
    await this.storage.set(cacheKey, updatedEntry)

    return cachedEntry.data
  }

  /**
   * Сохраняет результат запроса в кэш
   * @param cacheKey Ключ кэша
   * @param data Данные для кэширования
   * @param cacheOptions Метаданные
   * @param cacheParams Параметры которые влияли на созадние ключа
   * @param tags Тэги эндпоинта
   * @param invalidatesTags Тэги которые нужно инвалидировать
   */
  public async setCachedResult<T, CacheParams extends Record<string, any>>(
    cacheKey: StorageKeyType,
    data: T,
    cacheOptions: Exclude<CacheConfig, boolean>,
    cacheParams: CacheParams,
    tags: string[],
    invalidatesTags: string[],
  ): Promise<void> {
    if (!this.storage) throw new Error('Хранилище не инициализировано')

    // Проверяем, нужно ли инвалидировать другие кэши по тегам
    if (invalidatesTags?.length) {
      await this.invalidateCacheByTags(invalidatesTags)
    }

    // Создаем метаданные кэша
    const cacheMetadata = CacheUtils.createMetadata(cacheOptions.ttl, tags)

    // Создаем запись кэша
    const cacheEntry: CacheEntry<T> = {
      data,
      metadata: cacheMetadata,
      params: cacheParams,
    }

    await this.storage.set(cacheKey, cacheEntry)
  }

  /**
   * Проверяет, должен ли запрос быть кэширован
   * @param endpointConfig Конфигурация эндпоинта
   * @param options Опции запроса
   * @returns true если запрос должен кэшироваться
   */
  public shouldCache(endpointConfig?: EndpointConfig, options?: QueryOptions) {
    // Если глобальный кэш отключен, возвращаем false
    if (this.globalCacheConfig === false) return false
    // Если эндпоинт явно отключает кэш, возвращаем false
    if (endpointConfig?.cache === false) return false
    // Если по какой то причине указали время кэша 0
    if (typeof endpointConfig?.cache === 'object' && endpointConfig?.cache.ttl === 0) return false
    // Если при вызове самого запроса явно указали НЕ кэшировать
    if (options?.disableCache === true) return false
    // Если настройки нигде не указаны - по умолчанию НЕ кэшируем
    if (this.globalCacheConfig === undefined && endpointConfig?.cache === undefined) return false

    return true
  }

  /**
   * Создает итоговую конфигурацию кэширования для конкретного эндпоинта
   * Объединяет глабальный конфиг с текущим
   * @param endpointConfig Конфигурация эндпоинта
   */
  public createCacheConfig(endpointConfig?: EndpointConfig) {
    // Создаем опции по умолчанию
    let resultConfig = this.defaultCacheOptions

    // Если в глобальном конфиге кэш передан как объект а не boolean - по умолчанию станет он
    if (typeof this.globalCacheConfig === 'object') {
      resultConfig = this.globalCacheConfig
    }
    // Если в настройках эндпоинта кэш как объект - дополняем этими параметрами итоговый объект кэша
    if (typeof endpointConfig?.cache === 'object') {
      const endpointCache = endpointConfig.cache
      resultConfig = {
        // @ts-ignore
        ...resultConfig,
        ...endpointCache,
      }
    }

    return resultConfig
  }

  /**
   * Инвалидирует кэш по тегам
   * @param tags Теги для инвалидации
   */
  public async invalidateCacheByTags(tags: string[]): Promise<void> {
    if (!this.storage) throw new Error('Хранилище не инициализировано')

    const keys = await this.storage.keys()
    for (const key of keys) {
      const cachedEntry = await this.storage.get<CacheEntry<any>>(key)
      if (cachedEntry && CacheUtils.hasAnyTag(cachedEntry.metadata, tags)) {
        await this.storage.delete(key)
      }
    }
  }

  /**
   * Инвалидирует кэш по ключу
   * @param cacheKey Ключ кэша
   */
  public async invalidateCache(cacheKey: StorageKeyType): Promise<void> {
    if (!this.storage) throw new Error('Хранилище не инициализировано')

    await this.storage.delete(cacheKey)
  }

  /**
   * Выполняет очистку всех просроченных записей кэша
   */
  public async cleanup(): Promise<void> {
    if (!this.storage) {
      throw new Error('Хранилище не инициализировано')
    }

    const keys = await this.storage.keys()
    for (const key of keys) {
      const value = await this.storage.get<CacheEntry<any>>(key)
      if (value && CacheUtils.isExpired(value.metadata)) {
        await this.storage.delete(key)
      }
    }
  }

  /**
   * Уничтожает хранилище и освобождает ресурсы
   */
  public async destroy(): Promise<void> {
    // Останавливаем интервал очистки
    if (this.cleanupInterval) {
      window.clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    // Очищаем хранилище
    if (this.storage) {
      await this.storage.destroy()
      this.storage = null
    }
  }
}
