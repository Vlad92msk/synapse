import { IndexedDBStorage } from '../adapters/indexed-DB.service'
import { LocalStorage } from '../adapters/local-storage.service'
import { MemoryStorage } from '../adapters/memory-storage.service'
import { IPluginExecutor } from '../modules/plugin/plugin.interface'
import { IEventEmitter, ILogger, IndexedDBStorageConfig, IStorage, LocalStorageConfig, MemoryStorageConfig, StorageConfig, StorageType } from '../storage.interface'

/**
 * Определяем типы для функций-создателей хранилищ
 */
export type StorageCreatorFunction<T extends Record<string, any>> = () => Promise<IStorage<T>>

/**
 * Функция для создания хранилищ различных типов
 * Возвращает функцию, которая при вызове создает и инициализирует хранилище
 */
export function createSynapseStorage<T extends Record<string, any>>(
  type: 'memory',
  config: Omit<MemoryStorageConfig, 'type'>,
  dependencies?: {
    pluginExecutor?: IPluginExecutor
    eventEmitter?: IEventEmitter
    logger?: ILogger
  },
): StorageCreatorFunction<T>

export function createSynapseStorage<T extends Record<string, any>>(
  type: 'localStorage',
  config: Omit<LocalStorageConfig, 'type'>,
  dependencies?: {
    pluginExecutor?: IPluginExecutor
    eventEmitter?: IEventEmitter
    logger?: ILogger
  },
): StorageCreatorFunction<T>

export function createSynapseStorage<T extends Record<string, any>>(
  type: 'indexedDB',
  config: Omit<IndexedDBStorageConfig, 'type'>,
  dependencies?: {
    pluginExecutor?: IPluginExecutor
    eventEmitter?: IEventEmitter
    logger?: ILogger
  },
): StorageCreatorFunction<T>

export function createSynapseStorage<T extends Record<string, any>>(
  type: StorageType,
  config: Omit<StorageConfig, 'type'> & Partial<Omit<IndexedDBStorageConfig, 'type'>>,
  dependencies?: {
    pluginExecutor?: IPluginExecutor
    eventEmitter?: IEventEmitter
    logger?: ILogger
  },
): StorageCreatorFunction<T> {
  // Возвращаем функцию, которая при вызове создаст и инициализирует хранилище
  return async (): Promise<IStorage<T>> => {
    const { pluginExecutor, eventEmitter, logger } = dependencies || {}

    let storage: IStorage<T>

    switch (type) {
      case 'memory':
        storage = new MemoryStorage<T>({ ...config, type } as MemoryStorageConfig, pluginExecutor, eventEmitter, logger) as IStorage<T>
        break

      case 'localStorage':
        storage = new LocalStorage<T>({ ...config, type } as LocalStorageConfig, pluginExecutor, eventEmitter, logger) as IStorage<T>
        break

      case 'indexedDB':
        if (!config.options) {
          throw new Error('IndexedDB storage requires options to be provided')
        }

        storage = new IndexedDBStorage<T>(
          {
            ...config,
            type,
            options: config.options,
          } as IndexedDBStorageConfig,
          pluginExecutor,
          eventEmitter,
          logger,
        ) as IStorage<T>
        break

      default:
        throw new Error(`Unsupported storage type: ${type}`)
    }

    // Инициализируем хранилище перед возвратом
    return await storage.initialize()
  }
}
