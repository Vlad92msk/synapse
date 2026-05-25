import { batchingMiddleware } from '../middlewares/storage-batching.middleware'
import { shallowCompareMiddleware } from '../middlewares/storage-shallow-compare.middleware'
import { IAsyncPluginExecutor } from '../modules/plugin/plugin.interface'
import { AsyncDefaultMiddlewares, AsyncStorageConfig, IAsyncStorage, IEventEmitter, ILogger, StorageEvents, StorageType } from '../storage.interface'
import { AsyncMiddlewareModule, Middleware, VALUE_NOT_CHANGED } from '../utils/middleware-module'
import { createDummyState, extractPath } from '../utils/path-selector.util'
import { createLazyClone, findChangedPaths, isEqual } from '../utils/state-diff.util'
import { StorageKeyType } from '../utils/storage-key'
import { getValueByPath } from './path.utils'
import { GLOBAL_SUBSCRIPTION_KEY, PathSelector, StorageCore } from './storage-core'

/**
 * Базовый класс для асинхронных хранилищ (IndexedDB).
 *
 * Все CRUD-операции возвращают Promise.
 * Совместим с текущим API (переименован из BaseStorage).
 */
export abstract class AsyncBaseStorage<T extends Record<string, any>> extends StorageCore<T> implements IAsyncStorage<T> {
  abstract readonly type: StorageType

  private middlewareModule: AsyncMiddlewareModule
  private initializedMiddlewares: Middleware[] | null = null
  private selectorPathCache = new WeakMap<PathSelector<any, any>, string>()

  constructor(
    protected readonly config: AsyncStorageConfig<T>,
    protected readonly pluginExecutor?: IAsyncPluginExecutor,
    eventEmitter?: IEventEmitter,
    logger?: ILogger,
  ) {
    super(config, eventEmitter, logger)
    this.middlewareModule = new AsyncMiddlewareModule({
      getState: () => this.getRawState(),
      doGet: this.doGet.bind(this),
      doSet: this.doSet.bind(this),
      doUpdate: this.doUpdate.bind(this),
      doDelete: this.doDelete.bind(this),
      doClear: this.doClear.bind(this),
      doKeys: this.doKeys.bind(this),
      notifySubscribers: this.notifySubscribers.bind(this),
    })
  }

  // ─── Abstract async do* methods ─────────────────────────────────────────────

  protected abstract doGet(key: StorageKeyType): Promise<any>
  protected abstract doSet(key: StorageKeyType, value: any): Promise<void>
  protected abstract doUpdate(updates: Array<{ key: StorageKeyType; value: any }>): Promise<void>
  protected abstract doDelete(key: StorageKeyType): Promise<boolean>
  protected abstract doClear(): Promise<void>
  protected abstract doKeys(): Promise<string[]>
  protected abstract doHas(key: StorageKeyType): Promise<boolean>
  protected abstract doInitialize(): Promise<this>
  protected abstract doDestroy(): Promise<void>

  // ─── Lifecycle hooks ────────────────────────────────────────────────────────

  protected async performInitialize(): Promise<void> {
    await this.doInitialize()
    this._stateCache = await this.getRawState()
  }

