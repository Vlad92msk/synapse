import { useCallback, useEffect, useState } from 'react'

import { IStorageBase, StorageInitStatus, StorageStatus } from '../../core'

export interface UseStorageOptions {
  /**
   * Автоматически инициализировать при монтировании (по умолчанию true)
   */
  autoInitialize?: boolean
}

export type UseStorageReturn<S> =
  | {
      storage: S
      status: StorageInitStatus
      initialize: () => Promise<void>
      isReady: true
      isLoading: false
      hasError: false
    }
  | {
      storage: S
      status: StorageInitStatus
      initialize: () => Promise<void>
      isReady: false
      isLoading: boolean
      hasError: boolean
    }

/**
 * Хук для управления lifecycle внешнего хранилища.
 *
 * В отличие от useCreateStorage, не создаёт и не уничтожает хранилище —
 * только инициализирует и отслеживает статус.
 *
 * Предназначен для хранилищ, созданных вне компонентов (на уровне модуля):
 * ```ts
 * // stores.ts
 * export const todoStorage = new IndexedDBStorage({ name: 'todos', ... })
 *
 * // Component.tsx
 * const { isReady } = useStorage(todoStorage)
 * ```
 */
export function useStorage<S extends IStorageBase<any>>(storage: S, options: UseStorageOptions = {}): UseStorageReturn<S> {
  const { autoInitialize = true } = options

  const [status, setStatus] = useState<StorageInitStatus>({ status: StorageStatus.IDLE })

  const initialize = useCallback(async () => {
    try {
      await storage.initialize()
    } catch {
      // Ошибка будет отражена через onStatusChange
    }
  }, [storage])

  // Подписка на изменения статуса
  useEffect(() => {
    return storage.onStatusChange(setStatus)
  }, [storage])

  // Автоинициализация
  useEffect(() => {
    if (autoInitialize && status.status === StorageStatus.IDLE) {
      initialize()
    }
  }, [autoInitialize, storage, status.status, initialize])

  const isReady = status.status === StorageStatus.READY
  const isLoading = status.status === StorageStatus.LOADING
  const hasError = status.status === StorageStatus.ERROR

  if (isReady) {
    return {
      storage,
      status,
      initialize,
      isReady: true as const,
      isLoading: false as const,
      hasError: false as const,
    }
  }

  return {
    storage,
    status,
    initialize,
    isReady: false as const,
    isLoading,
    hasError,
  }
}
