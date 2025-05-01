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
 * Предотвращает потерю подписок при размонтировании компонентов.
 */
const PERSISTENT_SUBSCRIPTIONS = new Map<
  string,
  {
    selector: SelectorAPI<any>
    unsubscribe: () => void
    refCount: number
  }
>()

/**
 * Кеш идентификаторов для селекторов без toString
 * Гарантирует стабильность ID между вызовами
 */
const SELECTOR_ID_CACHE = new WeakMap<SelectorAPI<any>, string>()

/**
 * Получает стабильный идентификатор селектора
 */
function getSelectorId<T>(selector: SelectorAPI<T>): string {
  // Проверяем кеш идентификаторов
  if (SELECTOR_ID_CACHE.has(selector)) {
    return SELECTOR_ID_CACHE.get(selector)!
  }

  // Используем встроенный toString, если он доступен и возвращает строку
  if (typeof selector.toString === 'function') {
    const id = selector.toString()

    // Проверяем, что результат toString - это не стандартный [object Object]
    if (id !== '[object Object]' && typeof id === 'string') {
      SELECTOR_ID_CACHE.set(selector, id)
      return id
    }
  }

  // Создаем уникальный идентификатор, если toString недоступен или не подходит
  const generatedId = `selector_${Date.now()}_${Math.random().toString(36).slice(2)}`
  SELECTOR_ID_CACHE.set(selector, generatedId)
  return generatedId
}

/**
 * Хук для использования селекторов в компонентах React.
 * Поддерживает постоянные подписки для корректной работы реактивности.
 */
export function useSelector<T>(selector: SelectorAPI<T>): T | undefined
export function useSelector<T>(selector: SelectorAPI<T>, options: UseSelectorOptions<T> & { withLoading?: true }): { data: T | undefined; isLoading: boolean }
export function useSelector<T>(selector: SelectorAPI<T>, options?: UseSelectorOptions<T>): { data: T | undefined; isLoading: boolean } | T | undefined {
  // Базовые состояния
  const [state, setState] = useState<T | undefined>(options?.initialValue)
  const [isLoading, setIsLoading] = useState<boolean>(!!options?.withLoading)

  // Для предотвращения лишних ререндеров
  const prevValueRef = useRef<T | undefined>(options?.initialValue)

  // Получаем стабильный ID селектора
  const selectorId = getSelectorId(selector)

  // Функция обновления состояния с проверкой на изменения
  const updateState = (newValue: T) => {
    const equals = options?.equals || ((a: T, b: T) => a === b)

    // Обновляем только если значение изменилось или это первая загрузка
    if (prevValueRef.current === undefined || !equals(newValue, prevValueRef.current)) {
      prevValueRef.current = newValue
      setState(newValue)
    }
  }

  useEffect(() => {
    // Запрашиваем начальное значение
    if (options?.withLoading) setIsLoading(true)

    selector
      .select()
      .then((initialValue) => {
        updateState(initialValue)
        if (options?.withLoading) setIsLoading(false)
      })
      .catch((error) => {
        console.error('useSelector: Ошибка при получении начального значения', error)
        if (options?.withLoading) setIsLoading(false)
      })

    // Проверяем, есть ли уже подписка в глобальном реестре
    if (!PERSISTENT_SUBSCRIPTIONS.has(selectorId)) {
      // Создаем новую подписку
      const unsubscribe = selector.subscribe({
        notify: (newValue: T) => {
          updateState(newValue)
        },
      })

      // Добавляем в реестр постоянных подписок
      PERSISTENT_SUBSCRIPTIONS.set(selectorId, {
        selector,
        unsubscribe,
        refCount: 1,
      })
    } else {
      // Увеличиваем счетчик ссылок
      const entry = PERSISTENT_SUBSCRIPTIONS.get(selectorId)!
      entry.refCount++
    }

    // При размонтировании компонента
    return () => {
      const entry = PERSISTENT_SUBSCRIPTIONS.get(selectorId)
      if (entry) {
        entry.refCount--

        // Если это был последний компонент, использующий этот селектор,
        // можно было бы удалить подписку, но мы специально этого не делаем,
        // чтобы сохранить реактивность между различными монтированиями компонентов
        //
        // Для очистки ресурсов при необходимости можно раскомментировать:
        //
        // if (entry.refCount <= 0) {
        //   entry.unsubscribe();
        //   PERSISTENT_SUBSCRIPTIONS.delete(selectorId);
        // }
      }
    }
  }, [selector, selectorId])

  // Если запрошен режим с загрузкой
  if (options?.withLoading) {
    return { data: state, isLoading }
  }

  // В простом режиме возвращаем только данные
  return state
}
