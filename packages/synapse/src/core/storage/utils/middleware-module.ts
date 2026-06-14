import { handleOperationError } from '../../../_utils/error-handling.util'
import { StorageKeyType } from './storage-key'

/**
 * Sentinel object returned by middleware to signal that the value has not changed.
 * BaseStorage checks for this by reference equality to skip subscriber notifications.
 */
export const VALUE_NOT_CHANGED: unique symbol = Symbol('VALUE_NOT_CHANGED')

export type StorageActionType = 'get' | 'set' | 'delete' | 'clear' | 'init' | 'keys' | 'update' | 'reset'

export type StorageAction = {
  type: StorageActionType
  key?: StorageKeyType
  value?: any
  metadata?: Record<string, any>
  source?: string
  timestamp?: number
}

// ─── Async Middleware Types ────────────────────────────────────────────────────

export type MiddlewareAPI = {
  dispatch: (action: StorageAction) => Promise<any>
  getState: () => Promise<Record<string, any>>
  storage: {
    doGet: (key: StorageKeyType) => Promise<any>
    doSet: (key: StorageKeyType, value: any) => Promise<void>
    doUpdate: (updates: Array<{ key: StorageKeyType; value: any }>) => Promise<void>
    doDelete: (key: StorageKeyType) => Promise<boolean>
    doClear: () => Promise<void>
    doKeys: () => Promise<string[]>
    notifySubscribers: (key: StorageKeyType, value: any) => void
  }
}

export type NextFunction = (action: StorageAction) => Promise<any>

export type SetupEventsFunction = (api: MiddlewareAPI) => void

export type Middleware = {
  name: string
  setup?: SetupEventsFunction
  cleanup?: () => Promise<void> | void
  reducer: (api: MiddlewareAPI) => (next: NextFunction) => (action: StorageAction) => Promise<any>
}

// Алиасы для явного разделения
export type AsyncMiddlewareAPI = MiddlewareAPI
export type AsyncNextFunction = NextFunction
export type AsyncMiddleware = Middleware

// ─── Sync Middleware Types ─────────────────────────────────────────────────────

export type SyncMiddlewareAPI = {
  dispatch: (action: StorageAction) => any
  getState: () => Record<string, any>
  storage: {
    doGet: (key: StorageKeyType) => any
    doSet: (key: StorageKeyType, value: any) => void
    doUpdate: (updates: Array<{ key: StorageKeyType; value: any }>) => void
    doRemove: (key: StorageKeyType) => boolean
    doClear: () => void
    doKeys: () => string[]
    notifySubscribers: (key: StorageKeyType, value: any) => void
  }
}

export type SyncNextFunction = (action: StorageAction) => any

export type SyncSetupEventsFunction = (api: SyncMiddlewareAPI) => void

export type SyncMiddleware = {
  name: string
  setup?: SyncSetupEventsFunction
  cleanup?: () => void
  reducer: (api: SyncMiddlewareAPI) => (next: SyncNextFunction) => (action: StorageAction) => any
}

// ─── Async Middleware Module ───────────────────────────────────────────────────

export class AsyncMiddlewareModule {
  private middlewares: Middleware[] = []

  private api: MiddlewareAPI

  private initialized = false

  private dispatchFn!: (action: StorageAction) => Promise<any>

  constructor(storage: any) {
    this.api = {
      dispatch: async (action: StorageAction) => this.dispatch(action),
      getState: () => storage.getState(),
      storage: {
        doGet: storage.doGet.bind(storage),
        doSet: storage.doSet.bind(storage),
        doUpdate: storage.doUpdate.bind(storage),
        doDelete: storage.doDelete.bind(storage),
        doClear: storage.doClear.bind(storage),
        doKeys: storage.doKeys.bind(storage),
        notifySubscribers: storage.notifySubscribers.bind(storage),
      },
    }
  }

  private async baseOperation(action: StorageAction): Promise<any> {
    switch (action.type) {
      case 'get': {
        return this.api.storage.doGet(action.key!)
      }

      case 'set': {
        await this.api.storage.doSet(action.key!, action.value)
        return this.api.storage.doGet(action.key!)
      }

      case 'update': {
        if (Array.isArray(action.value)) {
          await this.api.storage.doUpdate(action.value)
          return this.api.storage.doGet('')
        }
        return action.value
      }

      case 'delete': {
        return this.api.storage.doDelete(action.key!)
      }

      case 'clear': {
        return this.api.storage.doClear()
      }

      case 'reset': {
        if (action.value) {
          await this.api.storage.doClear()
          await this.api.storage.doSet('', action.value)
          return this.api.storage.doGet('')
        }
        return this.api.storage.doClear()
      }

      case 'init': {
        const currentState = await this.api.storage.doGet('')
        if (Object.keys(currentState || {}).length > 0) {
          return currentState
        }
        if (action.value) {
          await this.api.storage.doSet('', action.value)
          return this.api.storage.doGet('')
        }
        return currentState
      }

      case 'keys': {
        return this.api.storage.doKeys()
      }

      default: {
        throw new Error(`Unknown action type: ${action.type}`)
      }
    }
  }

