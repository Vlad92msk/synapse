import { IPluginExecutor } from '../modules/plugin/plugin.interface'
import { SingletonMixin } from '../modules/singleton/mixin.util'
import {
  ConfigureMiddlewares,
  IEventEmitter,
  ILogger,
  IndexedDBStorageConfig,
  StorageConfig,
  StorageType,
} from '../storage.interface'
import { StorageKey, StorageKeyType } from '../utils/storage-key'
import { BaseStorage } from './base-storage.service'
import { getValueByPath, parsePath, setValueByPath } from './path.utils'

export interface IndexedDBConfig {
  dbName?: string
  dbVersion: number
}

// Управляет соединением с базой данных
export class IndexedDBManager {
  private static instances = new Map<string, IndexedDBManager>()
  private db: IDBDatabase | null = null
  private initPromise: Promise<IDBDatabase> | null = null
  private storeNames: Set<string> = new Set()
  private dbVersion: number

  private constructor(
    private readonly dbName: string,
    dbVersion: number,
    private readonly logger?: ILogger,
  ) {
    this.dbVersion = dbVersion
  }

  static getInstance(dbName: string, dbVersion: number = 1, logger?: ILogger): IndexedDBManager {
    if (!IndexedDBManager.instances.has(dbName)) {
      IndexedDBManager.instances.set(dbName, new IndexedDBManager(dbName, dbVersion, logger))
    }

    const instance = IndexedDBManager.instances.get(dbName)!

    // Update version if higher version is requested
    if (dbVersion > instance.dbVersion) {
      instance.dbVersion = dbVersion
    }

    return instance
  }

  async initialize(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db
    }

    if (!this.initPromise) {
      this.initPromise = this.openDatabase()
    }

    return this.initPromise
  }

  async ensureStoreExists(storeName: string): Promise<IDBDatabase> {
    await this.initialize()

    if (this.db!.objectStoreNames.contains(storeName)) {
      this.storeNames.add(storeName)
      return this.db!
    }

    this.logger?.debug(`Store "${storeName}" not found, upgrading database`, {
      dbName: this.dbName,
      currentStores: Array.from(this.db!.objectStoreNames),
    })

    this.db!.close()
    this.db = null

    this.dbVersion++
    this.initPromise = this.openDatabase([storeName])

    const newDb = await this.initPromise
    this.storeNames.add(storeName)
    return newDb
  }

  private async openDatabase(newStores: string[] = []): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      this.logger?.debug(`Opening database "${this.dbName}" with version ${this.dbVersion}`)

      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        this.logger?.error(`Failed to open database "${this.dbName}"`, { error: request.error })
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result

        // Add existing stores to our set
        for (let i = 0; i < this.db.objectStoreNames.length; i++) {
          this.storeNames.add(this.db.objectStoreNames[i])
        }

        this.logger?.debug(`Database "${this.dbName}" opened successfully`, {
          version: this.db.version,
          stores: Array.from(this.db.objectStoreNames),
        })

        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        this.logger?.debug(`Upgrading database "${this.dbName}" to version ${this.dbVersion}`)

        // Create new stores that don't exist yet
        for (const storeName of newStores) {
          if (!db.objectStoreNames.contains(storeName)) {
            this.logger?.debug(`Creating store "${storeName}"`)
            db.createObjectStore(storeName)
          }
        }
      }
    })
  }

  closeDatabase(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initPromise = null
    }
  }

  async deleteDatabase(): Promise<void> {
    this.closeDatabase()

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName)
      request.onsuccess = () => {
        this.logger?.debug(`Database "${this.dbName}" deleted successfully`)
        IndexedDBManager.instances.delete(this.dbName)
        this.storeNames.clear()
        resolve()
      }
      request.onerror = () => {
        this.logger?.error(`Failed to delete database "${this.dbName}"`, { error: request.error })
        reject(request.error)
      }
    })
  }
  async ensureStoresExist(storeNames: string[]): Promise<IDBDatabase> {
    // Сначала инициализируем базу
    await this.initialize()

    // Проверяем, какие хранилища уже существуют
    const missingStores = storeNames.filter((name) => !this.db!.objectStoreNames.contains(name))

    // Если все хранилища уже существуют, просто возвращаем базу
    if (missingStores.length === 0) {
      return this.db!
    }

    // Иначе нам нужно обновить базу для создания новых хранилищ
    this.logger?.debug(`Создание недостающих хранилищ: ${missingStores.join(', ')}`, {
      dbName: this.dbName,
      currentStores: Array.from(this.db!.objectStoreNames),
    })

    // Закрываем текущее соединение
    this.db!.close()
    this.db = null

    // Увеличиваем версию один раз для всех новых хранилищ
    this.dbVersion++
    this.initPromise = this.openDatabase(missingStores)

    return this.initPromise
  }

  // Метод для получения текущей версии
  getCurrentVersion(): number {
    return this.dbVersion
  }
}

