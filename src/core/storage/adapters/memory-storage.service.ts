import { IPluginExecutor } from '../modules/plugin/plugin.interface'
import { IEventEmitter, ILogger, StorageConfig } from '../storage.interface'
import { StorageKey, StorageKeyType } from '../utils/storage-key'
import { BaseStorage } from './base-storage.service'
import { getValueByPath, parsePath, setValueByPath } from './path.utils'

export class MemoryStorage<T extends Record<string, any>> extends BaseStorage<T> {
  private storage = new Map<string, any>()

  constructor(config: StorageConfig, pluginExecutor?: IPluginExecutor, eventEmitter?: IEventEmitter, logger?: ILogger) {
    super(config, pluginExecutor, eventEmitter, logger)
  }

  protected async doInitialize(): Promise<this> {
    try {
      this.logger?.debug(`Initializing MemoryStorage "${this.name}"`)

      // Инициализируем middleware
      this.initializeMiddlewares()

      // Инициализируем с middleware
      await this.initializeWithMiddlewares()

      this.logger?.debug(`MemoryStorage "${this.name}" initialized successfully`)
      return this
    } catch (error) {
      this.logger?.error('Error initializing MemoryStorage', { error })
      throw error
    }
  }

  protected async doGet(key: StorageKeyType): Promise<any> {
    const state = this.storage.get(this.name)
    if (!state) return undefined

    // Добавляем проверку на "сырой" ключ
    if (key instanceof StorageKey && key.isUnparseable()) {
      return state[key.valueOf()]
    }

    return getValueByPath(state, key)
  }

  protected async doSet(key: StorageKeyType, value: any): Promise<void> {
    const state = this.storage.get(this.name) || {}

    // Добавляем проверку на "сырой" ключ
    if (key instanceof StorageKey && key.isUnparseable()) {
      state[key.valueOf()] = value
      this.storage.set(this.name, state)
      return
    }

    const newState = setValueByPath({ ...state }, key, value)
    this.storage.set(this.name, newState)
  }

  protected async doDelete(key: StorageKeyType): Promise<boolean> {
    const state = this.storage.get(this.name)
    if (!state) return false

    // Добавляем проверку на "сырой" ключ
    if (key instanceof StorageKey && key.isUnparseable()) {
      const rawKey = key.valueOf()
      if (!(rawKey in state)) return false
      delete state[rawKey]
      this.storage.set(this.name, state)
      return true
    }

    const pathParts = parsePath(key)
    const parentPath = pathParts.slice(0, -1).join('.')
    const lastKey = pathParts[pathParts.length - 1]
    const parent = parentPath ? getValueByPath(state, parentPath) : state

    if (!parent || !(lastKey in parent)) return false

    delete parent[lastKey]
    this.storage.set(this.name, state)
    return true
  }

  protected async doUpdate(updates: Array<{ key: StorageKeyType; value: any }>): Promise<void> {
    const currentState = this.storage.get(this.name) || {}
    // Создаем копию текущего состояния
    const newState = { ...currentState }

    for (const { key, value } of updates) {
      if (key instanceof StorageKey && key.isUnparseable()) {
        newState[key.valueOf()] = value
      } else {
        setValueByPath(newState, key, value)
      }
    }

    // Сохраняем новое состояние
    this.storage.set(this.name, newState)
  }

  protected async doClear(): Promise<void> {
    this.storage.delete(this.name)
  }

  protected async doKeys(): Promise<string[]> {
    const state = this.storage.get(this.name)
    if (!state) return []
    return this.getAllKeys(state)
  }

  protected async doHas(key: StorageKeyType): Promise<boolean> {
    const value = await this.doGet(key)
    return value !== undefined
  }

  protected async doDestroy(): Promise<void> {
    this.storage.delete(this.name)
  }

  private getAllKeys(obj: any): string[] {
    return Object.keys(obj)
  }
}
