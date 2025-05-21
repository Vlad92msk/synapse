// storage.interface.ts
import { IndexedDBConfig } from './adapters/indexed-DB.service.old'
import { BatchingMiddlewareOptions, ShallowCompareMiddlewareOptions } from './middlewares'
import { Middleware } from './utils/middleware-module'
import { StorageKeyType } from './utils/storage-key'

export interface IStorage<T extends Record<string, any> = any> {
  name: string
  get<R>(key: StorageKeyType): Promise<R | undefined>
  getState(): Promise<T>
  set<R>(key: StorageKeyType, value: R): Promise<void>
  update(updater: (state: T) => void): Promise<void>
  has(key: StorageKeyType): Promise<boolean>
  delete(key: StorageKeyType): Promise<void>
  clear(): Promise<void>
  keys(): Promise<string[]>
  destroy(): Promise<void>
  subscribeToAll(callback: (event: { type: string; changedPaths?: string[]; key?: StorageKeyType[] | StorageKeyType; value?: any }) => void): VoidFunction
  initialize(): Promise<this>
  subscribe(key: StorageKeyType, callback: (value: any) => void): VoidFunction
  subscribe<R>(pathSelector: (state: T) => R, callback: (value: R) => void): VoidFunction
}

export enum StorageEvents {
  STORAGE_UPDATE = 'storage:update',
  STORAGE_DELETE = 'storage:delete',
  STORAGE_PATCH = 'storage:patch',
  STORAGE_SELECT = 'storage:select',
  STORAGE_CLEAR = 'storage:clear',
  STORAGE_DESTROY = 'storage:destroy',
}

export interface StorageEvent<T = any> {
  type: string
  payload?: T
  metadata?: Record<string, any>
}

export interface IEventEmitter {
  emit(event: StorageEvent): Promise<void>
}

export interface ILogger {
  debug(message: string, meta?: Record<string, any>): void
  info(message: string, meta?: Record<string, any>): void
  warn(message: string, meta?: Record<string, any>): void
  error(message: string, meta?: Record<string, any>): void
}

// Функции-создатели дефолтных middleware
export interface DefaultMiddlewares {
  batching: (options?: BatchingMiddlewareOptions) => Middleware
  shallowCompare: (options?: ShallowCompareMiddlewareOptions) => Middleware
}

// Функция для получения дефолтных middleware
export type GetDefaultMiddleware = () => DefaultMiddlewares

// Функция настройки middleware
export type ConfigureMiddlewares = (getDefaultMiddleware: GetDefaultMiddleware) => Middleware[]

// Основной интерфейс конфигурации
export interface StorageConfig {
  name: string
  initialState?: Record<string, any>
  middlewares?: ConfigureMiddlewares
}

export type StorageType = 'memory' | 'localStorage' | 'indexedDB'

// Уточним специфичные конфиги для разных типов хранилищ
export interface MemoryStorageConfig extends StorageConfig {
  type: 'memory'
}

export interface LocalStorageConfig extends StorageConfig {
  type: 'localStorage'
}

export interface IndexedDBStorageConfig extends StorageConfig {
  type: 'indexedDB'
  options: IndexedDBConfig
}
