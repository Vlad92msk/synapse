import { handleCallbackError, logError } from '../../../_utils/error-handling.util'
import { StorageEvents, StorageType } from '../storage.interface'
import { SyncBroadcastChannel } from '../utils/broadcast.util'
import { StorageAction, SyncMiddleware, SyncMiddlewareAPI, SyncNextFunction } from '../utils/middleware-module'

interface SyncSharedStateMiddlewareProps {
  storageType: StorageType
  storageName: string
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

export const syncBroadcastMiddleware = (props: SyncSharedStateMiddlewareProps): SyncMiddleware => {
  const { storageName, storageType } = props
  const channelName = `${storageType}-${storageName}`
  const channel = new SyncBroadcastChannel<StorageAction>(channelName, { debug: true })

  return {
    name: 'sync-broadcast',
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
                  logError('syncBroadcastMiddleware: invalid sync response updates structure', action.value)
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
                handleCallbackError('syncBroadcastMiddleware: error applying sync updates', error)
              }
            }
          })
          .catch((error) => {
            logError('syncBroadcastMiddleware: initial sync failed', error, null, 'warn')
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
