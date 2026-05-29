import { StorageAction, SyncMiddleware, SyncMiddlewareAPI, SyncNextFunction } from '../utils/middleware-module'

export interface SyncBatchingMiddlewareOptions {
  batchSize?: number
}

export const syncBatchingMiddleware = (options: SyncBatchingMiddlewareOptions = {}): SyncMiddleware => {
  const batchSize = options.batchSize ?? 10

  let queue: StorageAction[] = []
  let scheduled = false

  const shouldBatch = (action: StorageAction): boolean => {
    return action.type === 'set' || action.type === 'update'
  }

  const mergeActions = (actions: StorageAction[]): StorageAction[] => {
    const merged = new Map<string, StorageAction>()

    for (const action of actions) {
      const key = `${action.type}_${action.key?.toString() || 'default'}`
      merged.set(key, action)
    }

    return Array.from(merged.values())
  }

  const flushQueue = (api: SyncMiddlewareAPI, next: SyncNextFunction): void => {
    if (queue.length === 0) return

    const batch = queue.splice(0)
    const mergedActions = mergeActions(batch)

    for (const action of mergedActions) {
      next(action)
    }
  }

  return {
    name: 'sync-batching',
    setup: () => {},
    cleanup: () => {
      queue = []
      scheduled = false
    },
    reducer: (api: SyncMiddlewareAPI) => (next: SyncNextFunction) => (action: StorageAction) => {
      if (!shouldBatch(action)) {
        return next(action)
      }

      queue.push(action)

      if (queue.length >= batchSize) {
        flushQueue(api, next)
      } else if (!scheduled) {
        scheduled = true
        queueMicrotask(() => {
          scheduled = false
          flushQueue(api, next)
        })
      }

      // Возвращаем текущее значение из кеша (операция ещё не выполнена если в очереди)
      if (action.type === 'set' && action.key) {
        return action.value
      }
      return undefined
    },
  }
}
