import { IndexedDBStorage } from '../adapters/indexed-DB.service'
import { LocalStorage } from '../adapters/local-storage.service'
import { MemoryStorage } from '../adapters/memory-storage.service'
import { IPluginExecutor } from '../modules/plugin/plugin.interface'
import { IEventEmitter, ILogger, IndexedDBStorageConfig, IStorage, LocalStorageConfig, MemoryStorageConfig, UniversalStorageConfig } from '../storage.interface'

export class StorageFactory {
  static createMemory<T extends Record<string, any>>(
    config: MemoryStorageConfig<T>,
    pluginExecutor?: IPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): MemoryStorage<T> {
    return MemoryStorage.create<T>(config, pluginExecutor, eventEmitter, logger)
  }

  static createLocal<T extends Record<string, any>>(
    config: LocalStorageConfig<T>,
    pluginExecutor?: IPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): LocalStorage<T> {
    return LocalStorage.create<T>(config, pluginExecutor, eventEmitter, logger)
  }

  static createIndexedDB<T extends Record<string, any>>(
    config: IndexedDBStorageConfig<T>,
    pluginExecutor?: IPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): IndexedDBStorage<T> {
    return IndexedDBStorage.create<T>(config, pluginExecutor, eventEmitter, logger)
  }

  // Универсальный метод
  static create<T extends Record<string, any>>(config: UniversalStorageConfig, pluginExecutor?: IPluginExecutor, eventEmitter?: IEventEmitter, logger?: ILogger): IStorage<T> {
    switch (config.type) {
      case 'memory':
        return this.createMemory<T>(config as MemoryStorageConfig<T>, pluginExecutor, eventEmitter, logger)
      case 'localStorage':
        return this.createLocal<T>(config as LocalStorageConfig<T>, pluginExecutor, eventEmitter, logger)
      case 'indexedDB':
        return this.createIndexedDB<T>(config as IndexedDBStorageConfig<T>, pluginExecutor, eventEmitter, logger)
      default: {
        throw new Error(`Unsupported storage type: ${(config as any).type}`)
      }
    }
  }
}