  private initializeMiddlewares() {
    if (this.initialized) return

    let chain = this.baseOperation.bind(this)

    for (const middleware of [...this.middlewares].reverse()) {
      const nextChain = chain
      chain = async (action) => {
        const actionWithMeta = {
          ...action,
          metadata: {
            ...action.metadata,
            timestamp: action.metadata?.timestamp || Date.now(),
          },
        }

        return middleware.reducer(this.api)(nextChain)(actionWithMeta)
      }
    }

    this.dispatchFn = chain
    this.initialized = true
  }

  use(middleware: Middleware): void {
    if (middleware.setup) {
      middleware.setup(this.api)
    }

    this.middlewares.push(middleware)
    this.initialized = false
  }

  async dispatch(action: StorageAction): Promise<any> {
    if (!this.initialized) {
      this.initializeMiddlewares()
    }

    try {
      return await this.dispatchFn(action)
    } catch (error) {
      handleOperationError('AsyncMiddlewareModule: error in middleware chain', error)
    }
  }
}

/** @deprecated Use AsyncMiddlewareModule */
export class MiddlewareModule extends AsyncMiddlewareModule {}

// ─── Sync Middleware Module ────────────────────────────────────────────────────

export class SyncMiddlewareModule {
  private middlewares: SyncMiddleware[] = []

  private api: SyncMiddlewareAPI

  private initialized = false

  private dispatchFn!: (action: StorageAction) => any

  constructor(storage: any) {
    this.api = {
      dispatch: (action: StorageAction) => this.dispatch(action),
      getState: () => storage.getState(),
      storage: {
        doGet: storage.doGet.bind(storage),
        doSet: storage.doSet.bind(storage),
        doUpdate: storage.doUpdate.bind(storage),
        doRemove: storage.doRemove.bind(storage),
        doClear: storage.doClear.bind(storage),
        doKeys: storage.doKeys.bind(storage),
        notifySubscribers: storage.notifySubscribers.bind(storage),
      },
    }
  }

  private baseOperation(action: StorageAction): any {
    switch (action.type) {
      case 'get': {
        return this.api.storage.doGet(action.key!)
      }

      case 'set': {
        this.api.storage.doSet(action.key!, action.value)
        return this.api.storage.doGet(action.key!)
      }

      case 'update': {
        if (Array.isArray(action.value)) {
          this.api.storage.doUpdate(action.value)
          return this.api.storage.doGet('')
        }
        return action.value
      }

      case 'delete': {
        return this.api.storage.doRemove(action.key!)
      }

      case 'clear': {
        return this.api.storage.doClear()
      }

      case 'reset': {
        if (action.value) {
          this.api.storage.doClear()
          this.api.storage.doSet('', action.value)
          return this.api.storage.doGet('')
        }
        return this.api.storage.doClear()
      }

      case 'init': {
        const currentState = this.api.storage.doGet('')
        if (Object.keys(currentState || {}).length > 0) {
          return currentState
        }
        if (action.value) {
          this.api.storage.doSet('', action.value)
          return this.api.storage.doGet('')
        }
        return currentState
      }

      case 'keys': {
        return this.api.storage.doKeys()
      }

      default: {
        throw new Error(`Unknown action type: ${action.type}`)
      }
    }
  }

  private initializeMiddlewares() {
    if (this.initialized) return

    let chain = this.baseOperation.bind(this)

    for (const middleware of [...this.middlewares].reverse()) {
      const nextChain = chain
      chain = (action) => {
        const actionWithMeta = {
          ...action,
          metadata: {
            ...action.metadata,
            timestamp: action.metadata?.timestamp || Date.now(),
          },
        }

        return middleware.reducer(this.api)(nextChain)(actionWithMeta)
      }
    }

    this.dispatchFn = chain
    this.initialized = true
  }

  use(middleware: SyncMiddleware): void {
    if (middleware.setup) {
      middleware.setup(this.api)
    }

    this.middlewares.push(middleware)
    this.initialized = false
  }

  dispatch(action: StorageAction): any {
    if (!this.initialized) {
      this.initializeMiddlewares()
    }

    try {
      return this.dispatchFn(action)
    } catch (error) {
      handleOperationError('SyncMiddlewareModule: error in middleware chain', error)
    }
  }
}
