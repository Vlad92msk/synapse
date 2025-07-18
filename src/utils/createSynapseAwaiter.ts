import { IStorage } from '../core'
import { AnySynapseStore } from '../utils'

export interface SynapseAwaiter<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors, TActions> {
  /**
   * Возвращает Promise, который резолвится когда Synapse готов
   */
  waitForReady(): Promise<AnySynapseStore<TStore, TStorage, TSelectors, TActions>>

  /**
   * Проверяет, готов ли Synapse прямо сейчас (синхронно)
   */
  isReady(): boolean

  /**
   * Получает store если он готов, иначе undefined
   */
  getStoreIfReady(): AnySynapseStore<TStore, TStorage, TSelectors, TActions> | undefined

  /**
   * Подписывается на событие готовности
   * @param callback Функция, вызываемая когда store становится готов
   * @returns Функция отписки
   */
  onReady(callback: (store: AnySynapseStore<TStore, TStorage, TSelectors, TActions>) => void): VoidFunction

  /**
   * Подписывается на ошибки инициализации
   * @param callback Функция, вызываемая при ошибке
   * @returns Функция отписки
   */
  onError(callback: (error: Error) => void): VoidFunction

  /**
   * Получает текущий статус
   */
  getStatus(): 'pending' | 'ready' | 'error'

  /**
   * Получает ошибку если есть
   */
  getError(): Error | null

  /**
   * Очищает ресурсы
   */
  destroy(): void
}

/**
 * Создает фреймворк-независимую утилиту для ожидания готовности Synapse
 * Работает в любом JS окружении: Node.js, браузер, React Native, и т.д.
 */
export function createSynapseAwaiter<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors, TActions>(
  synapseStorePromise: Promise<AnySynapseStore<TStore, TStorage, TSelectors, TActions>> | AnySynapseStore<TStore, TStorage, TSelectors, TActions>,
): SynapseAwaiter<TStore, TStorage, TSelectors, TActions> {
  let status: 'pending' | 'ready' | 'error' = 'pending'
  let store: AnySynapseStore<TStore, TStorage, TSelectors, TActions> | undefined
  let error: Error | null = null

  const readyCallbacks = new Set<(store: AnySynapseStore<TStore, TStorage, TSelectors, TActions>) => void>()
  const errorCallbacks = new Set<(error: Error) => void>()

  // Создаем Promise для инициализации хранилища
  const storeInitPromise = (async () => {
    try {
      const resolvedStore = await (synapseStorePromise instanceof Promise ? synapseStorePromise : Promise.resolve(synapseStorePromise))

      // Дополнительно ждем готовности хранилища
      await resolvedStore.storage.waitForReady()

      store = resolvedStore
      status = 'ready'

      // Уведомляем всех подписчиков о готовности
      readyCallbacks.forEach((callback) => {
        try {
          callback(store!)
        } catch (err) {
          console.error('Error in ready callback:', err)
        }
      })

      return resolvedStore
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      error = errorObj
      status = 'error'

      // Уведомляем всех подписчиков об ошибке
      errorCallbacks.forEach((callback) => {
        try {
          callback(errorObj)
        } catch (callbackErr) {
          console.error('Error in error callback:', callbackErr)
        }
      })

      throw errorObj
    }
  })()

  return {
    waitForReady: () => storeInitPromise,

    isReady: () => status === 'ready',

    getStoreIfReady: () => store,

    onReady: (callback) => {
      // Если уже готов, вызываем callback немедленно
      if (status === 'ready' && store) {
        try {
          callback(store)
        } catch (err) {
          console.error('Error in immediate ready callback:', err)
        }
      } else {
        // Иначе добавляем в список ожидания
        readyCallbacks.add(callback)
      }

      return () => {
        readyCallbacks.delete(callback)
      }
    },

    onError: (callback) => {
      // Если уже есть ошибка, вызываем callback немедленно
      if (status === 'error' && error) {
        try {
          callback(error)
        } catch (err) {
          console.error('Error in immediate error callback:', err)
        }
      } else {
        // Иначе добавляем в список ожидания
        errorCallbacks.add(callback)
      }

      return () => {
        errorCallbacks.delete(callback)
      }
    },

    getStatus: () => status,

    getError: () => error,

    destroy: () => {
      readyCallbacks.clear()
      errorCallbacks.clear()
      store = undefined
      error = null
      status = 'pending'
    },
  }
}