  protected async performCleanup(): Promise<void> {
    // Обходим публичный clear() (избегая ensureReady после _isDestroyed = true)
    await this.pluginExecutor?.executeOnClear()
    await this.doClear()

    await this.doDestroy()

    if (this.initializedMiddlewares) {
      await Promise.all(
        this.initializedMiddlewares.map(async (middleware) => {
          if ('cleanup' in middleware) {
            await middleware.cleanup?.()
          }
        }),
      )
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

  protected getDefaultMiddleware(): AsyncDefaultMiddlewares {
    return {
      batching: (options = {}) => batchingMiddleware(options),
      shallowCompare: (options = {}) => shallowCompareMiddleware(options),
    }
  }

  protected async initializeWithMiddlewares(): Promise<void> {
    try {
      const state = await this.getRawState()
      const hasExistingState = Object.keys(state).length > 0

      if (!hasExistingState && this.config.initialState) {
        await this.middlewareModule.dispatch({
          type: 'init',
          value: this.config.initialState,
        })
      }
    } catch (error) {
      this.logger?.error('Ошибка инициализации хранилища', { error })
      throw error
    }
  }

  // ─── Internal state access ──────────────────────────────────────────────────

  private async getRawState(): Promise<T> {
    try {
      const value = await this.doGet('')
      return value || {}
    } catch (error) {
      this.logger?.error('Error getting state', { error })
      throw error
    }
  }

  // ─── Public async API ───────────────────────────────────────────────────────

  public async get<R>(key: StorageKeyType): Promise<R | undefined> {
    this.ensureReady()

    try {
      const metadata = { operation: 'get', timestamp: Date.now(), key }

      const middlewareResult = await this.middlewareModule.dispatch({
        type: 'get',
        key,
        metadata,
      })

      const finalResult = (await this.pluginExecutor?.executeAfterGet(key, middlewareResult, metadata)) ?? middlewareResult

      await this.emitEvent({
        type: StorageEvents.STORAGE_SELECT,
        payload: { key, value: finalResult },
      })

      return finalResult
    } catch (error) {
      this.logger?.error('Error getting value', { key, error })
      throw error
    }
  }

  public async set<R>(key: StorageKeyType, value: R): Promise<void> {
    this.ensureReady()

    try {
      const metadata = { operation: 'set', timestamp: Date.now(), key }

      const processedValue = (await this.pluginExecutor?.executeBeforeSet(value, metadata)) ?? value

      const middlewareResult = await this.middlewareModule.dispatch({
        type: 'set',
        key,
        value: processedValue,
        metadata,
      })

      if (middlewareResult === VALUE_NOT_CHANGED) return

      const finalResult = (await this.pluginExecutor?.executeAfterSet(key, middlewareResult, metadata)) ?? middlewareResult

      this._stateCache = await this.getRawState()

      const keyStr = key.toString()
      const changedPaths = [keyStr]

      this.notifySubscribers(key, finalResult)

      this.notifySubscribers(GLOBAL_SUBSCRIPTION_KEY, {
        type: StorageEvents.STORAGE_UPDATE,
        key,
        value: finalResult,
        changedPaths,
      })

      await this.emitEvent({
        type: StorageEvents.STORAGE_UPDATE,
        payload: { key, value: finalResult, changedPaths },
      })
    } catch (error) {
      this.logger?.error('Error setting value', { key, error })
      throw error
    }
  }

  public async update(updater: (state: T) => void): Promise<void> {
    this.ensureReady()

    try {
      const metadata = { operation: 'update', timestamp: Date.now() }

      const currentState = (await this.getState()) as T
      const newState = createLazyClone(currentState)
      updater(newState)

      const changedPaths = findChangedPaths(currentState, newState)

      if (changedPaths.size === 0) {
        if (this.logger?.debug) {
          this.logger.debug('No changes detected in update')
        }
        return
      }

      if (this.logger?.debug) {
        this.logger.debug('Changed paths:', { paths: Array.from(changedPaths) })
      }

      const changedTopLevelKeys = new Set<string>()
      for (const path of changedPaths) {
        changedTopLevelKeys.add(path.split('.')[0])
      }

      const updates = await Promise.all(
        Array.from(changedTopLevelKeys).map(async (key: string) => {
          const keyMetadata = { ...metadata, key }
          const processedValue = (await this.pluginExecutor?.executeBeforeSet(newState[key], keyMetadata)) ?? newState[key]
          return { key, value: processedValue }
        }),
      )

      const result = await this.middlewareModule.dispatch({
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
        if (this.logger?.debug) {
          this.logger.debug('No actual changes after middleware processing')
        }
        return
      }

      const finalUpdates: Record<string, any> = {}
      actuallyChangedKeys.forEach((key) => {
        finalUpdates[key] = updatedValues[key]
      })

      if (this.logger?.debug) {
        this.logger.debug('Notifying subscribers about changes:', { keys: actuallyChangedKeys })
      }

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

      await this.emitEvent({
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

  public async remove(key: StorageKeyType): Promise<void> {
    this.ensureReady()

    try {
      const metadata = { operation: 'delete', timestamp: Date.now(), key }

      const preventDeletion = await this.pluginExecutor?.executeBeforeDelete(key, metadata)
      if (preventDeletion === false) return

      const middlewareResult = await this.middlewareModule.dispatch({
        type: 'delete',
        key,
        metadata,
      })

      if (middlewareResult === false) return

      await this.pluginExecutor?.executeAfterDelete(key, metadata)

      this._stateCache = await this.getRawState()

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

      await this.emitEvent({
        type: StorageEvents.STORAGE_UPDATE,
        payload: { key, value: undefined, result: middlewareResult, changedPaths },
      })
    } catch (error) {
      this.logger?.error('Error deleting value', { key, error })
      throw error
    }
  }

  public async clear(): Promise<void> {
    this.ensureReady()

    try {
      await this.pluginExecutor?.executeOnClear()

      await this.middlewareModule.dispatch({ type: 'clear' })

      this._stateCache = {} as T
    } catch (error) {
      this.logger?.error('Error clearing storage', { error })
      throw error
    }
  }

  public async reset(): Promise<void> {
    this.ensureReady()

    try {
      const initialState = this.config.initialState

      await this.middlewareModule.dispatch({
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

  public async keys(): Promise<string[]> {
    this.ensureReady()

    try {
      return await this.middlewareModule.dispatch({ type: 'keys' })
    } catch (error) {
      this.logger?.error('Error getting keys', { error })
      throw error
    }
  }

  public async has(key: StorageKeyType): Promise<boolean> {
    this.ensureReady()
    try {
      return await this.doHas(key)
    } catch (error) {
      this.logger?.error('Error checking value existence', { key, error })
      throw error
    }
  }

  public async getState(): Promise<T> {
    this.ensureReady()
    return this.getRawState()
  }

  // ─── Subscriptions (async — with race condition protection) ────────────────

  protected subscribeByKey(key: string, callback: (value: any) => void): VoidFunction {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }
    this.subscribers.get(key)!.add(callback)

    // Запоминаем версию ключа до асинхронного get().
    // Если между вызовом get() и его разрешением произойдёт set(),
    // версия увеличится и мы не отправим устаревшее начальное значение.
    const versionAtSubscribe = this.keyVersions.get(key) ?? 0

    this.get(key).then((value) => {
      try {
        const currentVersion = this.keyVersions.get(key) ?? 0
        if (currentVersion === versionAtSubscribe) {
          callback(value)
        }
      } catch (error) {
        this.logger?.error('Error in initial callback', { key, error })
      }
    })

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

    if (this.logger?.debug) {
      this.logger.debug('Subscribing to path:', { path: fullPath })
    }

    const wrappedCallback = async (value: any) => {
      try {
        if (value === undefined || value === null) {
          const currentState = (await this.getState()) as T
          const selectedValue = pathSelector(currentState)
          callback(selectedValue as R)
          return
        }

        if (typeof value !== 'object' || value === null) {
          callback(value as R)
          return
        }

        const currentState = (await this.getState()) as T
        const selectedValue = pathSelector(currentState)
        callback(selectedValue as R)
      } catch (error) {
        this.logger?.error('Error in selector callback', { path: fullPath, error })
        callback(value as R)
      }
    }

    if (!fullPath) {
      return this.subscribeToAll(() => {
        this.getState().then((state) => {
          callback(pathSelector(state as T))
        })
      })
    }

    return this.subscribeByKey(fullPath, wrappedCallback)
  }
}
