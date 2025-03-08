import { BatchProcessor } from '../utils/batch.utils'
import { Middleware, MiddlewareAPI, NextFunction, StorageAction } from '../utils/middleware-module'

export interface BatchingMiddlewareOptions {
  batchSize?: number
  batchDelay?: number
  segments?: string[]
}

export const batchingMiddleware = (options: BatchingMiddlewareOptions = {}): Middleware => {
  const batchProcessor = new BatchProcessor<StorageAction>({
    batchSize: options.batchSize,
    batchDelay: options.batchDelay,
    shouldBatch: (action) => {
      if (action.type === 'get' || action.type === 'keys') return false
      if (options.segments?.length) {
        return options.segments.includes(action.metadata?.segment ?? 'default')
      }
      return true
    },
    getSegmentKey: (action) => action.key || 'default',
    mergeItems: (actions) =>
      actions.reduce((acc, action) => {
        if (action.type === 'set') {
          const existingIndex = acc.findIndex((existing) => existing.type === 'set' && existing.key === action.key)
          if (existingIndex !== -1) {
            acc[existingIndex] = action
          } else {
            acc.push(action)
          }
        } else {
          acc.push(action)
        }
        return acc
      }, [] as StorageAction[]),
  })

  return {
    name: 'batching',
    setup: () => {},
    reducer: (api: MiddlewareAPI) => (next: NextFunction) => (action: StorageAction) => batchProcessor.add(action, () => next(action)),
  }
}
