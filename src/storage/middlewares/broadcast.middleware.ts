import { StorageEvents, StorageType } from '../storage.interface'
import { SyncBroadcastChannel } from '../utils/broadcast.util'
import { Middleware, MiddlewareAPI, NextFunction, StorageAction } from '../utils/middleware-module'

interface SharedStateMiddlewareProps {
  storageType: StorageType
  storageName: string
}

export const broadcastMiddleware = (props: SharedStateMiddlewareProps): Middleware => {
  const { storageName, storageType } = props
  const channelName = `${storageType}-${storageName}`
  const channel = new SyncBroadcastChannel<StorageAction>(channelName, { debug: true })

  return {
    name: 'sync',
    setup: (api: MiddlewareAPI) => {
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

        // Запрашиваем начальную синхронизацию
        channel.requestSync().then(async (action) => {
          if (action?.type === 'update' && Array.isArray(action.value)) {
            try {
              // Проверяем структуру обновлений
              const validUpdates = action.value.every((update) => update && typeof update === 'object' && 'key' in update && 'value' in update)

              if (!validUpdates) {
                console.error('[Sync Response] Invalid updates structure:', action.value)
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
              console.error('[Sync Response] Error applying updates:', error)
            }
          }
        })
      }

      return channel.subscribe(async (message) => {
        const { type, payload } = message

        if (storageType === 'memory') {
          switch (type) {
            case 'set':
              // @ts-ignore
              await api.storage.doSet(payload.key, payload.value)
              // @ts-ignore
              api.storage.notifySubscribers(payload.key, payload.value)
              break

            case 'update':
              // @ts-ignore
              if (Array.isArray(payload.value)) {
                // @ts-ignore
                await api.storage.doUpdate(payload.value)
                // @ts-ignore
                payload.value.forEach(({ key, value }) => {
                  api.storage.notifySubscribers(key, value)
                })
                //FIXME: Еще нужно настроить корректное уведомление глобальных подписчиков
                // Чтобы передавался масив ключей которые были изменены
              }
              break

            case 'delete':
              // @ts-ignore
              await api.storage.doDelete(payload.key)
              // @ts-ignore
              api.storage.notifySubscribers(payload.key, undefined)
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

          api.storage.notifySubscribers('*', {
            type: StorageEvents.STORAGE_UPDATE,
            key: payload?.key,
            value: payload?.value,
            source: 'broadcast',
          })
        }
      })
    },

    reducer: (api: MiddlewareAPI) => (next: NextFunction) => async (action: StorageAction) => {
      const result = await next(action)

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
