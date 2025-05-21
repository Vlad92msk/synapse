import { useEffect, useRef, useState } from 'react'

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
 * Глобальный реестр селекторов с активными подписками.
 * Хранит последние значения селекторов и список callbacks для обновления всех компонентов.
 */
const SELECTOR_REGISTRY = new Map<
  string,
  {
    lastValue: any
    listeners: Set<(value: any) => void>
    unsubscribe: VoidFunction | null
  }
>()

/**
 * Хук для использования селекторов в компонентах React.
 * Обеспечивает согласованность значений между всеми экземплярами хука.
 */
export function useSelector<T>(selector: SelectorAPI<T>): T | undefined
export function useSelector<T>(selector: SelectorAPI<T>, options: UseSelectorOptions<T> & { withLoading?: true }): { data: T | undefined; isLoading: boolean }
export function useSelector<T>(selector: SelectorAPI<T>, options?: UseSelectorOptions<T>): { data: T | undefined; isLoading: boolean } | T | undefined {
  // Базовые состояния
  const [state, setState] = useState<T | undefined>(options?.initialValue)
  const [isLoading, setIsLoading] = useState<boolean>(!!options?.withLoading)

  // Для предотвращения лишних ререндеров
  const prevValueRef = useRef<T | undefined>(options?.initialValue)
  const equalsRef = useRef(options?.equals || ((a: T, b: T) => a === b))

  // Получаем ID селектора с помощью метода getId()
  const selectorId = selector.getId()

  // Обновляем состояние компонента при изменении значения
  const updateComponentState = (newValue: T) => {
    // Сравниваем с предыдущим значением компонента
    if (prevValueRef.current === undefined || !equalsRef.current(newValue, prevValueRef.current)) {
      prevValueRef.current = newValue
      setState(newValue)
    }
  }

  useEffect(() => {
    // Создаем запись в реестре, если её ещё нет
    if (!SELECTOR_REGISTRY.has(selectorId)) {
      SELECTOR_REGISTRY.set(selectorId, {
        lastValue: undefined,
        listeners: new Set(),
        unsubscribe: null,
      })
    }

    const registry = SELECTOR_REGISTRY.get(selectorId)!

    // Добавляем текущий компонент в список слушателей
    registry.listeners.add(updateComponentState)

    // Если у нас уже есть значение, сразу устанавливаем его
    if (registry.lastValue !== undefined) {
      updateComponentState(registry.lastValue)

      // Если был запрошен режим загрузки, сразу сбрасываем его
      if (options?.withLoading) {
        setIsLoading(false)
      }
    } else {
      // Запрашиваем начальное значение
      if (options?.withLoading) setIsLoading(true)

      selector
        .select()
        .then((initialValue) => {
          // Обновляем значение в реестре
          registry.lastValue = initialValue

          // Уведомляем все компоненты
          registry.listeners.forEach((listener) => listener(initialValue))

          if (options?.withLoading) setIsLoading(false)
        })
        .catch((error) => {
          console.error(`useSelector: Ошибка при получении начального значения для ${selectorId}`, error)
          if (options?.withLoading) setIsLoading(false)
        })
    }

    // Создаем подписку только один раз для селектора
    if (!registry.unsubscribe) {
      registry.unsubscribe = selector.subscribe({
        notify: (newValue: T) => {
          // Обновляем значение в реестре
          registry.lastValue = newValue

          // Уведомляем все компоненты
          registry.listeners.forEach((listener) => {
            try {
              listener(newValue)
            } catch (error) {
              console.error(`useSelector: Ошибка при уведомлении слушателя для ${selectorId}`, error)
            }
          })
        },
      })
    }

    // При размонтировании компонента
    return () => {
      const registry = SELECTOR_REGISTRY.get(selectorId)
      if (registry) {
        // Удаляем текущий компонент из списка слушателей
        registry.listeners.delete(updateComponentState)

        // Если больше нет слушателей, можно очистить подписку
        if (registry.listeners.size === 0) {
          if (registry.unsubscribe) {
            registry.unsubscribe()
          }
          SELECTOR_REGISTRY.delete(selectorId)
        }
      }
    }
  }, [selector, selectorId])

  // Возвращаем данные в нужном формате
  if (options?.withLoading) {
    return { data: state, isLoading }
  }

  return state
}
