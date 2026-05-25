// Экспортируем публичные интерфейсы
export * from './modules/plugin/plugin.interface'
export * from './modules/plugin/plugin.service'
export { ConfigMergeStrategy } from './modules/singleton/models'
export * from './storage.interface'

// Экспортируем публичные middleware
export type { BatchingMiddlewareOptions, ShallowCompareMiddlewareOptions } from './middlewares'
export { broadcastMiddleware, syncBroadcastMiddleware } from './middlewares'

// Экспортируем публичные адаптеры
export { AsyncBaseStorage } from './adapters/async-base-storage.service'
export { IndexedDBStorage } from './adapters/indexed-DB.service'
export { LocalStorage } from './adapters/local-storage.service'
export { MemoryStorage } from './adapters/memory-storage.service'
export { StorageCore } from './adapters/storage-core'
export { SyncBaseStorage } from './adapters/sync-base-storage.service'

// Экспортируем утилиты, которые нужны в публичном API
export {
  type AsyncMiddleware,
  type AsyncMiddlewareAPI,
  type AsyncNextFunction,
  type Middleware,
  type MiddlewareAPI,
  type NextFunction,
  type StorageAction,
  type SyncMiddleware,
  type SyncMiddlewareAPI,
  type SyncNextFunction,
} from './utils/middleware-module'
export { StorageFactory } from './utils/storage-factory.util'
export { type StorageKeyType } from './utils/storage-key'
