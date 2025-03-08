import { IPluginExecutor } from '../modules/plugin/plugin.interface'
import { IEventEmitter, ILogger, StorageConfig } from '../storage.interface'
import { StorageKey, StorageKeyType } from '../utils/storage-key'
import { BaseStorage } from './base-storage.service'
import { getValueByPath, parsePath, setValueByPath } from './path.utils'

export interface IndexedDBConfig {
  dbName?: string
  dbVersion?: number
  storeName?: string
}

export class IndexedDBStorage<T extends Record<string, any>> extends BaseStorage<T> {
  private initPromise: Promise<void> | null = null

  private db: IDBDatabase | null = null

  private readonly DB_NAME: string

  private readonly STORE_NAME: string

  private readonly DB_VERSION: number

  constructor(config: StorageConfig & { options?: IndexedDBConfig }, pluginExecutor?: IPluginExecutor, eventEmitter?: IEventEmitter, logger?: ILogger) {
    super(config, pluginExecutor, eventEmitter, logger)

    const options = config.options as IndexedDBConfig
    this.DB_NAME = options?.dbName || 'app_storage'
    this.STORE_NAME = options?.storeName || 'keyValueStore'
    this.DB_VERSION = options?.dbVersion || 1
  }

  async initialize(): Promise<this> {
    try {
      // Сначала инициализируем БД
      await this.ensureInitialized()
      this.initializeMiddlewares()
      // Затем инициализируем данные через middleware
      await this.initializeWithMiddlewares()
      return this
    } catch (error) {
      this.logger?.error('Error initializing IndexedDB storage', { error })
      throw error
    }
  }

  private initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => {
        this.logger?.error('Failed to open IndexedDB', { error: request.error })
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME)
        }
      }
    })
  }

  private async ensureInitialized() {
    if (!this.initPromise) {
      this.initPromise = this.initDB()
    }
    return this.initPromise
  }

  private async transaction(mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    await this.ensureInitialized()
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return this.db.transaction(this.STORE_NAME, mode).objectStore(this.STORE_NAME)
  }

  protected async doGet(key: StorageKeyType): Promise<any> {
    const store = await this.transaction()

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
    const store = await this.transaction('readwrite')

    // Для пустого ключа устанавливаем все состояние
    if (key === '') {
      await this.doClear()
      const entries = Object.entries(value)
      for (const [entryKey, entryValue] of entries) {
        await this.putValueInStore(store, entryKey as string, entryValue)
      }
      return
    }

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

  protected async doUpdate(updates: Array<{ key: string | StorageKey; value: any }>): Promise<void> {
    const store = await this.transaction('readwrite')
    const tx = store.transaction

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

        await this.putValueInStore(store, rootKey, updatedValue)
      }

      // Ждем завершения транзакции
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch (error) {
      console.error('Ошибка при обновлении:', error)
      throw error
    }
  }

  protected async doDelete(key: StorageKeyType): Promise<boolean> {
    const store = await this.transaction('readwrite')

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

  private async putValueInStore(store: IDBObjectStore, key: StorageKeyType, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.put(value, key.valueOf())
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  protected async doClear(): Promise<void> {
    const store = await this.transaction('readwrite')
    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  protected async doKeys(): Promise<string[]> {
    const store = await this.transaction()
    const request = store.getAllKeys()
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result as string[])
      }
      request.onerror = () => reject(request.error)
    })
  }

  protected async doDestroy(): Promise<void> {
    await this.close()
    await this.deleteDatabase()
  }

  private async deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  protected async doHas(key: StorageKeyType): Promise<boolean> {
    const value = await this.doGet(key)
    return value !== undefined
  }

  private async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initPromise = null
    }
  }
}
