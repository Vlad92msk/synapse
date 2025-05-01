import { useEffect, useState } from 'react'

import { IStorage } from '../../core'

/**
 * Хук для подписки на изменения в хранилище
 *
 * @template S - Тип состояния хранилища
 * @template R - Тип возвращаемого значения
 * @param storage - Экземпляр хранилища
 * @param selector - Функция-селектор для выбора данных
 * @returns Значение из хранилища
 */
export const useStorageSubscribe = <S extends Record<string, any>, R = any>(storage: IStorage<S>, selector: (state: S) => R): R | undefined => {
  const [value, setValue] = useState<R | undefined>(undefined)

  useEffect(() => {
    // Флаг монтирования для предотвращения обновления состояния при размонтировании
    let isMounted = true

    const initializeValue = async () => {
      try {
        const state = await storage.getState()
        const selectedValue = selector(state) as R

        if (isMounted) {
          setValue(selectedValue)
        }
      } catch (error) {
        console.error('Failed to initialize storage value:', error)
      }
    }

    // Инициализируем значение
    initializeValue()

    let unsubscribe: VoidFunction
    try {
      unsubscribe = storage.subscribe(selector, (newValue: R) => {
        if (isMounted) {
          setValue(newValue)
        }
      })
    } catch (error) {
      console.error('Failed to subscribe to storage:', error)
      unsubscribe = () => {}
    }

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [storage, selector])

  return value
}
