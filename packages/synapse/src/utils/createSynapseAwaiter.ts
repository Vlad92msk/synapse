import { handleCallbackError } from '../_utils/error-handling.util'
import { type IStorageBase, StorageStatus } from '../core'

/** Минимальная форма готового synapse, нужная awaiter'у: доступ к storage. */
export interface AwaitableSynapse {
  storage: IStorageBase<any>
}

/** Похож ли вход на thenable (handle/Promise), а не на уже готовый synapse. */
const isThenable = (value: unknown): value is PromiseLike<unknown> => typeof (value as { then?: unknown } | null)?.then === 'function'

/**
 * Синхронно извлекает уже готовый synapse из входа, если это возможно:
 *  - `SynapseModule`-handle, уже собранный (`getSnapshot()` отдаёт synapse);
 *  - напрямую переданный synapse с уже инициализированным (READY) хранилищем.
 * Иначе `undefined` — резолв уйдёт в async-ветку. Это и есть SSR sync-fast-path.
 */
const resolveSyncReady = <TStore extends AwaitableSynapse>(input: PromiseLike<TStore> | TStore): TStore | undefined => {
  // Handle: синхронный снапшот уже собранного synapse (server после dehydrate / повторный mount).
  const snapshot = (input as { getSnapshot?: () => TStore | undefined } | null)?.getSnapshot?.()
  if (snapshot && snapshot.storage.initStatus.status === StorageStatus.READY) return snapshot

  // Напрямую переданный готовый synapse (не thenable) с READY-хранилищем.
  if (!isThenable(input) && (input as TStore).storage?.initStatus?.status === StorageStatus.READY) {
    return input as TStore
  }

  return undefined
}

export interface SynapseAwaiter<TStore extends AwaitableSynapse> {
  /**
   * Возвращает Promise, который резолвится когда Synapse готов
   */
  waitForReady(): Promise<TStore>

  /**
   * Проверяет, готов ли Synapse прямо сейчас (синхронно)
   */
  isReady(): boolean

  /**
   * Получает store если он готов, иначе undefined
   */
  getStoreIfReady(): TStore | undefined

  /**
   * Подписывается на событие готовности
   * @param callback Функция, вызываемая когда store становится готов
   * @returns Функция отписки
   */
  onReady(callback: (store: TStore) => void): VoidFunction

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
 * Создает фреймворк-независимую утилиту для ожидания готовности Synapse.
 * Принимает `SynapseModule`-handle (PromiseLike), Promise готового synapse либо сам
 * готовый synapse. Работает в любом JS окружении: Node.js, браузер, React Native.
 */
export function createSynapseAwaiter<TStore extends AwaitableSynapse>(synapseStorePromise: PromiseLike<TStore> | TStore): SynapseAwaiter<TStore> {
  let status: 'pending' | 'ready' | 'error' = 'pending'
  let store: TStore | undefined
  let error: Error | null = null
  let destroyed = false

  const readyCallbacks = new Set<(store: TStore) => void>()
  const errorCallbacks = new Set<(error: Error) => void>()

  // SSR sync-fast-path: если стор уже готов синхронно — выставляем состояние ДО возврата,
  // чтобы getStoreIfReady() отдавал его на первом синхронном рендере (сервер/гидрация).
  const syncReady = resolveSyncReady(synapseStorePromise)
  if (syncReady) {
    store = syncReady
    status = 'ready'
  }

  // Создаем Promise для инициализации хранилища
  const storeInitPromise = (async () => {
    try {
      const resolvedStore = await Promise.resolve(synapseStorePromise)

      // Дополнительно ждем готовности хранилища
      await resolvedStore.storage.waitForReady()

      // Если awaiter был уничтожен во время инициализации — не обновляем состояние
      if (destroyed) return resolvedStore

      store = resolvedStore
      status = 'ready'

      // Уведомляем всех подписчиков о готовности
      readyCallbacks.forEach((callback) => {
        try {
          callback(store!)
        } catch (err) {
          handleCallbackError('SynapseAwaiter: error in ready callback', err)
        }
      })

      return resolvedStore
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))

      // Если awaiter был уничтожен во время инициализации — не обновляем состояние
      if (destroyed) throw errorObj

      error = errorObj
      status = 'error'

      // Уведомляем всех подписчиков об ошибке
      errorCallbacks.forEach((callback) => {
        try {
          callback(errorObj)
        } catch (callbackErr) {
          handleCallbackError('SynapseAwaiter: error in error callback', callbackErr)
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
          handleCallbackError('SynapseAwaiter: error in immediate ready callback', err)
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
          handleCallbackError('SynapseAwaiter: error in immediate error callback', err)
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
      destroyed = true
      readyCallbacks.clear()
      errorCallbacks.clear()
      store = undefined
      error = null
      status = 'pending'
    },
  }
}
