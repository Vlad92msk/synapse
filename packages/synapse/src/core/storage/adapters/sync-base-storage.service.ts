import { syncBatchingMiddleware } from '../middlewares/sync-storage-batching.middleware'
import { syncLoggerMiddleware } from '../middlewares/sync-storage-logger.middleware'
import { syncShallowCompareMiddleware } from '../middlewares/sync-storage-shallow-compare.middleware'
import { IEventEmitter, ILogger, ISyncStorage, StorageEvents, StorageType, SyncDefaultMiddlewares, SyncStorageConfig } from '../storage.interface'
import { SyncMiddleware, SyncMiddlewareModule, VALUE_NOT_CHANGED } from '../utils/middleware-module'
import { decideMigration } from '../utils/migration.util'
import { createDummyState, extractPath } from '../utils/path-selector.util'
import { createLazyClone, findChangedPaths, isEqual } from '../utils/state-diff.util'
import { StorageKeyType } from '../utils/storage-key'
import { getValueByPath } from './path.utils'
import { GLOBAL_SUBSCRIPTION_KEY, PathSelector, StorageCore } from './storage-core'

/**
 * Базовый класс для синхронных хранилищ (Memory, LocalStorage).
 *
 * Все CRUD-операции выполняются синхронно.
 * Lifecycle (initialize, destroy) остаётся async.
 * subscribeByKey упрощён — нет race condition без async get.
 */
export abstract class SyncBaseStorage<T extends Record<string, any>> extends StorageCore<T> implements ISyncStorage<T> {
  abstract readonly type: StorageType

  private middlewareModule: SyncMiddlewareModule
  private initializedMiddlewares: SyncMiddleware[] | null = null
  private selectorPathCache = new WeakMap<PathSelector<any, any>, string>()

  constructor(
    protected readonly config: SyncStorageConfig<T>,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ) {
    super(config, eventEmitter, logger)
    this.middlewareModule = new SyncMiddlewareModule({
      getState: () => this.getRawState(),
      doGet: this.doGet.bind(this),
      doSet: this.doSet.bind(this),
      doUpdate: this.doUpdate.bind(this),
      doRemove: this.doRemove.bind(this),
      doClear: this.doClear.bind(this),
      doKeys: this.doKeys.bind(this),
      notifySubscribers: this.notifySubscribers.bind(this),
    })
  }

  // ─── Abstract sync do* methods ──────────────────────────────────────────────

  protected abstract doGet(key: StorageKeyType): any
  protected abstract doSet(key: StorageKeyType, value: any): void
  protected abstract doUpdate(updates: Array<{ key: StorageKeyType; value: any }>): void
  protected abstract doRemove(key: StorageKeyType): boolean
  protected abstract doClear(): void
  protected abstract doKeys(): string[]
  protected abstract doHas(key: StorageKeyType): boolean

  /** Lifecycle — всегда async */
  protected abstract doInitialize(): Promise<this>
  /** Lifecycle — всегда async */
  protected abstract doDestroy(): Promise<void>

  // ─── Lifecycle hooks ────────────────────────────────────────────────────────

  protected async performInitialize(): Promise<void> {
    await this.doInitialize()
    this._stateCache = this.getRawState()
  }

  /**
   * Дефолт для `config.clearOnDestroy`, если он не задан.
   * Memory: `true` (эфемерное). LocalStorage переопределяет на `false` (персистентное).
   */
  protected get clearOnDestroyDefault(): boolean {
    return true
  }

  protected async performCleanup(): Promise<void> {
    // Обходим публичный clear() (избегая ensureReady после _isDestroyed = true)
    if (this.config.clearOnDestroy ?? this.clearOnDestroyDefault) {
      this.doClear()
      this.clearPersistedVersion()
    }

    await this.doDestroy()

    if (this.initializedMiddlewares) {
      this.initializedMiddlewares.forEach((m) => m.cleanup?.())
      this.initializedMiddlewares = null
    }
  }

  // ─── Middleware initialization ──────────────────────────────────────────────

  protected initializeMiddlewares(): void {
    if (this.config.middlewares && !this.initializedMiddlewares) {
      this.initializedMiddlewares = this.config.middlewares(() => this.getDefaultMiddleware())
      this.initializedMiddlewares.forEach((middleware) => this.middlewareModule.use(middleware))
    }
  }

