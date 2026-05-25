// storage-batching.middleware.ts - ИСПРАВЛЕННАЯ ВЕРСИЯ
import { Middleware, MiddlewareAPI, NextFunction, StorageAction } from '../utils/middleware-module'

export interface BatchingMiddlewareOptions {
  batchSize?: number
  batchDelay?: number
}

interface BatchItem {
  action: StorageAction
  resolve: (value: any) => void
  reject: (error: any) => void
  timestamp: number
}

export const batchingMiddleware = (options: BatchingMiddlewareOptions = {}): Middleware => {
  const batchSize = options.batchSize ?? 10
  const batchDelay = options.batchDelay ?? 10 // Уменьшил для более быстрого батчинга

  const queues = new Map<string, BatchItem[]>()
  const timeouts = new Map<string, NodeJS.Timeout>()

  const shouldBatch = (action: StorageAction): boolean => {
    return action.type === 'set' || action.type === 'update'
  }

  const getSegmentKey = (action: StorageAction): string => {
    return `${action.type}_${action.key?.toString() || 'default'}`
  }

  const mergeActions = (actions: StorageAction[]): StorageAction[] => {
    const merged = new Map<string, StorageAction>()

    // Группируем по ключу и оставляем только последнее значение
    for (const action of actions) {
      const key = `${action.type}_${action.key?.toString() || 'default'}`
      merged.set(key, action) // Последнее действие перезаписывает предыдущие
    }

    return Array.from(merged.values())
  }

  const clearTimeout = (segment: string): void => {
    const timeout = timeouts.get(segment)
    if (timeout) {
      globalThis.clearTimeout(timeout)
      timeouts.delete(segment)
    }
  }

  const setTimeout = (segment: string, callback: () => void): void => {
    const timeout = globalThis.setTimeout(callback, batchDelay)
    timeouts.set(segment, timeout)
  }

  const processBatch = async (segment: string, api: MiddlewareAPI, next: NextFunction): Promise<void> => {
    const queue = queues.get(segment)
    if (!queue || queue.length === 0) return

    // Очищаем очередь и таймер
    queues.delete(segment)
    clearTimeout(segment)

    try {
      // Объединяем действия
      const actions = queue.map((item) => item.action)
      const mergedActions = mergeActions(actions)

      // Выполняем только merged actions
      for (const mergedAction of mergedActions) {
        try {
          // Выполняем merged действие
          const result = await next(mergedAction)

          // Находим все queue items, которые соответствуют этому merged action
          const matchingItems = queue.filter((item) => item.action.type === mergedAction.type && item.action.key?.toString() === mergedAction.key?.toString())

          // Все соответствующие items получают результат merged операции
          matchingItems.forEach((item) => item.resolve(result))
        } catch (error) {
          // В случае ошибки отклоняем соответствующие промисы
          const matchingItems = queue.filter((item) => item.action.type === mergedAction.type && item.action.key?.toString() === mergedAction.key?.toString())
          matchingItems.forEach((item) => item.reject(error))
        }
      }
    } catch (error) {
      // В случае общей ошибки отклоняем все промисы
      queue.forEach((item) => item.reject(error))
    }
  }

  const addToQueue = async (action: StorageAction, api: MiddlewareAPI, next: NextFunction): Promise<any> => {
    return new Promise((resolve, reject) => {
      const segment = getSegmentKey(action)

      let queue = queues.get(segment)
      if (!queue) {
        queue = []
        queues.set(segment, queue)
      }

      queue.push({
        action,
        resolve,
        reject,
        timestamp: Date.now(),
      })

      clearTimeout(segment)

      if (queue.length >= batchSize) {
        // Немедленно обрабатываем батч
        queueMicrotask(() => processBatch(segment, api, next))
      } else {
        // Устанавливаем таймер
        setTimeout(segment, () => processBatch(segment, api, next))
      }
    })
  }

  return {
    name: 'batching',
    setup: () => {},
    cleanup: async () => {
      // Очищаем таймеры
      timeouts.forEach((timeout) => globalThis.clearTimeout(timeout))
      timeouts.clear()
      queues.clear()
    },
    reducer: (api: MiddlewareAPI) => (next: NextFunction) => async (action: StorageAction) => {
      if (!shouldBatch(action)) {
        return next(action)
      }

      return addToQueue(action, api, next)
    },
  }
}
