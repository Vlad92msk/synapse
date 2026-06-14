// storage.interface.ts
import { IndexedDBConfig } from './adapters/indexed-DB.service'
import { BatchingMiddlewareOptions, LoggerMiddlewareOptions, ShallowCompareMiddlewareOptions } from './middlewares'
import { SingletonOptions } from './modules/singleton/models'
import {
  AsyncMiddleware,
  AsyncMiddlewareAPI,
  AsyncNextFunction,
  Middleware,
  MiddlewareAPI,
  NextFunction,
  StorageAction,
  SyncMiddleware,
  SyncMiddlewareAPI,
  SyncNextFunction,
} from './utils/middleware-module'
import { StorageKeyType } from './utils/storage-key'

// ─── Storage Status ────────────────────────────────────────────────────────────

export enum StorageStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  READY = 'ready',
  ERROR = 'error',
}

export interface StorageInitStatus {
  status: StorageStatus
  error?: Error
}

// ─── Storage Events ────────────────────────────────────────────────────────────

export enum StorageEvents {
  STORAGE_UPDATE = 'storage:update',
  STORAGE_SELECT = 'storage:select',
  STORAGE_CLEAR = 'storage:clear',
  STORAGE_DESTROY = 'storage:destroy',
}

export interface StorageEvent<T = any> {
  type: string
  payload?: T
  metadata?: Record<string, any>
}

// ─── Utility Interfaces ────────────────────────────────────────────────────────

export interface IEventEmitter {
  emit(event: StorageEvent): Promise<void>
}

export interface ILogger {
  debug(message: string, meta?: Record<string, any>): void
  info(message: string, meta?: Record<string, any>): void
  warn(message: string, meta?: Record<string, any>): void
  error(message: string, meta?: Record<string, any>): void
}

// ─── Middleware Types (re-exported from middleware-module) ─────────────────────

export type { AsyncMiddleware, AsyncMiddlewareAPI, AsyncNextFunction, Middleware, MiddlewareAPI, NextFunction, StorageAction, SyncMiddleware, SyncMiddlewareAPI, SyncNextFunction }

// ─── Storage Interfaces ────────────────────────────────────────────────────────

/**
 * Базовый интерфейс для всех хранилищ.
 * Содержит lifecycle, sync-доступ к кешу, подписки и метаданные.
 */
export interface IStorageBase<T extends Record<string, any> = any> {
  /** Имя хранилища */
  readonly name: string

  /** Тип хранилища */
  readonly type: StorageType

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** Инициализация хранилища (всегда async — загрузка данных, миграции и т.д.) */
  initialize(): Promise<this>

  /** Уничтожение хранилища */
  destroy(): Promise<void>

  /** Ожидание готовности хранилища */
  waitForReady(): Promise<this>

  // ─── Sync-доступ к кешу ────────────────────────────────────────────────────

  /** Синхронное получение состояния из кеша (доступно для всех типов хранилищ) */
  getStateSync(): T

  // ─── Подписки ──────────────────────────────────────────────────────────────

  /** Подписка на изменение конкретного ключа */
  subscribe(key: StorageKeyType, callback: (value: any) => void): VoidFunction

  /** Подписка через path-selector */
  subscribe<R>(pathSelector: (state: T) => R, callback: (value: R) => void): VoidFunction

  /** Подписка на все изменения хранилища */
  subscribeToAll(callback: (event: { type: string; changedPaths?: string[]; key?: StorageKeyType[] | StorageKeyType; value?: any }) => void): VoidFunction

  /** Текущий статус инициализации */
  readonly initStatus: StorageInitStatus

  /** Подписка на изменение статуса инициализации */
  onStatusChange(callback: (status: StorageInitStatus) => void): VoidFunction
}

/**
 * Синхронное хранилище.
 * Memory и LocalStorage реализуют этот интерфейс.
 * Все операции чтения/записи выполняются синхронно.
 */
