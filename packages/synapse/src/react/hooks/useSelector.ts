import { useCallback, useRef, useSyncExternalStore } from 'react'

import type { SelectorAPI } from '../../core'

interface UseSelectorOptions<T> {
  /** Начальное значение до загрузки данных из селектора */
  initialValue?: T
  /** Функция сравнения для предотвращения лишних ререндеров */
  equals?: (a: T, b: T) => boolean
  /** Включать ли статус загрузки в возвращаемый результат */
  withLoading?: boolean
}

/**
 * Хук для использования селекторов в компонентах React.
 * Использует useSyncExternalStore для корректной работы в Concurrent Mode.
 * Подписывается напрямую через selector.subscribe() — без глобального реестра.
 */
export function useSelector<T>(selector: SelectorAPI<T>): T | undefined
export function useSelector<T>(selector: SelectorAPI<T>, options: UseSelectorOptions<T> & { withLoading: true }): { data: T | undefined; isLoading: boolean }
export function useSelector<T>(selector: SelectorAPI<T>, options?: UseSelectorOptions<T>): { data: T | undefined; isLoading: boolean } | T | undefined {
  const initialValueRef = useRef(options?.initialValue)
  const equalsRef = useRef(options?.equals)

  // Отслеживаем, получили ли мы хотя бы одно значение от селектора
  const hasResolvedRef = useRef(false)

  // Кеш для мемоизации результата getSnapshot (предотвращает лишние ререндеры)
  const cachedRef = useRef<T | undefined>(undefined)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return selector.subscribe({
        notify: () => {
          hasResolvedRef.current = true
          onStoreChange()
        },
      })
    },
    [selector],
  )

  const getSnapshot = useCallback((): T | undefined => {
    const value = selector.selectSync()
    const result = value !== undefined ? value : initialValueRef.current

    // Если есть пользовательская функция сравнения — мемоизируем
    const equals = equalsRef.current
    if (equals && cachedRef.current !== undefined && result !== undefined && equals(cachedRef.current, result)) {
      return cachedRef.current
    }

    cachedRef.current = result
    return result
  }, [selector])

  const value = useSyncExternalStore(subscribe, getSnapshot)

  if (options?.withLoading) {
    return { data: value, isLoading: !hasResolvedRef.current && value === undefined }
  }

  return value
}
