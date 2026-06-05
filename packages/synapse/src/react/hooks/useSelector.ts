import { useCallback, useRef, useSyncExternalStore } from 'react'

import type { SelectorAPI } from '../../core'

interface UseSelectorOptions<T> {
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
export function useSelector<T>(selector: SelectorAPI<T>): T
export function useSelector<T>(selector: SelectorAPI<T>, options: UseSelectorOptions<T> & { withLoading: true }): { data: T; isLoading: boolean }
export function useSelector<T>(selector: SelectorAPI<T>, options: UseSelectorOptions<T> & { withLoading?: false }): T
export function useSelector<T>(selector: SelectorAPI<T>, options?: UseSelectorOptions<T>): { data: T; isLoading: boolean } | T {
  const equalsRef = useRef(options?.equals)

  // Кеш для мемоизации результата getSnapshot (предотвращает лишние ререндеры)
  const cachedRef = useRef<T | undefined>(undefined)

  const subscribe = useCallback(
    (onStoreChange: VoidFunction) => {
      return selector.subscribe({
        notify: () => {
          onStoreChange()
        },
      })
    },
    [selector],
  )

  const getSnapshot = useCallback((): T => {
    const value = selector.selectSync()

    // Если есть пользовательская функция сравнения — мемоизируем
    const equals = equalsRef.current
    if (equals && cachedRef.current !== undefined && equals(cachedRef.current, value)) {
      return cachedRef.current
    }

    cachedRef.current = value
    return value
  }, [selector])

  const value = useSyncExternalStore(subscribe, getSnapshot)

  // Подписка на статус готовности storage (используется только при withLoading)
  const subscribeToStatus = useCallback(
    (onStoreChange: VoidFunction) => {
      return selector.onSourceStatusChange(() => {
        onStoreChange()
      })
    },
    [selector],
  )

  const getStatusSnapshot = useCallback((): boolean => {
    return !selector.isSourceReady()
  }, [selector])

  const isLoading = useSyncExternalStore(subscribeToStatus, getStatusSnapshot)

  if (options?.withLoading) {
    return { data: value, isLoading }
  }

  return value
}

/**
 * Изоляция ре-рендеров для keyed-map стора (паттерн «equals»). Подписка идёт на
 * ВЕСЬ map (`selector`), но `equals` сравнивает только срез по `key` → компонент
 * ре-рендерится лишь когда меняется его `map[key]` по ссылке. Работает, т.к.
 * иммутабельные мутации по одному ключу не трогают ссылку чужих срезов.
 * Гранулярность живёт в месте вызова, а селекторы остаются плоскими (без фабрик
 * с `Map<key, selector>`).
 *
 * `fallback` ОБЯЗАН быть стабильной ссылкой (module-level константа), иначе
 * `?? fallback` будет давать новый объект каждый тик и рвать нижестоящие `useMemo`.
 */
export function useKeyedSliceSelector<V>(selector: SelectorAPI<Record<string, V>>, key: string, fallback: V): V {
  const map = useSelector(selector, {
    equals: (a, b) => a[key] === b[key],
  })
  return map[key] ?? fallback
}
