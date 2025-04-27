import { useEffect, useRef, useState } from 'react'

/**
 * Примеры использования:
 *
 * // Простой вариант (возвращает только значение)
 * const userData = useSelector(userSelector);
 *
 * // Расширенный вариант (возвращает значение и статус загрузки)
 * const { data: userData, isLoading } = useSelector(userSelector, { withLoading: true });
 *
 * // С начальным значением
 * const userData = useSelector(userSelector, { initialValue: { name: '' } });
 *
 * // С кастомной функцией сравнения
 * const userData = useSelector(userSelector, {
 *   equals: (a, b) => a?.id === b?.id && a?.name === b?.name
 * });
 */
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
 * Хук для использования селекторов в компонентах React
 * @param selector Селектор, созданный через SelectorModule.createSelector
 * @param options Дополнительные опции
 * @returns Текущее значение из селектора или объект с данными и статусом загрузки
 */
export function useSelector<T>(selector: SelectorAPI<T>): T | undefined
export function useSelector<T>(selector: SelectorAPI<T>, options: UseSelectorOptions<T> & { withLoading: true }): { data: T | undefined; isLoading: boolean }
export function useSelector<T>(selector: SelectorAPI<T>, options?: UseSelectorOptions<T>): { data: T | undefined; isLoading: boolean } | T | undefined {
  const [state, setState] = useState<T | undefined>(options?.initialValue)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Используем useRef для хранения последнего значения для сравнения
  const prevValueRef = useRef<T | undefined>(options?.initialValue)

  // Функция сравнения (по умолчанию === )
  const equals = options?.equals || ((a: T, b: T) => a === b)

  useEffect(() => {
    let isMounted = true

    // Запрашиваем начальное значение
    setIsLoading(true)
    selector
      .select()
      .then((initialValue) => {
        if (isMounted) {
          // Обновляем только если значение изменилось или это первая загрузка
          if (prevValueRef.current === undefined || !equals(initialValue, prevValueRef.current)) {
            prevValueRef.current = initialValue
            setState(initialValue)
          }
          setIsLoading(false)
        }
      })
      .catch((error) => {
        console.error('useSelector: Ошибка при получении начального значения', error)
        if (isMounted) {
          setIsLoading(false)
        }
      })

    // Подписываемся на обновления
    const unsubscribe = selector.subscribe({
      notify: (newValue: T) => {
        if (isMounted) {
          // Обновляем только если значение изменилось
          if (prevValueRef.current === undefined || !equals(newValue, prevValueRef.current)) {
            prevValueRef.current = newValue
            setState(newValue)
          }
        }
      },
    })

    // Отписываемся при размонтировании
    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [selector]) // зависимость только от селектора

  // Если запрошен режим с загрузкой или опции не определены и withLoading=true по умолчанию
  if (options?.withLoading === true) {
    return { data: state, isLoading }
  }

  // В простом режиме возвращаем только данные
  return state
}
