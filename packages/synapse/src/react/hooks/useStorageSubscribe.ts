import { useCallback, useRef, useSyncExternalStore } from 'react'

import { logError } from '../../_utils/error-handling.util'
import { IStorageBase } from '../../core'

/**
 * Хук для подписки на изменения в хранилище.
 * Использует useSyncExternalStore для корректной работы в Concurrent Mode.
 *
 * Принимает IStorageBase (общий интерфейс для sync и async хранилищ),
 * так как подписки одинаковы для всех типов.
 *
 * @template S - Тип состояния хранилища
 * @template R - Тип возвращаемого значения
 * @param storage - Экземпляр хранилища или null (до инициализации)
 * @param selector - Функция-селектор для выбора данных
 * @returns Значение из хранилища
 */
export const useStorageSubscribe = <S extends Record<string, any>, R = any>(storage: IStorageBase<S> | null, selector: (state: S) => R): R | undefined => {
  // Храним selector в ref, чтобы не пересоздавать subscribe/getSnapshot при изменении ссылки
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  const subscribe = useCallback(
    (onStoreChange: VoidFunction) => {
      if (!storage) return () => {}

      // Подписка на все изменения storage + на смену статуса (для момента инициализации)
      const unsubData = storage.subscribeToAll(() => onStoreChange())
      const unsubStatus = storage.onStatusChange(() => onStoreChange())
      return () => {
        unsubData()
        unsubStatus()
      }
    },
    [storage],
  )

  const getSnapshot = useCallback((): R | undefined => {
    if (!storage) return undefined

    try {
      const state = storage.getStateSync()
      return selectorRef.current(state)
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        logError('useStorageSubscribe: selector error', error, null, 'warn')
      }
      return undefined
    }
  }, [storage])

  return useSyncExternalStore(subscribe, getSnapshot)
}
