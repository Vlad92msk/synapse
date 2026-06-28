import { useCallback, useRef, useSyncExternalStore } from 'react'

import { logError } from '../../_utils/error-handling.util'
import { IStorageBase } from '../../core'

export interface UseStorageSubscribeOptions<R> {
  /**
   * Функция сравнения предыдущего и нового среза. Если возвращает `true`,
   * снапшот не меняется по ссылке и компонент НЕ ререндерится — даже если
   * остальное состояние стора изменилось. Полезно, когда селектор возвращает
   * объект/массив (новая ссылка на каждый тик) или когда нужно ререндерить
   * только при изменении конкретного среза.
   */
  equals?: (a: R, b: R) => boolean
}

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
 * @param options - Опции: `equals` для мемоизации снапшота (см. {@link UseStorageSubscribeOptions})
 * @returns Значение из хранилища
 */
export const useStorageSubscribe = <S extends Record<string, any>, R = any>(
  storage: IStorageBase<S> | null,
  selector: (state: S) => R,
  options?: UseStorageSubscribeOptions<R>,
): R | undefined => {
  // Храним selector в ref, чтобы не пересоздавать subscribe/getSnapshot при изменении ссылки
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  const equalsRef = useRef(options?.equals)
  equalsRef.current = options?.equals

  // Кеш последнего снапшота — нужен и для мемоизации по equals, и чтобы вернуть
  // стабильную ссылку (иначе useSyncExternalStore при селекторе-фабрике объекта
  // зациклится на бесконечном ререндере).
  const cachedRef = useRef<R | undefined>(undefined)
  const hasCacheRef = useRef(false)

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
      const value = selectorRef.current(state)

      const equals = equalsRef.current
      if (equals && hasCacheRef.current && equals(cachedRef.current as R, value)) {
        return cachedRef.current
      }

      cachedRef.current = value
      hasCacheRef.current = true
      return value
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        logError('useStorageSubscribe: selector error', error, null, 'warn')
      }
      return undefined
    }
  }, [storage])

  return useSyncExternalStore(subscribe, getSnapshot)
}
