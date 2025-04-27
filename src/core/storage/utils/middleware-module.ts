import { StorageKeyType } from './storage-key'

export type StorageActionType = 'get' | 'set' | 'delete' | 'clear' | 'init' | 'keys' | 'update'

export type StorageAction = {
  type: StorageActionType
  key?: StorageKeyType
  value?: any
  metadata?: Record<string, any>
  source?: string
  timestamp?: number
}

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

export class MiddlewareModule {
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
    // Деструктурируем с подчеркиванием для неиспользуемых переменных
    const { processed: _, ...metadata } = action.metadata || {}
    const cleanAction = { ...action, metadata }

    switch (cleanAction.type) {
      case 'get': {
        return this.api.storage.doGet(cleanAction.key!)
      }

      case 'set': {
        await this.api.storage.doSet(cleanAction.key!, cleanAction.value)
        return this.api.storage.doGet(cleanAction.key!)
      }

      case 'update': {
        if (Array.isArray(cleanAction.value)) {
          await this.api.storage.doUpdate(cleanAction.value)
          return this.api.storage.doGet('')
        }
        return cleanAction.value
      }

      case 'delete': {
        return this.api.storage.doDelete(cleanAction.key!)
      }

      case 'clear': {
        return this.api.storage.doClear()
      }

      case 'init': {
        const currentState = await this.api.storage.doGet('')
        if (Object.keys(currentState || {}).length > 0) {
          return currentState
        }
        if (cleanAction.value) {
          await this.api.storage.doSet('', cleanAction.value)
          return this.api.storage.doGet('')
        }
        return currentState
      }

      case 'keys': {
        return this.api.storage.doKeys()
      }

      default: {
        throw new Error(`Unknown action type: ${cleanAction.type}`)
      }
    }
  }

  private initializeMiddlewares() {
    if (this.initialized) return

    let chain = this.baseOperation.bind(this)

    for (const middleware of [...this.middlewares].reverse()) {
      const nextChain = chain
      chain = async (action) => {
        if (action.metadata?.processed) {
          return nextChain(action)
        }

        const actionWithMeta = {
          ...action,
          metadata: {
            ...action.metadata,
            processed: true,
            timestamp: action.metadata?.timestamp || Date.now(),
          },
        }

        return middleware.reducer(this.api)(nextChain)(actionWithMeta)
      }
    }

    this.dispatchFn = chain // Используем новое имя
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
      return this.dispatchFn(action)
    } catch (error) {
      console.error('Error in middleware chain:', error)
      throw error
    }
  }
}
