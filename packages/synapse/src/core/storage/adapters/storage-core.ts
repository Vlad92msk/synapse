import { SingletonKeyGenerator, SingletonManager } from '../modules/singleton/singleton.util'
import { BaseStorageConfig, IEventEmitter, ILogger, IStorageBase, StorageEvent, StorageEvents, StorageInitStatus, StorageStatus, StorageType } from '../storage.interface'
import { StorageKeyType } from '../utils/storage-key'

export type PathSelector<T, R> = (state: T) => R

/**
 * Общая константа для глобальной подписки.
 * Используется в StorageCore и наследниках.
 */
export const GLOBAL_SUBSCRIPTION_KEY = '*'

/**
 * Абстрактный базовый класс с общей инфраструктурой хранилища.
 *
 * Содержит: status management, subscriptions, lifecycle wrappers,
 * state cache, event emission, singleton cleanup.
 *
 * Не содержит: middleware, plugin executor, do* методы, публичные CRUD-операции.
 */
export abstract class StorageCore<T extends Record<string, any>> implements IStorageBase<T> {
  name: string
  abstract readonly type: StorageType

  private _initStatus: StorageInitStatus = { status: StorageStatus.IDLE }
  private _isDestroyed = false
  private statusSubscribers = new Set<(status: StorageInitStatus) => void>()

  protected subscribers = new Map<StorageKeyType, Set<(value: any) => void>>()
  protected _stateCache: T = {} as T
  protected keyVersions = new Map<string, number>()

  constructor(
    protected readonly coreConfig: BaseStorageConfig<T>,
    protected readonly eventEmitter?: IEventEmitter,
    protected readonly logger?: ILogger,
  ) {
    this.name = coreConfig.name
  }

  // ─── Status Management ──────────────────────────────────────────────────────

  get initStatus(): StorageInitStatus {
    return { ...this._initStatus }
  }

  async waitForReady(): Promise<this> {
    if (this._initStatus.status === StorageStatus.READY) return this
    if (this._initStatus.status === StorageStatus.ERROR) {
      throw this._initStatus.error || new Error('Storage initialization failed')
    }

    return new Promise((resolve, reject) => {
      const unsubscribe = this.onStatusChange((status) => {
        if (status.status === StorageStatus.READY) {
          unsubscribe()
          resolve(this)
        } else if (status.status === StorageStatus.ERROR) {
          unsubscribe()
          reject(status.error || new Error('Storage initialization failed'))
        }
      })
    })
  }

  onStatusChange(callback: (status: StorageInitStatus) => void): VoidFunction {
    this.statusSubscribers.add(callback)
    callback(this.initStatus)

    return () => {
      this.statusSubscribers.delete(callback)
    }
  }

  protected updateInitStatus(update: Partial<StorageInitStatus>): void {
    const previousStatus = this._initStatus.status

    this._initStatus = { ...this._initStatus, ...update }

    if (previousStatus !== this._initStatus.status) {
      this.logger?.debug(`Storage "${this.name}" status changed: ${previousStatus} -> ${this._initStatus.status}`)
    }

    const statusCopy = this.initStatus
    this.statusSubscribers.forEach((callback) => {
      try {
        callback(statusCopy)
      } catch (error) {
        this.logger?.error('Error in status change callback', { error })
      }
    })
  }

  protected ensureReady(): void {
    if (this._isDestroyed) {
      throw new Error(`Storage "${this.name}" has been destroyed`)
    }
    if (this._initStatus.status !== StorageStatus.READY) {
      throw new Error(`Storage "${this.name}" is not ready. Current status: ${this._initStatus.status}`)
    }
  }

  // ─── State Cache ────────────────────────────────────────────────────────────

  public getStateSync(): T {
    return this._stateCache
  }

  // ─── Subscriptions ──────────────────────────────────────────────────────────

