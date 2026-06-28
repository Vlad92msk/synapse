import { handleCleanupError, handleOperationError } from '../../_utils/error-handling.util'
import { IStorage, StorageKeyType } from '../../core'
import { CacheConfig, CreateApiClientOptions, StorageOption } from '../types/api.interface'
import { EndpointConfig } from '../types/endpoint.interface'
import { QueryOptions, Unsubscribe } from '../types/query.interface'
import { CacheEntry, CacheUtils } from '../utils/cache.util'

/**
 * Менеджер хранилища для API
 * Объединяет в себе функционал хранилища и управления кэшем
 */
export class QueryStorage {
  /** Экземпляр хранилища */
  private storage: IStorage | null = null

  private cleanupInterval: NodeJS.Timeout | number | null = null

  /** Индекс тегов: tag → Set<cacheKey> для быстрой инвалидации */
  private tagIndex = new Map<string, Set<string>>()

  /** Подписчики на событие инвалидации кэша (шина для авто-рефетча хуков) */
  private invalidateListeners = new Set<(tags: string[]) => void>()

  /** Настройки кэша по умолчанию */
  private defaultCacheOptions: Exclude<CacheConfig, boolean> = {
    ttl: 5 * 60 * 1000, // 5 минут по умолчанию
    cleanup: {
      enabled: true,
      interval: 10 * 60 * 1000, // 10 минут
    },
    invalidateOnError: true,
  }

  /** Флаг завершённой инициализации */
  private _initialized = false

  /** Промис текущей инициализации */
  private _initPromise: Promise<this> | null = null

  constructor(
    private readonly storageExternal: StorageOption,
    private readonly globalCacheConfig: CreateApiClientOptions['cache'],
  ) {}

  public async initialize(): Promise<this> {
    if (this._initialized) return this
    if (this._initPromise) return this._initPromise

    this._initPromise = this._doInitialize()
    return this._initPromise
  }

  private async _doInitialize(): Promise<this> {
    try {
      // 1. Создаем хранилище
      await this.createStorage()
      // 2. Перестраиваем индекс тегов из существующих записей в storage
      await this.rebuildTagIndex()
      // 3. Запускаем периодическую очистку, если это указано в настройках
      this.startCleanupInterval()

      this._initialized = true
      return this
    } catch (error) {
      this._initPromise = null
      throw error
    }
  }

  private async createStorage() {
    try {
      // Резолвим storage: может быть инстанс или фабрика
      const s: IStorage = typeof this.storageExternal === 'function' ? await this.storageExternal() : this.storageExternal

      await s.initialize()
      this.storage = s
    } catch (error) {
      handleOperationError('QueryStorage: storage initialization error', error)
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
        this.cleanup().catch((err) => handleCleanupError('QueryStorage: cache cleanup error', err))
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
   * Является ли текущее хранилище синхронным (Memory/LocalStorage).
   * Только для таких хранилищ доступно синхронное чтение кэша ({@link getCachedResultSync}).
   */
  public isSyncStorage(): boolean {
    return !!this.storage && this.storage.type !== 'indexedDB'
  }

  /**
   * Подписка на событие инвалидации кэша. Колбэк получает список тегов, которые
   * были инвалидированы (через мутацию с `invalidatesTags` или ручную инвалидацию).
   * Используется хуками для авто-рефетча активных запросов после мутаций.
   */
  public onCacheInvalidate(listener: (tags: string[]) => void): Unsubscribe {
    this.invalidateListeners.add(listener)
    return () => this.invalidateListeners.delete(listener)
  }

  /** Уведомляет подписчиков шины об инвалидации указанных тегов */
  private emitCacheInvalidate(tags: string[]): void {
    if (!tags.length || !this.invalidateListeners.size) return
    this.invalidateListeners.forEach((listener) => listener(tags))
  }

  /**
   * Синхронное чтение результата из кэша (fast-path для SSR-гидрации).
   * Работает только на синхронных хранилищах (Memory/LocalStorage) — читает из
   * снапшота `getStateSync()` без async-тика, поэтому данные доступны уже на
   * первом рендере и не возникает «вспышки» loading. Для async-хранилищ
   * (IndexedDB) и протухших записей возвращает `undefined`.
   *
   * В отличие от {@link getCachedResult}, НЕ мутирует метаданные и не удаляет
   * протухшие записи (чистое чтение, безопасно вызывать во время рендера).
   */
  public getCachedResultSync<T>(cacheKey: StorageKeyType): T | undefined {
    if (!this.storage || !this.isSyncStorage()) return undefined

    const state = this.storage.getStateSync() as Record<string, CacheEntry<T> | undefined>
    const cachedEntry = state[String(cacheKey)]
    if (!cachedEntry?.metadata) return undefined

    if (CacheUtils.isExpired(cachedEntry.metadata)) return undefined

    return cachedEntry.data
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
      this.removeKeyFromTagIndex(String(cacheKey), cachedEntry.metadata.tags)
      await this.storage.remove(cacheKey)
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
   * @param cacheParams Параметры которые влияли на создание ключа
   * @param tags Тэги эндпоинта
   */
  public async setCachedResult<T, CacheParams extends Record<string, any>>(
    cacheKey: StorageKeyType,
    data: T,
    cacheOptions: Exclude<CacheConfig, boolean>,
    cacheParams: CacheParams,
    tags: string[],
  ): Promise<void> {
    if (!this.storage) throw new Error('Хранилище не инициализировано')

    // Создаем метаданные кэша
    const cacheMetadata = CacheUtils.createMetadata(cacheOptions.ttl, tags)

    // Создаем запись кэша
    const cacheEntry: CacheEntry<T> = {
      data,
      metadata: cacheMetadata,
      params: cacheParams,
    }

    await this.storage.set(cacheKey, cacheEntry)

    // Обновляем индекс тегов
    const keyStr = String(cacheKey)
    for (const tag of tags) {
      let keys = this.tagIndex.get(tag)
      if (!keys) {
        keys = new Set()
        this.tagIndex.set(tag, keys)
      }
      keys.add(keyStr)
    }
  }

  /**
   * Проверяет, должен ли запрос быть кэширован
   * @param endpointConfig Конфигурация эндпоинта
   * @param options Опции запроса
   * @param method HTTP-метод запроса (только GET кэшируется по REST-стандарту)
   * @returns true если запрос должен кэшироваться
   */
  public shouldCache(endpointConfig?: EndpointConfig, options?: QueryOptions, method?: string) {
    // Мутации (POST/PUT/DELETE/PATCH) не кэшируются по REST-стандарту
    if (method && method !== 'GET') return false
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
   * Объединяет глобальный конфиг с текущим
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
      const endpointCache = endpointConfig.cache as Exclude<CacheConfig, boolean>
      resultConfig = {
        ...resultConfig,
        ...endpointCache,
      }
    }

    return resultConfig
  }

  /**
   * Инвалидирует кэш по тегам (использует индекс для O(1) поиска по тегу)
   * @param tags Теги для инвалидации
   */
  public async invalidateCacheByTags(tags: string[]): Promise<void> {
    if (!this.storage) throw new Error('Хранилище не инициализировано')

    // Собираем все ключи для удаления через индекс
    const keysToRemove = new Set<string>()
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag)
      if (keys) {
        keys.forEach((k) => keysToRemove.add(k))
        this.tagIndex.delete(tag)
      }
    }

    // Удаляем из остальных тегов индекса (ключ может быть в нескольких тегах)
    for (const key of keysToRemove) {
      for (const [tag, keys] of this.tagIndex) {
        keys.delete(key)
        if (keys.size === 0) this.tagIndex.delete(tag)
      }
    }

    // Удаляем записи из хранилища
    await Promise.all([...keysToRemove].map((key) => this.storage!.remove(key)))

    // Уведомляем шину — активные подписчики (хуки) сделают рефетч
    this.emitCacheInvalidate(tags)
  }