export interface ISyncStorage<T extends Record<string, any> = any> extends IStorageBase<T> {
  get<R>(key: StorageKeyType): R | undefined
  set<R>(key: StorageKeyType, value: R): void
  update(updater: (state: T) => void): void
  remove(key: StorageKeyType): void
  has(key: StorageKeyType): boolean
  clear(): void
  /** Сброс состояния к initialState (или к {} если initialState не задан) */
  reset(): void
  /**
   * Гидрация: заменяет состояние переданным снапшотом (SSR/server-state). Вызванная ДО
   * `initialize()`, она засевает хранилище так, что инициализация не перезатрёт его
   * `initialState`. Вызванная после — заменяет состояние и уведомляет подписчиков.
   */
  hydrate(state: T): void
  keys(): string[]
  getState(): T
}

/**
 * Асинхронное хранилище.
 * IndexedDB реализует этот интерфейс.
 * Все операции чтения/записи возвращают Promise.
 */
export interface IAsyncStorage<T extends Record<string, any> = any> extends IStorageBase<T> {
  get<R>(key: StorageKeyType): Promise<R | undefined>
  set<R>(key: StorageKeyType, value: R): Promise<void>
  update(updater: (state: T) => void): Promise<void>
  remove(key: StorageKeyType): Promise<void>
  has(key: StorageKeyType): Promise<boolean>
  clear(): Promise<void>
  /** Сброс состояния к initialState (или к {} если initialState не задан) */
  reset(): Promise<void>
  /**
   * Гидрация: заменяет состояние переданным снапшотом (SSR/server-state). Вызванная ДО
   * `initialize()`, она засевает хранилище так, что инициализация не перезатрёт его
   * `initialState`. Вызванная после — заменяет состояние и уведомляет подписчиков.
   */
  hydrate(state: T): Promise<void>
  keys(): Promise<string[]>
  getState(): Promise<T>
}

/**
 * Union type — любое хранилище.
 * Используется когда тип хранилища неизвестен на этапе компиляции.
 */
export type IStorage<T extends Record<string, any> = any> = ISyncStorage<T> | IAsyncStorage<T>

// ─── Config Types ──────────────────────────────────────────────────────────────

export type StorageType = 'memory' | 'localStorage' | 'indexedDB'

// --- Default middleware helpers ---

export interface SyncDefaultMiddlewares {
  batching: (options?: BatchingMiddlewareOptions) => SyncMiddleware
  shallowCompare: (options?: ShallowCompareMiddlewareOptions) => SyncMiddleware
  /** Dev-only логгер пишущих действий (тип/ключ/длительность, опц. prev/next состояние). */
  logger: (options?: LoggerMiddlewareOptions) => SyncMiddleware
}

export interface AsyncDefaultMiddlewares {
  batching: (options?: BatchingMiddlewareOptions) => AsyncMiddleware
  shallowCompare: (options?: ShallowCompareMiddlewareOptions) => AsyncMiddleware
  /** Dev-only логгер пишущих действий (тип/ключ/длительность, опц. prev/next состояние). */
  logger: (options?: LoggerMiddlewareOptions) => AsyncMiddleware
}

/** @deprecated Use SyncDefaultMiddlewares or AsyncDefaultMiddlewares */
export type DefaultMiddlewares = AsyncDefaultMiddlewares

export type GetSyncDefaultMiddleware = () => SyncDefaultMiddlewares
export type GetAsyncDefaultMiddleware = () => AsyncDefaultMiddlewares

/** @deprecated Use GetAsyncDefaultMiddleware */
export type GetDefaultMiddleware = GetAsyncDefaultMiddleware

export type ConfigureSyncMiddlewares = (getDefaultMiddleware: GetSyncDefaultMiddleware) => SyncMiddleware[]
export type ConfigureAsyncMiddlewares = (getDefaultMiddleware: GetAsyncDefaultMiddleware) => AsyncMiddleware[]

/** @deprecated Use ConfigureAsyncMiddlewares */
export type ConfigureMiddlewares = ConfigureAsyncMiddlewares

// --- Storage configs ---

