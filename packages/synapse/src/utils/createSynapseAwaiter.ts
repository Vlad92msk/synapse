import { handleCallbackError } from '../_utils/error-handling.util'
import { type IStorageBase, StorageStatus } from '../core'

// createSynapseAwaiter — обёртка над стором, отвечает на один вопрос: «стор готов?».
// Зачем: стор бывает НЕ готов в момент рендера (фабрика ждёт зависимости, storage.initialize()
// у IndexedDB асинхронный), а React при первом рендере спрашивает синхронно. Awaiter — маленький
// автомат из трёх состояний: pending → ready | error.
//   - готов сейчас  → отдаёт стор синхронно (getStoreIfReady) — путь SSR / sync-стора;
//   - ещё не готов  → держит Promise и зовёт подписчиков onReady/onError, когда достроится.
// Кто пользуется: createSynapseCtx (useState — синхронный кадр, useEffect — подписка на готовность).

/** Минимальная форма стора для awaiter'а: только storage (готовность читаем из storage.initStatus). */
export interface AwaitableSynapse {
  storage: IStorageBase<any>
}

/** Похож ли вход на thenable (handle/Promise), а не на уже готовый synapse. */
const isThenable = (value: unknown): value is PromiseLike<unknown> => typeof (value as { then?: unknown } | null)?.then === 'function'

/**
 * Пытается достать ГОТОВЫЙ стор прямо сейчас, без ожидания. Два случая:
 *  - вход — handle: берём собранный стор через getSnapshot() (после dehydrate он READY);
 *  - вход — уже готовый стор напрямую (не Promise) с READY-хранилищем.
 * Не вышло → undefined → пойдём асинхронным путём. Это и есть SSR sync-fast-path:
 * так серверный рендер получает main синхронно, без спиннера.
 */
const resolveSyncReady = <TStore extends AwaitableSynapse>(input: PromiseLike<TStore> | TStore): TStore | undefined => {
  // Вход — handle: берём уже собранный стор (сервер после dehydrate / повторный mount на клиенте).
  const snapshot = (input as { getSnapshot?: () => TStore | undefined } | null)?.getSnapshot?.()
  if (snapshot && snapshot.storage.initStatus.status === StorageStatus.READY) return snapshot

  // Вход — готовый стор передали напрямую (не Promise), с READY-хранилищем.
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
  // Состояние автомата: статус + сам стор + ошибка. Меняются либо синхронно (fast-path ниже),
  // либо асинхронно (storeInitPromise), либо гасятся в destroy().
  let status: 'pending' | 'ready' | 'error' = 'pending'
  let store: TStore | undefined
  let error: Error | null = null
  let destroyed = false

  // Подписчики на готовность/ошибку (их наполняет onReady/onError, дёргает async-путь).
  const readyCallbacks = new Set<(store: TStore) => void>()
  const errorCallbacks = new Set<(error: Error) => void>()

  // Sync-fast-path: если стор готов уже сейчас — выставляем 'ready' ДО возврата, чтобы
  // getStoreIfReady() отдал его на первом же синхронном рендере (сервер / клиентская гидрация).
  const syncReady = resolveSyncReady(synapseStorePromise)
  if (syncReady) {
    store = syncReady
    status = 'ready'
  }

  // Async-путь: ждём, пока стор соберётся и хранилище станет READY, затем 'ready' + зовём onReady
  // (или onError). Нужен, когда синхронно готового не было (async-стор на клиенте): компонент
  // подписался в useEffect и перерисуется, когда стор достроится.
  const storeInitPromise = (async () => {
    try {
      const resolvedStore = await Promise.resolve(synapseStorePromise)

      // Ждём готовности хранилища (storage.initialize() может быть асинхронным).
      await resolvedStore.storage.waitForReady()

      // awaiter уничтожили пока ждали — состояние не трогаем.
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

  // Публичный API: синхронные геттеры + подписки. Из createSynapseCtx зовут getStoreIfReady()
  // (в useState/useEffect) и onReady/onError (подписка в useEffect на async-готовность).
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

    // Сброс: отписываем всех и обнуляем состояние. Флаг destroyed не даёт async-пути записать
    // готовность после уничтожения (напр. размонтировали клиентский awaiter в cleanupSynapse).
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