  protected getDefaultMiddleware(): SyncDefaultMiddlewares {
    return {
      batching: (options = {}) => syncBatchingMiddleware(options),
      shallowCompare: (options = {}) => syncShallowCompareMiddleware(options),
      logger: (options = {}) => syncLoggerMiddleware(options),
    }
  }

  protected initializeWithMiddlewares(): void {
    try {
      const state = this.getRawState()
      const hasExistingState = Object.keys(state).length > 0

      // Миграция выключена (version не задан) — прежнее поведение: засеять initialState на пустом.
      if (this.config.version === undefined) {
        if (!hasExistingState && this.config.initialState) {
          this.middlewareModule.dispatch({ type: 'init', value: this.config.initialState })
        }
        return
      }

      const decision = decideMigration({
        hasExisting: hasExistingState,
        existingState: state,
        persistedVersion: this.readPersistedVersion(),
        targetVersion: this.config.version,
        migrate: this.config.migrate,
      })

      switch (decision.kind) {
        case 'seed': {
          if (this.config.initialState) {
            this.middlewareModule.dispatch({ type: 'init', value: this.config.initialState })
          }
          this.writePersistedVersion(this.config.version)
          break
        }
        case 'migrate': {
          this.middlewareModule.dispatch({ type: 'reset', value: decision.state })
          this.writePersistedVersion(this.config.version)
          break
        }
        case 'bump': {
          this.writePersistedVersion(this.config.version)
          break
        }
        case 'none':
          break
      }
    } catch (error) {
      this.logger?.error('Ошибка инициализации хранилища', { error })
      throw error
    }
  }

  // ─── Persisted schema version (persist-migration) ───────────────────────────

  /** Читает сохранённую версию схемы. По умолчанию `undefined` (эфемерные хранилища). */
  protected readPersistedVersion(): number | undefined {
    return undefined
  }

  /** Сохраняет версию схемы рядом с данными. По умолчанию no-op (эфемерные хранилища). */
  protected writePersistedVersion(_version: number): void {}

  /** Удаляет сохранённую версию схемы (вызывается при destroy с `clearOnDestroy`). */
  protected clearPersistedVersion(): void {}

  // ─── Internal state access ──────────────────────────────────────────────────

  private getRawState(): T {
    try {
      const value = this.doGet('')
      return value || {}
    } catch (error) {
      this.logger?.error('Error getting state', { error })
      throw error
    }
  }

  // ─── Public sync API ────────────────────────────────────────────────────────

  public get<R>(key: StorageKeyType): R | undefined {
    this.ensureReady()

    try {
      const metadata = { operation: 'get', timestamp: Date.now(), key }

      const finalResult = this.middlewareModule.dispatch({
        type: 'get',
        key,
        metadata,
      })

      // Чтения не эмитят событий — это горячий путь, а STORAGE_SELECT нигде не потребляется.
      return finalResult
    } catch (error) {
      this.logger?.error('Error getting value', { key, error })
      throw error
    }
  }

  public set<R>(key: StorageKeyType, value: R): void {
    this.ensureReady()

    try {
      const metadata = { operation: 'set', timestamp: Date.now(), key }

      const finalResult = this.middlewareModule.dispatch({
        type: 'set',
        key,
        value,
        metadata,
      })

      if (finalResult === VALUE_NOT_CHANGED) return

      this._stateCache = this.getRawState()

      const keyStr = key.toString()
      const changedPaths = [keyStr]

      this.notifySubscribers(key, finalResult)

      this.notifySubscribers(GLOBAL_SUBSCRIPTION_KEY, {
        type: StorageEvents.STORAGE_UPDATE,
        key,
        value: finalResult,
        changedPaths,
      })

      this.emitEvent({
        type: StorageEvents.STORAGE_UPDATE,
        payload: { key, value: finalResult, changedPaths },
      })
    } catch (error) {
      this.logger?.error('Error setting value', { key, error })
      throw error
    }
  }

