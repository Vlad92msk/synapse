import { handleCallbackError, logError } from '../../../_utils/error-handling.util'
import { StorageEvents, StorageType } from '../storage.interface'
import { Middleware, MiddlewareAPI, NextFunction, StorageAction, SyncMiddleware, SyncMiddlewareAPI, SyncNextFunction } from '../utils/middleware-module'

/**
 * Общая часть кросс-табных мидлвар (`broadcast`/`shared-worker` и их sync-аналогов).
 *
 * Все четыре мидлвары были почти-побайтовыми копиями — различались только (a) классом
 * канала (`SyncBroadcastChannel` vs `WorkerChannel`), (b) значением `name` и (c) префиксом
 * в сообщениях об ошибках. Оба класса канала намеренно зеркалят один и тот же API
 * ({@link SharedStateChannel}) — это и есть шов, через который фабрика получает канал.
 *
 * Async и sync фабрики оставлены раздельными: они порождают разные типы мидлвар
 * (async — с `await`/`doDelete`; sync — синхронные, `doRemove`).
 */
export interface SharedStateChannel<T> {
  subscribe(handler: (message: { type: string; payload?: T }) => void | Promise<void>): () => void
  setSyncHandler(handler: () => T | Promise<T>): void
  broadcast(type: string, payload?: T): void
  requestSync(): Promise<T | null>
  close(): void
}

export interface SharedStateMiddlewareProps {
  storageType: StorageType
  storageName: string
}

interface SharedStateFactoryConfig {
  /** Значение поля `name` мидлвары (например, 'broadcast'). Публичная часть API. */
  name: string
  /** Префикс в сообщениях об ошибках, чтобы логи оставались атрибутируемыми (например, 'broadcastMiddleware'). */
  label: string
  /** Фабрика канала — единственное отличие между конкретными мидлварами. */
  createChannel: (channelName: string) => SharedStateChannel<StorageAction>
}

// ─── Async ───────────────────────────────────────────────────────────────────

// Обработка сообщений для MemoryStorage
async function handleMemoryStorageMessage(api: MiddlewareAPI, type: string, payload: any): Promise<void> {
  switch (type) {
    case 'set':
      if (payload?.key !== undefined && payload?.value !== undefined) {
        await api.storage.doSet(payload.key, payload.value)
        api.storage.notifySubscribers(payload.key, payload.value)
      }
      break

    case 'update':
      if (Array.isArray(payload?.value)) {
        await api.storage.doUpdate(payload.value)
        //@ts-ignore
        payload.value.forEach(({ key, value }) => {
          //@ts-ignore
          api.storage.notifySubscribers(key, value)
        })
      }
      break

    case 'delete':
      if (payload?.key !== undefined) {
        await api.storage.doDelete(payload.key)
        api.storage.notifySubscribers(payload.key, undefined)
      }
      break

    case 'clear':
      await api.storage.doClear()
      api.storage.notifySubscribers('*', {
        type: StorageEvents.STORAGE_UPDATE,
        value: {},
        source: 'broadcast',
      })
      break
  }

  // Уведомляем глобальных подписчиков
  api.storage.notifySubscribers('*', {
    type: StorageEvents.STORAGE_UPDATE,
    key: payload?.key,
    value: payload?.value,
    source: 'broadcast',
  })
}

// Обработка сообщений для LocalStorage и IndexedDB
async function handlePersistentStorageMessage(api: MiddlewareAPI, type: string, payload: any): Promise<void> {
  // Для LocalStorage и IndexedDB данные уже синхронизированы браузером
  // Нужно только получить актуальные данные и уведомить подписчиков

  switch (type) {
    case 'set':
      if (payload?.key !== undefined) {
        // Получаем актуальное значение из хранилища
        const currentValue = await api.storage.doGet(payload.key)
        api.storage.notifySubscribers(payload.key, currentValue)
      }
      break

    case 'update':
      if (Array.isArray(payload?.value)) {
        // Получаем актуальные значения для каждого обновленного ключа
        for (const { key } of payload.value) {
          const currentValue = await api.storage.doGet(key)
          api.storage.notifySubscribers(key, currentValue)
        }

        // Уведомляем об обновлении с актуальными данными
        api.storage.notifySubscribers('*', {
          type: StorageEvents.STORAGE_UPDATE,
          //@ts-ignore
          key: payload.value.map(({ key }) => key),
          value: payload.value,
          source: 'broadcast',
        })
      }
      break

    case 'delete':
      if (payload?.key !== undefined) {
        api.storage.notifySubscribers(payload.key, undefined)
      }
      break

    case 'clear':
      // При очистке уведомляем всех подписчиков
      api.storage.notifySubscribers('*', {
        type: StorageEvents.STORAGE_UPDATE,
        value: {},
        source: 'broadcast',
      })
      break
  }

  // Общее уведомление для глобальных подписчиков
  if (type !== 'update') {
    // Для update уже отправили выше
    api.storage.notifySubscribers('*', {
      type: StorageEvents.STORAGE_UPDATE,
      key: payload?.key,
      value: type === 'delete' ? undefined : payload?.value,
      source: 'broadcast',
    })
  }
}