/**
 * Функция миграции персистентного состояния между версиями схемы.
 * Вызывается при `initialize()`, если в хранилище лежат данные с версией ниже текущей
 * (`config.version`). Получает сырое сохранённое состояние и его версию, должна вернуть
 * состояние, соответствующее текущей схеме.
 */
export type MigrateFn<T extends Record<string, any> = Record<string, any>> = (persistedState: any, persistedVersion: number) => T

/** Базовая конфигурация хранилища (общие поля) */
export interface BaseStorageConfig<T extends Record<string, any> = Record<string, any>> {
  name: string
  initialState?: T
  singleton?: SingletonOptions
  /**
   * Версия схемы персистентного состояния. Задайте, когда форма `initialState` меняется
   * между релизами и в localStorage/IndexedDB могут лежать данные старой схемы.
   *
   * Версия сохраняется рядом с данными; при следующей инициализации сравнивается с этой.
   * Если сохранённая версия ниже — запускается {@link BaseStorageConfig.migrate}.
   *
   * Без `version` поведение не меняется (миграция выключена). Для `memory` игнорируется
   * (нечего персистить).
   */
  version?: number
  /**
   * Преобразует сохранённое состояние старой версии к текущей схеме. Вызывается, только
   * если задана {@link BaseStorageConfig.version} и сохранённая версия меньше текущей.
   *
   * @example
   * ```ts
   * new LocalStorage({
   *   name: 'settings',
   *   version: 2,
   *   initialState: { theme: 'light', locale: 'en' },
   *   migrate: (old, fromVersion) =>
   *     fromVersion < 1 ? { theme: old.dark ? 'dark' : 'light', locale: 'en' } : { ...old, locale: old.locale ?? 'en' },
   * })
   * ```
   */
  migrate?: MigrateFn<T>
}

/** Конфигурация для sync-хранилищ (Memory, LocalStorage) */
export interface SyncStorageConfig<T extends Record<string, any> = Record<string, any>> extends BaseStorageConfig<T> {
  middlewares?: ConfigureSyncMiddlewares
  /**
   * Очищать данные хранилища при `destroy()`.
   * - `memory` → по умолчанию `true` (эфемерное хранилище).
   * - `localStorage` → по умолчанию `false` (персистентное: данные переживают `destroy`, как у IndexedDB).
   *
   * Задайте явно, чтобы переопределить дефолт адаптера.
   */
  clearOnDestroy?: boolean
}

/** Конфигурация для async-хранилищ (IndexedDB) */
export interface AsyncStorageConfig<T extends Record<string, any> = Record<string, any>> extends BaseStorageConfig<T> {
  middlewares?: ConfigureAsyncMiddlewares
}

/**
 * @deprecated Use SyncStorageConfig or AsyncStorageConfig
 * Обратная совместимость — общий StorageConfig
 */
export interface StorageConfig<T extends Record<string, any> = Record<string, any>> {
  name: string
  initialState?: T
  middlewares?: ConfigureMiddlewares
}

/** @deprecated Use SyncStorageConfig */
export interface StorageSingletonConfig<T extends Record<string, any> = Record<string, any>> extends StorageConfig<T> {
  singleton?: SingletonOptions
}

// --- Specific storage configs ---

export type MemoryStorageConfig<T extends Record<string, any> = Record<string, any>> = SyncStorageConfig<T>

export type LocalStorageConfig<T extends Record<string, any> = Record<string, any>> = SyncStorageConfig<T>

export interface IndexedDBStorageConfig<T extends Record<string, any> = Record<string, any>> extends AsyncStorageConfig<T> {
  options: IndexedDBConfig
}

/** Для универсальных методов (factory) — конфиг с явным типом */
export interface UniversalStorageConfig<T extends Record<string, any> = Record<string, any>> extends BaseStorageConfig<T> {
  type: StorageType
  middlewares?: ConfigureSyncMiddlewares | ConfigureAsyncMiddlewares
  options?: IndexedDBConfig
}
