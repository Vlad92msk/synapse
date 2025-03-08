import { StorageKeyType } from '../../utils/storage-key'

export interface KeyTransform {
  encode(key: StorageKeyType): Promise<StorageKeyType>
  decode(key: StorageKeyType): Promise<StorageKeyType>
}

// Контекст выполнения для плагинов
export interface PluginContext {
  storageName: string
  timestamp: number
  metadata?: Record<string, any>
}

export interface IPlugin {
  name: string
  initialize?(): Promise<void>
  destroy?(): Promise<void>
}

export interface IStoragePlugin extends IPlugin {
  // Основные хуки - работают только со значениями
  onBeforeSet?<T>(value: T, context: PluginContext): Promise<T>
  onAfterSet?<T>(key: StorageKeyType, value: T, context: PluginContext): Promise<T>
  onBeforeGet?(key: StorageKeyType, context: PluginContext): Promise<StorageKeyType>
  onAfterGet?<T>(key: StorageKeyType, value: T | undefined, context: PluginContext): Promise<T | undefined>
  onBeforeDelete?(key: StorageKeyType, context: PluginContext): Promise<boolean>
  onAfterDelete?(key: StorageKeyType, context: PluginContext): Promise<void>
  onClear?(context: PluginContext): Promise<void>

  // Опциональные хуки для трансформации ключей
  onKeyTransform?: KeyTransform
}

export interface IPluginExecutor {
  // Основные методы для работы со значениями
  executeBeforeSet<T>(value: T, metadata?: Record<string, any>): Promise<T>
  executeAfterSet<T>(key: StorageKeyType, value: T, metadata?: Record<string, any>): Promise<T>
  executeBeforeGet(key: StorageKeyType, metadata?: Record<string, any>): Promise<StorageKeyType>
  executeAfterGet<T>(key: StorageKeyType, value: T | undefined, metadata?: Record<string, any>): Promise<T | undefined>
  executeBeforeDelete(key: StorageKeyType, metadata?: Record<string, any>): Promise<boolean>
  executeAfterDelete(key: StorageKeyType, metadata?: Record<string, any>): Promise<void>
  executeOnClear(metadata?: Record<string, any>): Promise<void>

  // Методы для работы с ключами
  executeKeyEncode(key: StorageKeyType): Promise<StorageKeyType>
  executeKeyDecode(key: StorageKeyType): Promise<StorageKeyType>
}

export interface IPluginManager<T extends IPlugin> {
  add(plugin: T): Promise<void>
  remove(name: string): Promise<void>
  get(name: string): T | undefined
  getAll(): T[]
  initialize(): Promise<void>
  destroy(): Promise<void>
}
