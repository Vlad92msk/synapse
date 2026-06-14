import { useCallback, useEffect, useRef, useState } from 'react'

import { handleCleanupError } from '../../_utils/error-handling.util'
import { IAsyncStorage, IEventEmitter, ILogger, IStorage, ISyncStorage, StorageFactory, StorageInitStatus, StorageStatus, UniversalStorageConfig } from '../../core'

export interface UseSynapseStorageOptions {
  /**
   * Автоматически инициализировать при монтировании
   */
  autoInitialize?: boolean
  /**
   * Уничтожать storage при размонтировании
   */
  destroyOnUnmount?: boolean
}

export type UseSynapseStorageReturn<S> =
  | {
      storage: S
      status: StorageInitStatus
      initialize: () => Promise<void>
      destroy: () => Promise<void>
      isReady: true
      isLoading: false
      hasError: false
    }
  | {
      storage: null
      status: StorageInitStatus
      initialize: () => Promise<void>
      destroy: () => Promise<void>
      isReady: false
      isLoading: boolean
      hasError: boolean
    }

// ─── Перегрузки ─────────────────────────────────────────────────────────────

export function useCreateStorage<T extends Record<string, any>>(
  config: UniversalStorageConfig<T> & { type: 'memory' },
  options?: UseSynapseStorageOptions,
  eventEmitter?: IEventEmitter,
  logger?: ILogger,
): UseSynapseStorageReturn<ISyncStorage<T>>

export function useCreateStorage<T extends Record<string, any>>(
  config: UniversalStorageConfig<T> & { type: 'localStorage' },
  options?: UseSynapseStorageOptions,
  eventEmitter?: IEventEmitter,
  logger?: ILogger,
): UseSynapseStorageReturn<ISyncStorage<T>>

export function useCreateStorage<T extends Record<string, any>>(
  config: UniversalStorageConfig<T> & { type: 'indexedDB' },
  options?: UseSynapseStorageOptions,
  eventEmitter?: IEventEmitter,
  logger?: ILogger,
): UseSynapseStorageReturn<IAsyncStorage<T>>

export function useCreateStorage<T extends Record<string, any>>(
  config: UniversalStorageConfig<T>,
  options?: UseSynapseStorageOptions,
  eventEmitter?: IEventEmitter,
  logger?: ILogger,
): UseSynapseStorageReturn<IStorage<T>>

// ─── Реализация ─────────────────────────────────────────────────────────────

export function useCreateStorage<T extends Record<string, any>>(
  config: UniversalStorageConfig<T>,
  options: UseSynapseStorageOptions = {},
  eventEmitter?: IEventEmitter,
  logger?: ILogger,
): UseSynapseStorageReturn<IStorage<T>> {
  const destroyDefault = config.type === 'indexedDB' ? false : true
  const { autoInitialize = true, destroyOnUnmount = destroyDefault } = options

  const [status, setStatus] = useState<StorageInitStatus>({
    status: StorageStatus.IDLE,
  })

  const [storage] = useState<IStorage<T> | null>(() => {
    try {
      return StorageFactory.create<T>(config, eventEmitter, logger)
    } catch (error) {
      setStatus({
        status: StorageStatus.ERROR,
        error: error as Error,
      })
      return null
    }
  })

  const destroyOnUnmountRef = useRef(destroyOnUnmount)
  destroyOnUnmountRef.current = destroyOnUnmount

  const initialize = useCallback(async () => {
    if (!storage) return

    try {
      setStatus({ status: StorageStatus.LOADING })
      await storage.initialize()
      setStatus({ status: StorageStatus.READY })
    } catch (error) {
      setStatus({
        status: StorageStatus.ERROR,
        error: error as Error,
      })
    }
  }, [storage])

  const destroy = useCallback(async () => {
    if (!storage) return

    try {
      await storage.destroy()
      setStatus({ status: StorageStatus.IDLE })
    } catch (error) {
      setStatus({
        status: StorageStatus.ERROR,
        error: error as Error,
      })
    }
  }, [storage])

  useEffect(() => {
    if (!storage) return

    const unsubscribe = storage.onStatusChange((newStatus) => {
      setStatus(newStatus)
    })

    return unsubscribe
  }, [storage])

  // Автоматическая инициализация
  useEffect(() => {
    let cancelled = false

    if (autoInitialize && storage && status.status === StorageStatus.IDLE) {
      setStatus({ status: StorageStatus.LOADING })
      storage
        .initialize()
        .then(() => {
          if (!cancelled) setStatus({ status: StorageStatus.READY })
        })
        .catch((error) => {
          if (!cancelled) setStatus({ status: StorageStatus.ERROR, error: error as Error })
        })
    }

    return () => {
      cancelled = true
    }
  }, [autoInitialize, storage, status.status])

  useEffect(() => {
    return () => {
      if (destroyOnUnmountRef.current && storage) {
        storage.destroy().catch((err) => handleCleanupError('useCreateStorage: error during unmount destroy', err))
      }
    }
  }, [storage])

  const isReady = status.status === StorageStatus.READY
  const isLoading = status.status === StorageStatus.LOADING
  const hasError = status.status === StorageStatus.ERROR

  if (isReady && storage) {
    return {
      storage,
      status,
      initialize,
      destroy,
      isReady: true as const,
      isLoading: false as const,
      hasError: false as const,
    }
  }

  return {
    storage: null,
    status,
    initialize,
    destroy,
    isReady: false as const,
    isLoading,
    hasError,
  }
}