  /**
   * Инвалидирует кэш по ключу
   * @param cacheKey Ключ кэша
   */
  public async invalidateCache(cacheKey: StorageKeyType): Promise<void> {
    if (!this.storage) throw new Error('Хранилище не инициализировано')

    // Читаем теги записи для очистки индекса
    const cachedEntry = await this.storage.get<CacheEntry<any>>(cacheKey)
    if (cachedEntry) {
      this.removeKeyFromTagIndex(String(cacheKey), cachedEntry.metadata.tags)
    }

    await this.storage.remove(cacheKey)

    // Уведомляем шину тегами удалённой записи
    if (cachedEntry?.metadata?.tags?.length) {
      this.emitCacheInvalidate(cachedEntry.metadata.tags)
    }
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
        this.removeKeyFromTagIndex(String(key), value.metadata.tags)
        await this.storage.remove(key)
      }
    }
  }

  /**
   * Уничтожает хранилище и освобождает ресурсы
   */
  public async destroy(): Promise<void> {
    // Останавливаем интервал очистки
    if (this.cleanupInterval) {
      globalThis.clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    // Очищаем индекс тегов
    this.tagIndex.clear()

    // Очищаем подписчиков шины инвалидации
    this.invalidateListeners.clear()

    // Очищаем хранилище
    if (this.storage) {
      await this.storage.destroy()
      this.storage = null
    }

    // Сбрасываем состояние инициализации
    this._initialized = false
    this._initPromise = null
  }

  /**
   * Гидрация кэша снапшотом (SSR/server-state). Заменяет состояние хранилища и
   * перестраивает индекс тегов, чтобы инвалидация по тегам работала сразу после
   * переноса с сервера. Абсолютные `expiresAt` в метаданных переживают перенос,
   * поэтому TTL продолжает считаться корректно.
   */
  public async hydrate(state: Record<string, any>): Promise<void> {
    if (!this.storage) throw new Error('Хранилище не инициализировано')

    await this.storage.hydrate(state)
    await this.rebuildTagIndex()
  }

  /**
   * Перестраивает индекс тегов из существующих записей в storage
   * Вызывается при инициализации для восстановления после перезагрузки
   */
  private async rebuildTagIndex(): Promise<void> {
    if (!this.storage) return

    this.tagIndex.clear()
    const keys = await this.storage.keys()

    for (const key of keys) {
      const entry = await this.storage.get<CacheEntry<any>>(key)
      if (!entry?.metadata?.tags) continue

      // Удаляем протухшие записи сразу
      if (CacheUtils.isExpired(entry.metadata)) {
        await this.storage.remove(key)
        continue
      }

      const keyStr = String(key)
      for (const tag of entry.metadata.tags) {
        let tagKeys = this.tagIndex.get(tag)
        if (!tagKeys) {
          tagKeys = new Set()
          this.tagIndex.set(tag, tagKeys)
        }
        tagKeys.add(keyStr)
      }
    }
  }

  /**
   * Удаляет ключ из индекса тегов
   */
  private removeKeyFromTagIndex(key: string, tags?: string[]): void {
    if (!tags) return
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag)
      if (keys) {
        keys.delete(key)
        if (keys.size === 0) this.tagIndex.delete(tag)
      }
    }
  }
}
