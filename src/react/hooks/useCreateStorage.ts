import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { IEventEmitter, ILogger, IPluginExecutor, IStorage, StorageFactory, StorageInitStatus, StorageStatus, UniversalStorageConfig } from '../../core'

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

export interface UseSynapseStorageReturn<T extends Record<string, any>> {
  storage: IStorage<T> | null
  status: StorageInitStatus
  initialize: () => Promise<void>
  destroy: () => Promise<void>
  isReady: boolean
  isLoading: boolean
  hasError: boolean
}

export function useCreateStorage<T extends Record<string, any>>(
  config: UniversalStorageConfig<T>,
  options: UseSynapseStorageOptions = {},
  pluginExecutor?: IPluginExecutor,
  eventEmitter?: IEventEmitter,
  logger?: ILogger,
): UseSynapseStorageReturn<T> {
  const { autoInitialize = true, destroyOnUnmount = true } = options

  const storageRef = useRef<IStorage<T> | null>(null)
  const [status, setStatus] = useState<StorageInitStatus>({
    status: StorageStatus.IDLE,
  })

  const storage = useMemo(() => {
    if (!storageRef.current) {
      try {
        storageRef.current = StorageFactory.create<T>(config, pluginExecutor, eventEmitter, logger)
      } catch (error) {
        setStatus({
          status: StorageStatus.ERROR,
          error: error as Error,
        })
        return null
      }
    }
    return storageRef.current
  }, [config, pluginExecutor, eventEmitter, logger])

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
    if (autoInitialize && storage && status.status === StorageStatus.IDLE) {
      initialize()
    }
  }, [autoInitialize, storage, status.status, initialize])

  useEffect(() => {
    return () => {
      if (destroyOnUnmount && storage) {
        storage.destroy().catch(console.error)
      }
    }
  }, [destroyOnUnmount, storage])

  const isReady = status.status === StorageStatus.READY
  const isLoading = status.status === StorageStatus.LOADING
  const hasError = status.status === StorageStatus.ERROR

  return {
    storage,
    status,
    initialize,
    destroy,
    isReady,
    isLoading,
    hasError,
  }
}