/**
 * Менеджер для управления версией базы данных IndexedDB
 * и создания хранилищ
 */
class DBVersionManager {
  private db: IDBDatabase | null = null
  private version: number

  constructor(
    private readonly dbName: string,
    initialVersion: number = 1,
    private readonly logger?: ILogger,
  ) {
    this.version = initialVersion
  }

  /**
   * Получает текущую версию базы данных
   */
  getCurrentVersion(): number {
    return this.version
  }

  /**
   * Открывает базу данных с заданной версией
   */
  private openDatabase(version: number, newStores: string[] = []): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      this.logger?.debug(`Открытие базы данных "${this.dbName}" с версией ${version}`)

      const request = indexedDB.open(this.dbName, version)

      request.onerror = () => {
        this.logger?.error(`Ошибка при открытии базы данных "${this.dbName}"`, { error: request.error })
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        this.version = this.db.version

        this.logger?.debug(`База данных "${this.dbName}" успешно открыта`, {
          version: this.db.version,
          stores: Array.from(this.db.objectStoreNames),
        })

        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        this.logger?.debug(`Обновление базы данных "${this.dbName}" до версии ${version}`)

        // Создаем все новые хранилища
        for (const storeName of newStores) {
          if (!db.objectStoreNames.contains(storeName)) {
            this.logger?.debug(`Создание хранилища "${storeName}"`)
            db.createObjectStore(storeName)
          }
        }
      }
    })
  }

  /**
   * Убеждается, что все указанные хранилища существуют в базе данных
   */
  async ensureStoresExist(storeNames: string[]): Promise<IDBDatabase> {
    // Если база еще не открыта, открываем ее
    if (!this.db) {
      this.db = await this.openDatabase(this.version)
    }

    // Проверяем, какие хранилища отсутствуют
    const missingStores = storeNames.filter((name) => !this.db!.objectStoreNames.contains(name))

    // Если все хранилища уже существуют, просто возвращаем базу
    if (missingStores.length === 0) {
      return this.db
    }

    // Иначе нам нужно обновить базу данных
    this.logger?.debug(`Необходимо создать отсутствующие хранилища: ${missingStores.join(', ')}`, {
      dbName: this.dbName,
      currentVersion: this.version,
    })

    // Закрываем текущее соединение
    this.db.close()
    this.db = null

    // Увеличиваем версию и открываем базу с новыми хранилищами
    this.version++
    this.db = await this.openDatabase(this.version, missingStores)

    return this.db
  }

  /**
   * Закрывает соединение с базой данных
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export class IndexedDBStorage<T extends Record<string, any>> extends BaseStorage<T> {
  protected static readonly STORAGE_TYPE: StorageType = 'memory'
  private readonly DB_NAME: string
  private readonly STORE_NAME: string
  private readonly DB_VERSION: number
  private dbManager: IndexedDBManager

  constructor(config: IndexedDBStorageConfig<T>, pluginExecutor?: IPluginExecutor, eventEmitter?: IEventEmitter, logger?: ILogger) {
    super(config, pluginExecutor, eventEmitter, logger)

    const options = config.options
    this.DB_NAME = options.dbName || 'app_storage'
    this.STORE_NAME = config.name
    this.DB_VERSION = options.dbVersion || 1

    // Get database manager instance
    this.dbManager = IndexedDBManager.getInstance(this.DB_NAME, this.DB_VERSION, logger)
  }

  protected getStorageType(): StorageType {
    return 'memory'
  }

  static create<T extends Record<string, any>>(
    config: IndexedDBStorageConfig,
    pluginExecutor?: IPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): IndexedDBStorage<T> {
    return SingletonMixin.handleSingletonCreation(
      config,
      this.STORAGE_TYPE,
      (finalConfig) => new IndexedDBStorage<T>(finalConfig as IndexedDBStorageConfig<T>, pluginExecutor, eventEmitter, logger),
      logger,
    )
  }

  protected async doInitialize(): Promise<this> {
    try {
      this.logger?.debug(`Initializing IndexedDB storage "${this.STORE_NAME}"`)

      // Создаем store в базе данных
      await this.dbManager.ensureStoreExists(this.STORE_NAME)

      // Проверяем, что хранилище доступно
      const db = await this.dbManager.initialize()
      if (!db.objectStoreNames.contains(this.STORE_NAME)) {
        throw new Error(`Store "${this.STORE_NAME}" not found after initialization`)
      }

      // Инициализируем middleware
      this.initializeMiddlewares()

      // Инициализируем с middleware
      await this.initializeWithMiddlewares()

      this.logger?.debug(`IndexedDB storage "${this.STORE_NAME}" initialized successfully`)
      return this
    } catch (error) {
      this.logger?.error(`Ошибка инициализации IndexedDB "${this.name}"`, { error })
      throw error
    }
  }

  static async getCurrentDBVersion(dbName: string): Promise<number> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(dbName)

        request.onsuccess = () => {
          const version = request.result.version
          request.result.close() // Важно закрыть соединение
          resolve(version)
        }

        request.onerror = () => {
          console.warn(`Ошибка при определении версии БД ${dbName}`, request.error)
          resolve(0) // В случае ошибки возвращаем 0
        }
      } catch (error) {
        console.warn(`Исключение при определении версии БД ${dbName}`, error)
        resolve(0)
      }
    })
  }

  static async createStorages<S extends Record<string, any>>(
    dbName: string,
    configs: {
      [K in keyof S]: {
        name: string
        initialState?: S[K]
        middlewares?: ConfigureMiddlewares
        pluginExecutor?: IPluginExecutor
        eventEmitter?: IEventEmitter
      }
    },
    logger?: ILogger,
  ): Promise<{ [K in keyof S]: IndexedDBStorage<S[K]> }> {
    // Получаем текущую версию базы данных
    const currentVersion = await this.getCurrentDBVersion(dbName)
    const initialVersion = currentVersion || 1

    // Создаем менеджер для управления базой данных
    const dbManager = new DBVersionManager(dbName, initialVersion, logger)

    // Получаем имена всех хранилищ, которые нужно создать
    const storeNames = Object.values(configs).map((config) => config.name)

    // Предварительно создаем все хранилища в рамках одной операции
    await dbManager.ensureStoresExist(storeNames)

    // Создаем и инициализируем все хранилища
    const result: Record<string, IndexedDBStorage<any>> = {}

    for (const [key, config] of Object.entries(configs)) {
      const storage = new IndexedDBStorage(
        {
          ...config,
          options: {
            dbName,
            dbVersion: dbManager.getCurrentVersion(),
          },
        },
        config.pluginExecutor,
        config.eventEmitter,
        logger,
      )

      // Инициализируем хранилище
      result[key] = await storage.initialize()
    }

    return result as { [K in keyof S]: IndexedDBStorage<S[K]> }
  }

  private async getTransaction(mode: IDBTransactionMode = 'readonly'): Promise<IDBTransaction> {
    try {
      // Ensure database is open and our store exists
      const db = await this.dbManager.ensureStoreExists(this.STORE_NAME)

      // Проверяем существование хранилища перед созданием транзакции
      if (!db.objectStoreNames.contains(this.STORE_NAME)) {
        // Попытка исправить проблему - закрываем и снова открываем
        this.logger?.warn(`Object store "${this.STORE_NAME}" not found, attempting to repair`)

        db.close()
        this.dbManager.closeDatabase()

        // Пробуем заново создать хранилище с инкрементом версии
        const newDb = await this.dbManager.ensureStoreExists(this.STORE_NAME)

        if (!newDb.objectStoreNames.contains(this.STORE_NAME)) {
          throw new Error(`Object store "${this.STORE_NAME}" still doesn't exist after repair attempt`)
        }

        return newDb.transaction(this.STORE_NAME, mode)
      }

      return db.transaction(this.STORE_NAME, mode)
    } catch (error) {
      this.logger?.error(`Failed to create transaction for store "${this.STORE_NAME}"`, { error })
      throw error
    }
  }

  private async getObjectStore(mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    const transaction = await this.getTransaction(mode)
    return transaction.objectStore(this.STORE_NAME)
  }

  protected async doGet(key: StorageKeyType): Promise<any> {
    const store = await this.getObjectStore()

    // Для пустого ключа возвращаем все состояние
    if (key === '') {
      return new Promise((resolve, reject) => {
        const request = store.getAll()
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const allValues = request.result
          const allKeys = store.getAllKeys()

          allKeys.onsuccess = () => {
            const state = allKeys.result.reduce(
              (acc, k, index) => {
                if (k !== 'root') {
                  acc[k as string] = allValues[index]
                }
                return acc
              },
              {} as Record<string, any>,
            )
            resolve(state)
          }
          allKeys.onerror = () => reject(allKeys.error)
        }
      })
    }

    // Проверяем, является ли ключ "сырым"
    if (key instanceof StorageKey && key.isUnparseable()) {
      return new Promise((resolve, reject) => {
        const request = store.get(key.valueOf())
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      })
    }

    // Для вложенного пути
    const parts = parsePath(key)
    if (parts.length > 1) {
      const rootKey = parts[0]
      return new Promise((resolve, reject) => {
        const request = store.get(rootKey)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const rootValue = request.result
          if (!rootValue) {
            resolve(undefined)
            return
          }
          const value = getValueByPath(rootValue, parts.slice(1).join('.'))
          resolve(value)
        }
      })
    }

    // Для простого ключа
    return new Promise((resolve, reject) => {
      const request = store.get(parts[0])
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  protected async doSet(key: StorageKeyType, value: any): Promise<void> {
    // Для пустого ключа устанавливаем все состояние
    if (key === '') {
      const store = await this.getObjectStore('readwrite')
      return new Promise((resolve, reject) => {
        const tx = store.transaction

        tx.oncomplete = () => {
          resolve()
        }

        tx.onerror = () => {
          reject(tx.error)
        }

        const clearRequest = store.clear()

        clearRequest.onsuccess = () => {
          const entries = Object.entries(value)
          for (const [entryKey, entryValue] of entries) {
            store.put(entryValue, entryKey)
          }
        }

        clearRequest.onerror = () => {
          reject(clearRequest.error)
        }
      })
    }

    const store = await this.getObjectStore('readwrite')

    // Для "сырого" ключа
    if (key instanceof StorageKey && key.isUnparseable()) {
      await this.putValueInStore(store, key.valueOf(), value)
      return
    }

    // Для вложенного пути
    const parts = parsePath(key)
    if (parts.length > 1) {
      const rootKey = parts[0]
      return new Promise((resolve, reject) => {
        const request = store.get(rootKey)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const rootValue = request.result || {}
          const updatedValue = setValueByPath(rootValue, parts.slice(1).join('.'), value)
          const putRequest = store.put(updatedValue, rootKey)
          putRequest.onerror = () => reject(putRequest.error)
          putRequest.onsuccess = () => resolve()
        }
      })
    }

    // Для простого ключа
    await this.putValueInStore(store, parts[0], value)
  }

  private async putValueInStore(store: IDBObjectStore, key: StorageKeyType, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.put(value, key.valueOf())
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  protected async doUpdate(updates: Array<{ key: string | StorageKey; value: any }>): Promise<void> {
    // Группируем обновления
    const updatesByRoot = new Map<string, Array<{ path: string[]; value: any }>>()
    const rawUpdates: Array<{ key: string; value: any }> = []

    // Разделяем обновления на "сырые" и обычные
    for (const { key, value } of updates) {
      if (key instanceof StorageKey && key.isUnparseable()) {
        rawUpdates.push({ key: key.valueOf(), value })
        continue
      }

      const parts = parsePath(key)
      const rootKey = parts[0]
      const path = parts.slice(1)

      if (!updatesByRoot.has(rootKey)) {
        updatesByRoot.set(rootKey, [])
      }
      updatesByRoot.get(rootKey)!.push({ path, value })
    }

    try {
      // Обрабатываем "сырые" обновления
      for (const { key, value } of rawUpdates) {
        const store = await this.getObjectStore('readwrite')
        await this.putValueInStore(store, key, value)
      }

      // Обрабатываем сгруппированные обновления
      for (const [rootKey, pathUpdates] of updatesByRoot) {
        const rootValue = (await this.doGet(rootKey)) || {}
        let updatedValue = { ...rootValue }

        for (const { path, value } of pathUpdates) {
          if (path.length === 0) {
            updatedValue = value
          } else {
            updatedValue = setValueByPath(updatedValue, path.join('.'), value)
          }
        }

        const store = await this.getObjectStore('readwrite')
        await this.putValueInStore(store, rootKey, updatedValue)
      }
    } catch (error) {
      this.logger?.error('Error during update:', { error })
      throw error
    }
  }

  protected async doDelete(key: StorageKeyType): Promise<boolean> {
    const store = await this.getObjectStore('readwrite')

    // Для "сырого" ключа
    if (key instanceof StorageKey && key.isUnparseable()) {
      return new Promise((resolve, reject) => {
        const request = store.delete(key.valueOf())
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(true)
      })
    }

    const parts = parsePath(key)

    // Для простого ключа
    if (parts.length === 1) {
      return new Promise((resolve, reject) => {
        const request = store.delete(parts[0])
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(true)
      })
    }

    // Для вложенного пути
    const rootKey = parts[0]
    return new Promise((resolve, reject) => {
      const getRequest = store.get(rootKey)
      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        const rootValue = getRequest.result
        if (!rootValue) {
          resolve(false)
          return
        }

        const parent = getValueByPath(rootValue, parts.slice(0, -1).join('.'))
        const lastKey = parts[parts.length - 1]

        if (!parent || !(lastKey in parent)) {
          resolve(false)
          return
        }

        if (Array.isArray(parent)) {
          const index = parseInt(lastKey, 10)
          if (!isNaN(index)) {
            parent.splice(index, 1)
          } else {
            // @ts-ignore
            delete parent[lastKey]
          }
        } else {
          delete parent[lastKey]
        }

        const putRequest = store.put(rootValue, rootKey)
        putRequest.onerror = () => reject(putRequest.error)
        putRequest.onsuccess = () => resolve(true)
      }
    })
  }

  protected async doClear(): Promise<void> {
    const store = await this.getObjectStore('readwrite')
    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  protected async doKeys(): Promise<string[]> {
    const store = await this.getObjectStore()
    const request = store.getAllKeys()
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result as string[])
      }
      request.onerror = () => reject(request.error)
    })
  }

  protected async doHas(key: StorageKeyType): Promise<boolean> {
    const value = await this.doGet(key)
    return value !== undefined
  }

  protected async doDestroy(): Promise<void> {
    try {
      await this.doClear()

      // Note: We don't actually delete the object store from the database
      // as that would require reopening the DB with a higher version.
      // An empty object store takes minimal space.
    } catch (error) {
      this.logger?.error(`Error destroying store "${this.STORE_NAME}"`, { error })
      throw error
    }
  }
}
