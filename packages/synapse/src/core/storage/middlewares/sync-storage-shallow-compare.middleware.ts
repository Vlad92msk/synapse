import { StorageAction, SyncMiddleware, SyncMiddlewareAPI, SyncNextFunction, VALUE_NOT_CHANGED } from '../utils/middleware-module'
import { shallowEqual } from '../utils/state-diff.util'
import { StorageKeyType } from '../utils/storage-key'

export interface SyncShallowCompareMiddlewareOptions {
  segments?: string[]
  comparator?: <T>(prev: T, next: T) => boolean
}

export const syncShallowCompareMiddleware = (options: SyncShallowCompareMiddlewareOptions = {}): SyncMiddleware => {
  const { comparator = shallowEqual, segments = [] } = options

  const valueCache = new Map<StorageKeyType, any>()

  return {
    name: 'sync-shallow-compare',
    setup: () => {},
    reducer: (_api: SyncMiddlewareAPI) => (next: SyncNextFunction) => (action: StorageAction) => {
      if (action.type !== 'set' || (segments.length && !segments.includes(action.metadata?.segment ?? 'default'))) {
        return next(action)
      }

      const cacheKey = action.key!
      const prevValue = valueCache.get(cacheKey)
      const nextValue = action.value

      if (prevValue !== undefined && comparator(prevValue, nextValue)) {
        return VALUE_NOT_CHANGED
      }

      const result = next(action)
      valueCache.set(cacheKey, result !== undefined ? result : nextValue)
      return result
    },
  }
}