  public subscribeToAll(callback: (event: { type: string; key?: StorageKeyType[] | StorageKeyType; value?: any; changedPaths?: string[] }) => void): VoidFunction {
    if (!this.subscribers.has(GLOBAL_SUBSCRIPTION_KEY)) {
      this.subscribers.set(GLOBAL_SUBSCRIPTION_KEY, new Set())
    }

    this.subscribers.get(GLOBAL_SUBSCRIPTION_KEY)!.add(callback)

    return () => {
      const subscribers = this.subscribers.get(GLOBAL_SUBSCRIPTION_KEY)
      if (subscribers) {
        subscribers.delete(callback)
        if (subscribers.size === 0) {
          this.subscribers.delete(GLOBAL_SUBSCRIPTION_KEY)
        }
      }
    }
  }

  public subscribe(key: string, callback: (value: any) => void): VoidFunction
  public subscribe<R>(pathSelector: PathSelector<T, R>, callback: (value: R) => void): VoidFunction
  public subscribe<R>(keyOrSelector: string | PathSelector<T, R>, callback: (value: any) => void): VoidFunction {
    if (typeof keyOrSelector === 'string') {
      return this.subscribeByKey(keyOrSelector, callback)
    }
    return this.subscribeBySelector(keyOrSelector, callback)
  }

  protected abstract subscribeByKey(key: string, callback: (value: any) => void): VoidFunction
  protected abstract subscribeBySelector<R>(pathSelector: PathSelector<T, R>, callback: (value: R) => void): VoidFunction

  protected notifySubscribers(key: StorageKeyType, value: any): void {
    const keyStr = key.toString()

    // Инкрементируем версию ключа — используется для защиты от race condition в subscribeByKey (async)
    this.keyVersions.set(keyStr, (this.keyVersions.get(keyStr) ?? 0) + 1)

    const exactSubscribers = this.subscribers.get(keyStr)
    if (exactSubscribers?.size) {
      const subscribersCopy = new Set(exactSubscribers)
      subscribersCopy.forEach((callback) => {
        try {
          callback(value)
        } catch (error) {
          this.logger?.error('Ошибка в подписчике на колбэк', { key: keyStr, error })
        }
      })
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  public async initialize(): Promise<this> {
    if (this._initStatus.status === StorageStatus.READY) return this
    if (this._initStatus.status === StorageStatus.LOADING) return this.waitForReady()

    this.updateInitStatus({ status: StorageStatus.LOADING, error: undefined })

    try {
      await this.performInitialize()
      this.updateInitStatus({ status: StorageStatus.READY, error: undefined })
      return this
    } catch (error) {
      this.updateInitStatus({
        status: StorageStatus.ERROR,
        error: error instanceof Error ? error : new Error(String(error)),
      })
      throw error
    }
  }

  /**
   * Subclass-specific initialization.
   * Called inside initialize() wrapper after status is set to LOADING.
   */
  protected abstract performInitialize(): Promise<void>

  public async destroy(): Promise<void> {
    if (this._isDestroyed) return
    this._isDestroyed = true

    try {
      if (this._initStatus.status === StorageStatus.LOADING) {
        try {
          await this.waitForReady()
        } catch {
          // Инициализация упала — продолжаем destroy
        }
      }

      if (this._initStatus.status === StorageStatus.READY) {
        await this.performCleanup()
      }

      this.statusSubscribers.clear()

      if (this.coreConfig.singleton?.enabled) {
        const key = SingletonKeyGenerator.generate(this.coreConfig as any, this.type)
        SingletonManager.remove(key)
      }

      this._stateCache = {} as T
      this.updateInitStatus({ status: StorageStatus.IDLE })

      await this.emitEvent({ type: StorageEvents.STORAGE_DESTROY })
    } catch (error) {
      this.logger?.error('Error destroying storage', { error })
      throw error
    }
  }

  /**
   * Subclass-specific cleanup during destroy.
   * Should clear storage data, call doDestroy, cleanup middlewares.
   */
  protected abstract performCleanup(): Promise<void>

  // ─── Events ─────────────────────────────────────────────────────────────────

  protected async emitEvent(event: StorageEvent): Promise<void> {
    try {
      await this.eventEmitter?.emit({
        ...event,
        metadata: {
          ...(event.metadata || {}),
          timestamp: Date.now(),
          storageName: this.name,
        },
      })
    } catch (error) {
      this.logger?.error('Error emitting event', { event, error })
    }
  }
}
