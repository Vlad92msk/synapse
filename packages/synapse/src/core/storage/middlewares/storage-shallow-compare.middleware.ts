import { Middleware, MiddlewareAPI, NextFunction, StorageAction, VALUE_NOT_CHANGED } from '../utils/middleware-module'
import { shallowEqual } from '../utils/state-diff.util'
import { StorageKeyType } from '../utils/storage-key'

export interface ShallowCompareMiddlewareOptions {
  segments?: string[]
  comparator?: <T>(prev: T, next: T) => boolean
}

export const shallowCompareMiddleware = (options: ShallowCompareMiddlewareOptions = {}): Middleware => {
  const { comparator = shallowEqual, segments = [] } = options

  // Кэш последних значений
  const valueCache = new Map<StorageKeyType, any>()

  return {
    name: 'shallow-compare',
    setup: (api: MiddlewareAPI) => {},
    reducer: (api: MiddlewareAPI) => (next: NextFunction) => async (action: StorageAction) => {
      // Пропускаем действия кроме set
      if (action.type !== 'set' || (segments.length && !segments.includes(action.metadata?.segment ?? 'default'))) {
        return next(action)
      }

      const cacheKey = action.key!
      const prevValue = valueCache.get(cacheKey)
      const nextValue = action.value

      // Если значения равны, возвращаем sentinel — не модифицируем значение
      if (prevValue !== undefined && comparator(prevValue, nextValue)) {
        return VALUE_NOT_CHANGED
      }

      // Иначе обновляем кэш и продолжаем
      const result = await next(action)
      valueCache.set(cacheKey, result !== undefined ? result : nextValue)
      return result
    },
  }
}
