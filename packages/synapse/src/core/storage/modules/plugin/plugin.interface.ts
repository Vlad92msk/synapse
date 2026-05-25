import { StorageKeyType } from '../../utils/storage-key'

/**
 * Контекст выполнения для плагинов
 * Содержит информацию о текущей операции и хранилище
 */
export interface PluginContext {
  /** Имя хранилища, к которому применяется плагин */
  storageName: string

  /** Временная метка выполнения операции (timestamp) */
  timestamp: number

  /** Дополнительные метаданные операции (могут быть предоставлены хранилищем или другими плагинами) */
  metadata?: Record<string, any>
}

/**
 * Базовый интерфейс для всех плагинов
 * Определяет основные свойства и методы жизненного цикла
 */
export interface IPlugin {
  /** Уникальное имя плагина */
  name: string

  /**
   * Метод инициализации плагина
   * Вызывается при добавлении плагина в хранилище или при инициализации хранилища
   */
  initialize?(): Promise<void>

  /**
   * Метод уничтожения плагина
   * Вызывается при удалении плагина из хранилища или при уничтожении хранилища
   * Используется для освобождения ресурсов и очистки состояния
   */
  destroy?(): Promise<void>
}

// ─── Sync Storage Plugin ──────────────────────────────────────────────────────

/**
 * Интерфейс плагина для синхронного хранилища.
 * Все хуки выполняются синхронно.
 */
export interface ISyncStoragePlugin extends IPlugin {
  onBeforeSet?<T>(value: T, context: PluginContext): T
  onAfterSet?<T>(key: StorageKeyType, value: T, context: PluginContext): T
  onBeforeGet?(key: StorageKeyType, context: PluginContext): StorageKeyType
  onAfterGet?<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): T | undefined
  onBeforeDelete?(key: StorageKeyType, context: PluginContext): boolean
  onAfterDelete?(key: StorageKeyType, context: PluginContext): void
  onClear?(context: PluginContext): void
}

/**
 * Исполнитель плагинов для синхронных хранилищ.
 * Все execute* методы возвращают значения синхронно.
 */
export interface ISyncPluginExecutor {
  executeBeforeSet<T>(value: T, metadata?: Record<string, any>): T
  executeAfterSet<T>(key: StorageKeyType, value: T, metadata?: Record<string, any>): T
  executeBeforeGet(key: StorageKeyType, metadata?: Record<string, any>): StorageKeyType
  executeAfterGet<T>(key: StorageKeyType, value: T | undefined, metadata?: Record<string, any>): T | undefined
  executeBeforeDelete(key: StorageKeyType, metadata?: Record<string, any>): boolean
  executeAfterDelete(key: StorageKeyType, metadata?: Record<string, any>): void
  executeOnClear(metadata?: Record<string, any>): void
}

// ─── Async Storage Plugin ─────────────────────────────────────────────────────

/**
 * Интерфейс плагина для асинхронного хранилища.
 * Все хуки возвращают Promise.
 */
export interface IAsyncStoragePlugin extends IPlugin {
  onBeforeSet?<T>(value: T, context: PluginContext): Promise<T>
  onAfterSet?<T>(key: StorageKeyType, value: T, context: PluginContext): Promise<T>
  onBeforeGet?(key: StorageKeyType, context: PluginContext): Promise<StorageKeyType>
  onAfterGet?<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): Promise<T | undefined>
  onBeforeDelete?(key: StorageKeyType, context: PluginContext): Promise<boolean>
  onAfterDelete?(key: StorageKeyType, context: PluginContext): Promise<void>
  onClear?(context: PluginContext): Promise<void>
}

/**
 * Исполнитель плагинов для асинхронных хранилищ.
 * Все execute* методы возвращают Promise.
 */
export interface IAsyncPluginExecutor {
  executeBeforeSet<T>(value: T, metadata?: Record<string, any>): Promise<T>
  executeAfterSet<T>(key: StorageKeyType, value: T, metadata?: Record<string, any>): Promise<T>
  executeBeforeGet(key: StorageKeyType, metadata?: Record<string, any>): Promise<StorageKeyType>
  executeAfterGet<T>(key: StorageKeyType, value: T | undefined, metadata?: Record<string, any>): Promise<T | undefined>
  executeBeforeDelete(key: StorageKeyType, metadata?: Record<string, any>): Promise<boolean>
  executeAfterDelete(key: StorageKeyType, metadata?: Record<string, any>): Promise<void>
  executeOnClear(metadata?: Record<string, any>): Promise<void>
}

// ─── Backward Compatibility Aliases ───────────────────────────────────────────

/** @deprecated Use IAsyncStoragePlugin */
export type IStoragePlugin = IAsyncStoragePlugin

/** @deprecated Use IAsyncPluginExecutor */
export type IPluginExecutor = IAsyncPluginExecutor

// ─── Plugin Manager ───────────────────────────────────────────────────────────

/**
 * Менеджер плагинов
 * Отвечает за регистрацию, получение и удаление плагинов
 */
export interface IPluginManager<T extends IPlugin> {
  add(plugin: T): Promise<void>
  remove(name: string): Promise<void>
  get(name: string): T | undefined
  getAll(): T[]
  initialize(): Promise<void>
  destroy(): Promise<void>
}