  public update(updater: (state: T) => void): void {
    this.ensureReady()

    try {
      const metadata = { operation: 'update', timestamp: Date.now() }

      const currentState = this.getState()
      const newState = createLazyClone(currentState)
      updater(newState)

      const changedPaths = findChangedPaths(currentState, newState)

      if (changedPaths.size === 0) {
        this.logger?.debug?.('No changes detected in update')
        return
      }

      this.logger?.debug?.('Changed paths:', { paths: Array.from(changedPaths) })

      const changedTopLevelKeys = new Set<string>()
      for (const path of changedPaths) {
        changedTopLevelKeys.add(path.split('.')[0])
      }

      const updates = Array.from(changedTopLevelKeys).map((key) => {
        return { key, value: newState[key] }
      })

      const result = this.middlewareModule.dispatch({
        type: 'update',
        value: updates,
        metadata: {
          ...metadata,
          batchUpdate: true,
          changedPaths: Array.from(changedPaths),
        },
      })

      let updatedValues: Record<string, any> = {}
      if (Array.isArray(result)) {
        result.forEach((update: any) => {
          if (update && typeof update === 'object' && 'key' in update && 'value' in update) {
            updatedValues[update.key as string] = update.value
          }
        })
      } else if (result && typeof result === 'object') {
        updatedValues = { ...result }
      }

      const actuallyChangedKeys = Object.keys(updatedValues).filter((key) => !isEqual(currentState[key], updatedValues[key]))

      if (actuallyChangedKeys.length === 0) {
        this.logger?.debug?.('No actual changes after middleware processing')
        return
      }

      const finalUpdates: Record<string, any> = {}
      actuallyChangedKeys.forEach((key) => {
        finalUpdates[key] = updatedValues[key]
      })

      this.logger?.debug?.('Notifying subscribers about changes:', { keys: actuallyChangedKeys })

      this._stateCache = { ...currentState, ...finalUpdates } as T

      this.notifySubscribers(GLOBAL_SUBSCRIPTION_KEY, {
        type: StorageEvents.STORAGE_UPDATE,
        key: actuallyChangedKeys,
        value: finalUpdates,
        changedPaths: Array.from(changedPaths),
      })

      for (const path of changedPaths) {
        try {
          const topLevelKey = path.split('.')[0]
          if (topLevelKey in finalUpdates) {
            let value
            if (path === topLevelKey) {
              value = finalUpdates[topLevelKey]
            } else {
              const restPath = path.substring(topLevelKey.length + 1)
              value = getValueByPath(finalUpdates[topLevelKey], restPath)
            }
            if (value !== undefined) {
              this.notifySubscribers(path, value)
            }
          }
        } catch (error) {
          this.logger?.error('Error notifying path subscribers', { path, error })
        }
      }

      this.emitEvent({
        type: StorageEvents.STORAGE_UPDATE,
        payload: {
          state: finalUpdates,
          key: actuallyChangedKeys,
          changedPaths: Array.from(changedPaths),
        },
      })
    } catch (error) {
      this.logger?.error('Error updating state', { error })
      throw error
    }
  }

  public remove(key: StorageKeyType): void {
    this.ensureReady()

    try {
      const metadata = { operation: 'delete', timestamp: Date.now(), key }

      const middlewareResult = this.middlewareModule.dispatch({
        type: 'delete',
        key,
        metadata,
      })

      if (middlewareResult === false) return

      this._stateCache = this.getRawState()

      const keyStr = key.toString()
      const changedPaths = [keyStr]

      this.notifySubscribers(key, undefined)
      this.notifySubscribers(GLOBAL_SUBSCRIPTION_KEY, {
        type: StorageEvents.STORAGE_UPDATE,
        key,
        value: undefined,
        result: middlewareResult,
        changedPaths,
      })

      this.emitEvent({
        type: StorageEvents.STORAGE_UPDATE,
        payload: { key, value: undefined, result: middlewareResult, changedPaths },
      })
    } catch (error) {
      this.logger?.error('Error deleting value', { key, error })
      throw error
    }
  }

  public clear(): void {
    this.ensureReady()

    try {
      this.middlewareModule.dispatch({ type: 'clear' })

      this._stateCache = {} as T
    } catch (error) {
      this.logger?.error('Error clearing storage', { error })
      throw error
    }
  }

