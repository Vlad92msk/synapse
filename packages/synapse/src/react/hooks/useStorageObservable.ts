import { useMemo } from 'react'

import { type InteropObservable, SimpleObservable } from '../../core/observable/interop-observable'
import type { IStorageBase } from '../../core/storage/storage.interface'
import { useObservable } from './useObservable'

/**
 * Поток-путь «store → реактивно в компоненте» без footgun'а с пере-подпиской (rxjs не требуется).
 *
 * Строит поток состояния (или среза — с пропуском повторов по `Object.is`) один раз на `storage`
 * и подписывается через {@link useObservable}.
 *
 * Эквивалентно `useStorageSubscribe`. Нужны операторы rxjs (`debounceTime`, `scan`) — используйте
 * `useObservable(() => toObservable(storage).pipe(...), initial, [storage])`.
 *
 * @example
 * ```ts
 * // весь стейт
 * const state = useStorageObservable(storage)
 * // срез (эмитит только при изменении среза)
 * const userId = useStorageObservable(storage, (s) => s.user.id)
 * ```
 *
 * @template S - Тип состояния хранилища
 * @template R - Тип возвращаемого среза
 * @param storage - Экземпляр хранилища
 * @param selector - Опциональный селектор среза (поток с `distinctUntilChanged`)
 */
export function useStorageObservable<S extends Record<string, any>>(storage: IStorageBase<S>): S
export function useStorageObservable<S extends Record<string, any>, R>(storage: IStorageBase<S>, selector: (state: S) => R): R
export function useStorageObservable<S extends Record<string, any>, R>(storage: IStorageBase<S>, selector?: (state: S) => R): S | R {
  const observable = useMemo<InteropObservable<S | R>>(
    () =>
      new SimpleObservable<S | R>((observer) => {
        let hasValue = false
        let last: S | R | undefined
        const emit = () => {
          const state = storage.getStateSync()
          const value = selector ? selector(state) : state
          // Срез — только при реальном изменении (как distinctUntilChanged); весь стейт — на каждое изменение.
          if (selector && hasValue && Object.is(value, last)) return
          hasValue = true
          last = value
          observer.next(value)
        }
        emit()
        return storage.subscribeToAll(emit)
      }),
    // selector намеренно не в deps: пересоздавать поток на каждую новую ссылку
    // селектора не нужно (он редко стабилен), переподписка идёт только по storage.
    [storage],
  )

  const initial = useMemo<S | R>(() => (selector ? selector(storage.getStateSync()) : storage.getStateSync()), [storage])

  return useObservable<S | R>(observable, initial)
}
