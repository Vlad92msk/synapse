// Экспортируем публичные интерфейсы
export * from './modules/plugin/plugin.interface'
export * from './modules/plugin/plugin.service'
export * from './storage.interface'

// Экспортируем публичные middleware
export type { BatchingMiddlewareOptions, ShallowCompareMiddlewareOptions } from './middlewares'
export { broadcastMiddleware } from './middlewares'

// Экспортируем публичные адаптеры
export { BaseStorage } from './adapters/base-storage.service'
export { IndexedDBStorage } from './adapters/indexed-DB.service'
export { LocalStorage } from './adapters/local-storage.service'
export { MemoryStorage } from './adapters/memory-storage.service'

// Экспортируем утилиты, которые нужны в публичном API
export { type Middleware, type MiddlewareAPI, type NextFunction, type StorageAction } from './utils/middleware-module'
export { type StorageKeyType } from './utils/storage-key'