/**
 * Фабрика async кросс-табной мидлвары. Возвращает `(props) => Middleware` — ту же
 * сигнатуру, что у публичных `broadcastMiddleware`/`sharedWorkerMiddleware`.
 */
export function createSharedStateMiddleware(config: SharedStateFactoryConfig) {
  const { name, label, createChannel } = config

  return (props: SharedStateMiddlewareProps): Middleware => {
    const { storageName, storageType } = props
    const channelName = `${storageType}-${storageName}`
    const channel = createChannel(channelName)

    return {
      name,
      setup: (api: MiddlewareAPI) => {
        // Настройка синхронизации для MemoryStorage
        if (storageType === 'memory') {
          channel.setSyncHandler(async () => {
            const state = await api.getState()

            const updates = Object.entries(state).map(([key, value]) => ({
              key,
              value,
            }))

            const action: StorageAction = {
              type: 'update',
              key: '*',
              value: updates,
              metadata: {
                batchUpdate: true,
                timestamp: Date.now(),
              },
            }
            return action
          })

          // Запрашиваем начальную синхронизацию для MemoryStorage
          channel
            .requestSync()
            .then(async (action) => {
              if (action?.type === 'update' && Array.isArray(action.value)) {
                try {
                  const validUpdates = action.value.every((update) => update && typeof update === 'object' && 'key' in update && 'value' in update)

                  if (!validUpdates) {
                    logError(`${label}: invalid sync response updates structure`, action.value)
                    return
                  }

                  await api.storage.doUpdate(action.value)

                  // Уведомляем подписчиков о каждом обновленном значении
                  action.value.forEach(({ key, value }) => {
                    api.storage.notifySubscribers(key, value)
                  })

                  // Уведомляем глобальных подписчиков
                  api.storage.notifySubscribers('*', {
                    type: StorageEvents.STORAGE_UPDATE,
                    value: action.value,
                    source: 'broadcast',
                  })
                } catch (error) {
                  handleCallbackError(`${label}: error applying sync updates`, error)
                }
              }
            })
            .catch((error) => {
              logError(`${label}: initial sync failed`, error, null, 'warn')
            })
        }

        // Подписка на сообщения от других вкладок
        return channel.subscribe(async (message) => {
          const { type, payload } = message

          if (storageType === 'memory') {
            // Для MemoryStorage обновляем данные и уведомляем подписчиков
            await handleMemoryStorageMessage(api, type, payload)
          } else {
            // Для LocalStorage и IndexedDB только уведомляем подписчиков
            await handlePersistentStorageMessage(api, type, payload)
          }
        })
      },

      reducer: (_api: MiddlewareAPI) => (next: NextFunction) => async (action: StorageAction) => {
        const result = await next(action)

        // Отправляем сообщение другим вкладкам для всех типов операций
        // Текущая вкладка уже получила уведомления через обычный flow BaseStorage
        if (['set', 'delete', 'clear', 'update'].includes(action.type)) {
          channel.broadcast(action.type, action)
        }

        return result
      },

      cleanup: () => {
        channel.close()
      },
    }
  }
}

// ─── Sync ──────────────────────────────────────────────────────────────────────

interface SyncSharedStateFactoryConfig {
  name: string
  label: string
  createChannel: (channelName: string) => SharedStateChannel<StorageAction>
}

function handleSyncStorageMessage(api: SyncMiddlewareAPI, type: string, payload: any): void {
  switch (type) {
    case 'set':
      if (payload?.key !== undefined && payload?.value !== undefined) {
        api.storage.doSet(payload.key, payload.value)
        api.storage.notifySubscribers(payload.key, payload.value)
      }
      break

    case 'update':
      if (Array.isArray(payload?.value)) {
        api.storage.doUpdate(payload.value)
        payload.value.forEach(({ key, value }: { key: string; value: any }) => {
          api.storage.notifySubscribers(key, value)
        })
      }
      break

    case 'delete':
      if (payload?.key !== undefined) {
        api.storage.doRemove(payload.key)
        api.storage.notifySubscribers(payload.key, undefined)
      }
      break

    case 'clear':
      api.storage.doClear()
      api.storage.notifySubscribers('*', {
        type: StorageEvents.STORAGE_UPDATE,
        value: {},
        source: 'broadcast',
      })
      break
  }

  api.storage.notifySubscribers('*', {
    type: StorageEvents.STORAGE_UPDATE,
    key: payload?.key,
    value: payload?.value,
    source: 'broadcast',
  })
}