  public reset(): void {
    this.ensureReady()

    try {
      const initialState = this.config.initialState

      this.middlewareModule.dispatch({
        type: 'reset',
        value: initialState,
      })

      this._stateCache = initialState ? ({ ...initialState } as T) : ({} as T)

      const changedPaths = Object.keys(this._stateCache)

      this.notifySubscribers(GLOBAL_SUBSCRIPTION_KEY, {
        type: StorageEvents.STORAGE_CLEAR,
        changedPaths,
      })

      this.emitEvent({
        type: StorageEvents.STORAGE_CLEAR,
        payload: { changedPaths },
      })
    } catch (error) {
      this.logger?.error('Error resetting storage', { error })
      throw error
    }
  }

  /**
   * SSR-гидрация: заменяет всё состояние переданным снапшотом. Намеренно НЕ требует
   * `ready()` — типичный сценарий вызвать её до `initialize()`, чтобы инициализация
   * не перезатёрла серверное состояние `initialState`-ом (см. `initializeWithMiddlewares`).
   */
  public hydrate(state: T): void {
    try {
      this.doSet('', state)
      this._stateCache = this.getRawState()

      // Если включён persist-migration — фиксируем текущую версию: серверный снапшот
      // уже в актуальной схеме, миграцию на нём запускать не нужно.
      if (this.config.version !== undefined) {
        this.writePersistedVersion(this.config.version)
      }

      this.notifyHydration(this._stateCache)
    } catch (error) {
      this.logger?.error('Error hydrating storage', { error })
      throw error
    }
  }

  /** Уведомляет подписчиков о замене состояния гидрацией (no-op до initialize/без подписок). */
  private notifyHydration(state: T): void {
    const changedPaths = Object.keys(state)

    for (const key of changedPaths) {
      this.notifySubscribers(key, (state as Record<string, any>)[key])
    }

    this.notifySubscribers(GLOBAL_SUBSCRIPTION_KEY, {
      type: StorageEvents.STORAGE_UPDATE,
      key: changedPaths,
      value: state,
      changedPaths,
    })
  }

  public keys(): string[] {
    this.ensureReady()

    try {
      return this.middlewareModule.dispatch({ type: 'keys' })
    } catch (error) {
      this.logger?.error('Error getting keys', { error })
      throw error
    }
  }

  public has(key: StorageKeyType): boolean {
    this.ensureReady()
    try {
      return this.doHas(key)
    } catch (error) {
      this.logger?.error('Error checking value existence', { key, error })
      throw error
    }
  }

  public getState(): T {
    this.ensureReady()
    return this.getRawState()
  }

  // ─── Subscriptions (4.4 — simplified for sync) ─────────────────────────────

  /**
   * Sync-версия subscribeByKey.
   * Нет race condition (get() синхронный) → не нужен keyVersions tracking.
   */
  protected subscribeByKey(key: string, callback: (value: any) => void): VoidFunction {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }
    this.subscribers.get(key)!.add(callback)

    // Синхронно получаем начальное значение и сразу вызываем callback
    try {
      const value = this.get(key)
      callback(value)
    } catch (error) {
      this.logger?.error('Error in initial callback', { key, error })
    }

    return () => {
      const subscribers = this.subscribers.get(key)
      if (subscribers) {
        subscribers.delete(callback)
        if (subscribers.size === 0) {
          this.subscribers.delete(key)
        }
      }
    }
  }

  protected subscribeBySelector<R>(pathSelector: PathSelector<T, R>, callback: (value: R) => void): VoidFunction {
    const dummyState = createDummyState<T>()
    const fullPath = extractPath(pathSelector, dummyState, this.selectorPathCache)

    this.logger?.debug?.('Subscribing to path:', { path: fullPath })

    // Sync-обёртка: получаем текущее состояние синхронно и применяем селектор
    const wrappedCallback = (value: any) => {
      try {
        if (value === undefined || value === null || typeof value === 'object') {
          const currentState = this.getState()
          const selectedValue = pathSelector(currentState)
          callback(selectedValue as R)
          return
        }
        callback(value as R)
      } catch (error) {
        this.logger?.error('Error in selector callback', { path: fullPath, error })
        callback(value as R)
      }
    }

    if (!fullPath) {
      return this.subscribeToAll(() => {
        callback(pathSelector(this.getState()))
      })
    }

    return this.subscribeByKey(fullPath, wrappedCallback)
  }
}
