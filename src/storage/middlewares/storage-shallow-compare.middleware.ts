import { Middleware, MiddlewareAPI, NextFunction, StorageAction } from '../utils/middleware-module'
import { StorageKey } from '../utils/storage-key'

export interface ShallowCompareMiddlewareOptions {
  segments?: string[]
  comparator?: <T>(prev: T, next: T) => boolean
}

export const shallowCompareMiddleware = (options: ShallowCompareMiddlewareOptions = {}): Middleware => {
  const {
    comparator = (prev: any, next: any) => {
      if (prev === next) return true

      if (typeof prev !== 'object' || typeof next !== 'object' || prev === null || next === null) {
        return prev === next
      }

      const keysA = Object.keys(prev)
      const keysB = Object.keys(next)

      if (keysA.length !== keysB.length) return false

      return keysA.every((key) => Object.prototype.hasOwnProperty.call(next, key) && prev[key] === next[key])
    },
    segments = [],
  } = options

  // Кэш последних значений
  const valueCache = new Map<string | StorageKey, any>()

  return {
    name: 'shallow-compare',
    setup: (api: MiddlewareAPI) => {},
    reducer: (api: MiddlewareAPI) => (next: NextFunction) => async (action: StorageAction) => {
      if (action.type !== 'set' || (segments.length && !segments.includes(action.metadata?.segment ?? 'default'))) {
        return next(action)
      }

      const cacheKey = action.key!
      const prevValue = valueCache.get(cacheKey)
      const nextValue = action.value

      // Если значения равны, пропускаем операцию
      if (prevValue !== undefined && comparator(prevValue, nextValue)) {
        return prevValue
      }

      // Иначе обновляем кэш и продолжаем
      const result = await next(action)
      valueCache.set(cacheKey, nextValue)
      return result
    },
  }
}
