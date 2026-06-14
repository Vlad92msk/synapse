import { IndexedDBStorage } from '../adapters/indexed-DB.service'
import { LocalStorage } from '../adapters/local-storage.service'
import { MemoryStorage } from '../adapters/memory-storage.service'
import {
  IAsyncStorage,
  IEventEmitter,
  ILogger,
  IndexedDBStorageConfig,
  IStorage,
  ISyncStorage,
  LocalStorageConfig,
  MemoryStorageConfig,
  UniversalStorageConfig,
} from '../storage.interface'

export class StorageFactory {
  static createMemory<T extends Record<string, any>>(config: MemoryStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger): MemoryStorage<T> {
    return MemoryStorage.create<T>(config, eventEmitter, logger)
  }

  static createLocal<T extends Record<string, any>>(config: LocalStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger): LocalStorage<T> {
    return LocalStorage.create<T>(config, eventEmitter, logger)
  }

  static createIndexedDB<T extends Record<string, any>>(config: IndexedDBStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger): IndexedDBStorage<T> {
    return IndexedDBStorage.create<T>(config, eventEmitter, logger)
  }

  // ─── Перегрузки для правильного вывода типов ────────────────────────────────

  static create<T extends Record<string, any>>(config: UniversalStorageConfig<T> & { type: 'memory' }, eventEmitter?: IEventEmitter, logger?: ILogger): ISyncStorage<T>

  static create<T extends Record<string, any>>(config: UniversalStorageConfig<T> & { type: 'localStorage' }, eventEmitter?: IEventEmitter, logger?: ILogger): ISyncStorage<T>

  static create<T extends Record<string, any>>(config: UniversalStorageConfig<T> & { type: 'indexedDB' }, eventEmitter?: IEventEmitter, logger?: ILogger): IAsyncStorage<T>

  static create<T extends Record<string, any>>(config: UniversalStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger): IStorage<T>

  // ─── Реализация ─────────────────────────────────────────────────────────────

  static create<T extends Record<string, any>>(config: UniversalStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger): IStorage<T> {
    switch (config.type) {
      case 'memory':
        return this.createMemory<T>(config as MemoryStorageConfig<T>, eventEmitter, logger)
      case 'localStorage':
        return this.createLocal<T>(config as LocalStorageConfig<T>, eventEmitter, logger)
      case 'indexedDB':
        return this.createIndexedDB<T>(config as IndexedDBStorageConfig<T>, eventEmitter, logger)
      default: {
        throw new Error(`Unsupported storage type: ${(config as any).type}`)
      }
    }
  }
}
