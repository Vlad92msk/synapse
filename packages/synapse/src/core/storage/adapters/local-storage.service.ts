import { SingletonMixin } from '../modules/singleton/mixin.util'
import { IEventEmitter, ILogger, LocalStorageConfig, StorageType } from '../storage.interface'
import { StorageKey, StorageKeyType } from '../utils/storage-key'
import { getValueByPath, parsePath, setValueByPath } from './path.utils'
import { SyncBaseStorage } from './sync-base-storage.service'

export class LocalStorage<T extends Record<string, any>> extends SyncBaseStorage<T> {
  protected static readonly STORAGE_TYPE: StorageType = 'localStorage'
  readonly type: StorageType = 'localStorage'

  constructor(config: LocalStorageConfig<T>, eventEmitter?: IEventEmitter, logger?: ILogger) {
    super(config, eventEmitter, logger)
  }

  static create<T extends Record<string, any>>(config: LocalStorageConfig, eventEmitter?: IEventEmitter, logger?: ILogger): LocalStorage<T> {
    return SingletonMixin.handleSingletonCreation(
      config,
      this.STORAGE_TYPE,
      (finalConfig) => new LocalStorage<T>(finalConfig as LocalStorageConfig<T>, eventEmitter, logger),
      logger,
    )
  }

  protected async doInitialize(): Promise<this> {
    try {
      this.logger?.debug(`Initializing LocalStorage "${this.name}"`)

      this.initializeMiddlewares()
      this.initializeWithMiddlewares()

      this.logger?.debug(`LocalStorage "${this.name}" initialized successfully`)
      return this
    } catch (error) {
      this.logger?.error('Error initializing LocalStorage', { error })
      throw error
    }
  }

  protected doGet(key: StorageKeyType): any {
    const storageData = localStorage.getItem(this.name)
    if (!storageData) return undefined

    const state = JSON.parse(storageData)

    if (key instanceof StorageKey && key.isUnparseable()) {
      return state[key.valueOf()]
    }

    return getValueByPath(state, key)
  }

  protected doSet(key: StorageKeyType, value: any): void {
    const storageData = localStorage.getItem(this.name)
    const state = storageData ? JSON.parse(storageData) : {}

    if (key instanceof StorageKey && key.isUnparseable()) {
      state[key.valueOf()] = value
      localStorage.setItem(this.name, JSON.stringify(state))
      return
    }

    const newState = setValueByPath({ ...state }, key, value)
    localStorage.setItem(this.name, JSON.stringify(newState))
  }

  protected doRemove(key: StorageKeyType): boolean {
    const storageData = localStorage.getItem(this.name)
    if (!storageData) return false

    const state = JSON.parse(storageData)

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

  protected doUpdate(updates: Array<{ key: StorageKeyType; value: any }>): void {
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

  protected doClear(): void {
    localStorage.removeItem(this.name)
  }

  protected doKeys(): string[] {
    const storageData = localStorage.getItem(this.name)
    if (!storageData) return []

    const state = JSON.parse(storageData)
    return Object.keys(state)
  }

  protected doHas(key: StorageKeyType): boolean {
    const value = this.doGet(key)
    return value !== undefined
  }

  /** Персистентное хранилище: по умолчанию НЕ чистим данные на destroy (симметрично IndexedDB). */
  protected get clearOnDestroyDefault(): boolean {
    return false
  }

  // ─── Persisted schema version (persist-migration) ───────────────────────────

  /** Версия схемы хранится отдельным sidecar-ключом, не засоряя сам state. */
  private get versionStorageKey(): string {
    return `${this.name}::__synapse_version__`
  }

  protected readPersistedVersion(): number | undefined {
    const raw = localStorage.getItem(this.versionStorageKey)
    if (raw == null) return undefined
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  protected writePersistedVersion(version: number): void {
    localStorage.setItem(this.versionStorageKey, String(version))
  }

  protected clearPersistedVersion(): void {
    localStorage.removeItem(this.versionStorageKey)
  }

  protected async doDestroy(): Promise<void> {
    // Персистентное хранилище: данные не стираются на destroy.
    // Очистка управляется флагом config.clearOnDestroy в performCleanup.
  }
}
