import { IndexedDBStorage } from '../adapters/indexed-DB.service'
import { LocalStorage } from '../adapters/local-storage.service'
import { MemoryStorage } from '../adapters/memory-storage.service'
import { IAsyncPluginExecutor, ISyncPluginExecutor } from '../modules/plugin/plugin.interface'
import {
  IAsyncStorage,
  IEventEmitter,
  ILogger,
  IStorage,
  ISyncStorage,
  IndexedDBStorageConfig,
  LocalStorageConfig,
  MemoryStorageConfig,
  UniversalStorageConfig,
} from '../storage.interface'

export class StorageFactory {
  static createMemory<T extends Record<string, any>>(
    config: MemoryStorageConfig<T>,
    pluginExecutor?: ISyncPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): MemoryStorage<T> {
    return MemoryStorage.create<T>(config, pluginExecutor, eventEmitter, logger)
  }

  static createLocal<T extends Record<string, any>>(
    config: LocalStorageConfig<T>,
    pluginExecutor?: ISyncPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): LocalStorage<T> {
    return LocalStorage.create<T>(config, pluginExecutor, eventEmitter, logger)
  }

  static createIndexedDB<T extends Record<string, any>>(
    config: IndexedDBStorageConfig<T>,
    pluginExecutor?: IAsyncPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): IndexedDBStorage<T> {
    return IndexedDBStorage.create<T>(config, pluginExecutor, eventEmitter, logger)
  }

  // ─── Перегрузки для правильного вывода типов ────────────────────────────────

  static create<T extends Record<string, any>>(
    config: UniversalStorageConfig<T> & { type: 'memory' },
    pluginExecutor?: ISyncPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): ISyncStorage<T>

  static create<T extends Record<string, any>>(
    config: UniversalStorageConfig<T> & { type: 'localStorage' },
    pluginExecutor?: ISyncPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): ISyncStorage<T>

  static create<T extends Record<string, any>>(
    config: UniversalStorageConfig<T> & { type: 'indexedDB' },
    pluginExecutor?: IAsyncPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): IAsyncStorage<T>

  static create<T extends Record<string, any>>(
    config: UniversalStorageConfig<T>,
    pluginExecutor?: ISyncPluginExecutor | IAsyncPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): IStorage<T>

  // ─── Реализация ─────────────────────────────────────────────────────────────

  static create<T extends Record<string, any>>(
    config: UniversalStorageConfig<T>,
    pluginExecutor?: ISyncPluginExecutor | IAsyncPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ): IStorage<T> {
    switch (config.type) {
      case 'memory':
        return this.createMemory<T>(config as MemoryStorageConfig<T>, pluginExecutor as ISyncPluginExecutor, eventEmitter, logger)
      case 'localStorage':
        return this.createLocal<T>(config as LocalStorageConfig<T>, pluginExecutor as ISyncPluginExecutor, eventEmitter, logger)
      case 'indexedDB':
        return this.createIndexedDB<T>(config as IndexedDBStorageConfig<T>, pluginExecutor as IAsyncPluginExecutor, eventEmitter, logger)
      default: {
        throw new Error(`Unsupported storage type: ${(config as any).type}`)
      }
    }
  }
}
