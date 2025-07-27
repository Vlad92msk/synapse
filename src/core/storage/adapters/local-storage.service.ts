import { IPluginExecutor } from '../modules/plugin/plugin.interface'
import { SingletonMixin } from '../modules/singleton/mixin.util'
import { IEventEmitter, ILogger, LocalStorageConfig, StorageType } from '../storage.interface'
import { StorageKey, StorageKeyType } from '../utils/storage-key'
import { BaseStorage } from './base-storage.service'
import { getValueByPath, parsePath, setValueByPath } from './path.utils'

export class LocalStorage<T extends Record<string, any>> extends BaseStorage<T> {
  protected static readonly STORAGE_TYPE: StorageType = 'localStorage'

  constructor(config: LocalStorageConfig<T>, pluginExecutor?: IPluginExecutor, eventEmitter?: IEventEmitter, logger?: ILogger) {
    super(config, pluginExecutor, eventEmitter, logger)
  }

  static create<T extends Record<string, any>>(config: LocalStorageConfig, pluginExecutor?: IPluginExecutor, eventEmitter?: IEventEmitter, logger?: ILogger): LocalStorage<T> {
    return SingletonMixin.handleSingletonCreation(
      config,
      this.STORAGE_TYPE,
      (finalConfig) => new LocalStorage<T>(finalConfig as LocalStorageConfig<T>, pluginExecutor, eventEmitter, logger),
      logger,
    )
  }

  protected async doInitialize(): Promise<this> {
    try {
      this.logger?.debug(`Initializing LocalStorage "${this.name}"`)

      // Инициализируем middleware
      this.initializeMiddlewares()

      // Инициализируем с middleware
      await this.initializeWithMiddlewares()

      this.logger?.debug(`LocalStorage "${this.name}" initialized successfully`)
      return this
    } catch (error) {
      this.logger?.error('Error initializing LocalStorage', { error })
      throw error
    }
  }

  protected async doGet(key: StorageKeyType): Promise<any> {
    const storageData = localStorage.getItem(this.name)
    if (!storageData) return undefined

    const state = JSON.parse(storageData)

    // Добавляем проверку на "сырой" ключ
    if (key instanceof StorageKey && key.isUnparseable()) {
      return state[key.valueOf()]
    }

    return getValueByPath(state, key)
  }

  protected async doSet(key: StorageKeyType, value: any): Promise<void> {
    const storageData = localStorage.getItem(this.name)
    const state = storageData ? JSON.parse(storageData) : {}

    // Добавляем проверку на "сырой" ключ
    if (key instanceof StorageKey && key.isUnparseable()) {
      state[key.valueOf()] = value
      localStorage.setItem(this.name, JSON.stringify(state))
      return
    }

    const newState = setValueByPath({ ...state }, key, value)
    localStorage.setItem(this.name, JSON.stringify(newState))
  }

  protected async doDelete(key: StorageKeyType): Promise<boolean> {
    const storageData = localStorage.getItem(this.name)
    if (!storageData) return false

    const state = JSON.parse(storageData)

    // Добавляем проверку на "сырой" ключ
    if (key instanceof StorageKey && key.isUnparseable()) {
      const rawKey = key.valueOf()
      if (!(rawKey in state)) return false
      delete state[rawKey]
      localStorage.setItem(this.name, JSON.stringify(state))
      return true
    }

    const pathParts = parsePath(key)
    const parentPath = pathParts.slice(0, -1).join('.')
    const lastKey = pathParts[pathParts.length - 1]

    const parent = parentPath ? getValueByPath(state, parentPath) : state

    if (!parent || !(lastKey in parent)) return false

    delete parent[lastKey]
    localStorage.setItem(this.name, JSON.stringify(state))
    return true
  }

  protected async doUpdate(updates: Array<{ key: StorageKeyType; value: any }>): Promise<void> {
    const storageData = localStorage.getItem(this.name)
    const state = storageData ? JSON.parse(storageData) : {}

    for (const { key, value } of updates) {
      if (key instanceof StorageKey && key.isUnparseable()) {
        state[key.valueOf()] = value
      } else {
        setValueByPath(state, key, value)
      }
    }

    localStorage.setItem(this.name, JSON.stringify(state))
  }

  protected async doClear(): Promise<void> {
    localStorage.removeItem(this.name)
  }

  protected async doKeys(): Promise<string[]> {
    const storageData = localStorage.getItem(this.name)
    if (!storageData) return []

    const state = JSON.parse(storageData)
    return this.getAllKeys(state)
  }

  protected async doHas(key: StorageKeyType): Promise<boolean> {
    const value = await this.doGet(key)
    return value !== undefined
  }

  private getAllKeys(obj: any): string[] {
    return Object.keys(obj)
  }

  protected async doDestroy(): Promise<void> {
    await this.doClear()
  }
}
