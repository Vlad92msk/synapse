import { StorageEvents, StorageType } from '../storage.interface'
import { SyncBroadcastChannel } from '../utils/broadcast.util'
import { Middleware, MiddlewareAPI, NextFunction, StorageAction } from '../utils/middleware-module'

interface SharedStateMiddlewareProps {
  storageType: StorageType
  storageName: string
}

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

export const broadcastMiddleware = (props: SharedStateMiddlewareProps): Middleware => {
  const { storageName, storageType } = props
  const channelName = `${storageType}-${storageName}`
  const channel = new SyncBroadcastChannel<StorageAction>(channelName, { debug: true })

  return {
    name: 'broadcast',
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
        channel.requestSync().then(async (action) => {
          if (action?.type === 'update' && Array.isArray(action.value)) {
            try {
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

    reducer: (api: MiddlewareAPI) => (next: NextFunction) => async (action: StorageAction) => {
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
