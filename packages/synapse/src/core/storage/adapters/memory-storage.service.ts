import { SingletonMixin } from '../modules/singleton/mixin.util'
import { IEventEmitter, ILogger, MemoryStorageConfig, StorageType } from '../storage.interface'
import { StorageKey, StorageKeyType } from '../utils/storage-key'
import { getValueByPath, parsePath, setValueByPath } from './path.utils'
import { SyncBaseStorage } from './sync-base-storage.service'

export class MemoryStorage<T extends Record<string, any>> extends SyncBaseStorage<T> {
  protected static readonly STORAGE_TYPE: StorageType = 'memory'
  readonly type: StorageType = 'memory'

  private storage = new Map<string, any>()

  constructor(config: MemoryStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger) {
    super(config, eventEmitter, logger)
  }

  static create<T extends Record<string, any>>(config: MemoryStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger): MemoryStorage<T> {
    return SingletonMixin.handleSingletonCreation(
      config,
      this.STORAGE_TYPE,
      (finalConfig) => new MemoryStorage<T>(finalConfig as MemoryStorageConfig<T>, eventEmitter, logger),
      logger,
    )
  }

  protected async doInitialize(): Promise<this> {
    try {
      this.logger?.debug(`Initializing MemoryStorage "${this.name}"`)

      this.initializeMiddlewares()
      this.initializeWithMiddlewares()

      this.logger?.debug(`MemoryStorage "${this.name}" initialized successfully`)
      return this
    } catch (error) {
      this.logger?.error('Error initializing MemoryStorage', { error })
      throw error
    }
  }

  protected doGet(key: StorageKeyType): any {
    const state = this.storage.get(this.name)
    if (!state) return undefined

    if (key instanceof StorageKey && key.isUnparseable()) {
      return state[key.valueOf()]
    }

    return getValueByPath(state, key)
  }

  protected doSet(key: StorageKeyType, value: any): void {
    const state = this.storage.get(this.name) || {}

    if (key instanceof StorageKey && key.isUnparseable()) {
      state[key.valueOf()] = value
      this.storage.set(this.name, state)
      return
    }

    const newState = setValueByPath({ ...state }, key, value)
    this.storage.set(this.name, newState)
  }

  protected doRemove(key: StorageKeyType): boolean {
    const state = this.storage.get(this.name)
    if (!state) return false

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

  protected doUpdate(updates: Array<{ key: StorageKeyType; value: any }>): void {
    const currentState = this.storage.get(this.name) || {}
    const newState = { ...currentState }

    for (const { key, value } of updates) {
      if (key instanceof StorageKey && key.isUnparseable()) {
        newState[key.valueOf()] = value
      } else {
        setValueByPath(newState, key, value)
      }
    }

    this.storage.set(this.name, newState)
  }

  protected doClear(): void {
    this.storage.delete(this.name)
  }

  protected doKeys(): string[] {
    const state = this.storage.get(this.name)
    if (!state) return []
    return Object.keys(state)
  }

  protected doHas(key: StorageKeyType): boolean {
    const value = this.doGet(key)
    return value !== undefined
  }

  protected async doDestroy(): Promise<void> {
    // Очистка управляется флагом config.clearOnDestroy в performCleanup (memory → по умолчанию true).
  }
}