function handlePersistentSyncStorageMessage(api: SyncMiddlewareAPI, type: string, payload: any): void {
  switch (type) {
    case 'set':
      if (payload?.key !== undefined) {
        const currentValue = api.storage.doGet(payload.key)
        api.storage.notifySubscribers(payload.key, currentValue)
      }
      break

    case 'update':
      if (Array.isArray(payload?.value)) {
        for (const { key } of payload.value) {
          const currentValue = api.storage.doGet(key)
          api.storage.notifySubscribers(key, currentValue)
        }

        api.storage.notifySubscribers('*', {
          type: StorageEvents.STORAGE_UPDATE,
          key: payload.value.map(({ key }: { key: string }) => key),
          value: payload.value,
          source: 'broadcast',
        })
      }
      break

    case 'delete':
      if (payload?.key !== undefined) {
        api.storage.notifySubscribers(payload.key, undefined)
      }
      break

    case 'clear':
      api.storage.notifySubscribers('*', {
        type: StorageEvents.STORAGE_UPDATE,
        value: {},
        source: 'broadcast',
      })
      break
  }

  if (type !== 'update') {
    api.storage.notifySubscribers('*', {
      type: StorageEvents.STORAGE_UPDATE,
      key: payload?.key,
      value: type === 'delete' ? undefined : payload?.value,
      source: 'broadcast',
    })
  }
}

/**
 * Фабрика sync кросс-табной мидлвары. Возвращает `(props) => SyncMiddleware` — ту же
 * сигнатуру, что у публичных `syncBroadcastMiddleware`/`syncSharedWorkerMiddleware`.
 */
export function createSyncSharedStateMiddleware(config: SyncSharedStateFactoryConfig) {
  const { name, label, createChannel } = config

  return (props: SharedStateMiddlewareProps): SyncMiddleware => {
    const { storageName, storageType } = props
    const channelName = `${storageType}-${storageName}`
    const channel = createChannel(channelName)

    return {
      name,
      setup: (api: SyncMiddlewareAPI) => {
        if (storageType === 'memory') {
          channel.setSyncHandler(async () => {
            const state = api.getState()

            const updates = Object.entries(state).map(([key, value]) => ({
              key,
              value,
            }))

            const action: StorageAction = {
              type: 'update',
              key: '*',
              value: updates,
              metadata: {
                batchUpdate: true,
                timestamp: Date.now(),
              },
            }
            return action
          })

          // Начальная синхронизация (fire-and-forget)
          channel
            .requestSync()
            .then((action) => {
              if (action?.type === 'update' && Array.isArray(action.value)) {
                try {
                  const validUpdates = action.value.every((update) => update && typeof update === 'object' && 'key' in update && 'value' in update)

                  if (!validUpdates) {
                    logError(`${label}: invalid sync response updates structure`, action.value)
                    return
                  }

                  api.storage.doUpdate(action.value)

                  action.value.forEach(({ key, value }) => {
                    api.storage.notifySubscribers(key, value)
                  })

                  api.storage.notifySubscribers('*', {
                    type: StorageEvents.STORAGE_UPDATE,
                    value: action.value,
                    source: 'broadcast',
                  })
                } catch (error) {
                  handleCallbackError(`${label}: error applying sync updates`, error)
                }
              }
            })
            .catch((error) => {
              logError(`${label}: initial sync failed`, error, null, 'warn')
            })
        }

        // Подписка на сообщения (BroadcastChannel API всегда async)
        return channel.subscribe((message) => {
          const { type, payload } = message

          if (storageType === 'memory') {
            handleSyncStorageMessage(api, type, payload)
          } else {
            handlePersistentSyncStorageMessage(api, type, payload)
          }
        })
      },

      reducer: (_api: SyncMiddlewareAPI) => (next: SyncNextFunction) => (action: StorageAction) => {
        const result = next(action)

        // Fire-and-forget broadcast to other tabs
        if (['set', 'delete', 'clear', 'update'].includes(action.type)) {
          channel.broadcast(action.type, action)
        }

        return result
      },

      cleanup: () => {
        channel.close()
      },
    }
  }
}
