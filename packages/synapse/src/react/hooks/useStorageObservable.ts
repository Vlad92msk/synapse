import { useMemo } from 'react'
import { Observable } from 'rxjs'

import { IStorageBase } from '../../core'
import { toObservable } from '../../reactive/effects/utils/toObservable'
import { useObservable } from './useObservable'

/**
 * RxJS-путь «store → реактивно в компоненте» без footgun'а с пере-подпиской.
 *
 * Оборачивает {@link toObservable} в `useMemo` по `[storage]` и подписывается
 * через {@link useObservable}. Без этой обёртки инлайновый `toObservable(storage)`
 * в рендере создавал бы новый Observable на каждый рендер и провоцировал лишние
 * пере-подписки.
 *
 * Эквивалентно `useStorageSubscribe`, но через RxJS — берите его, если нужны
 * операторы (`debounceTime`, `scan` и т.п.) поверх потока состояния.
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
  const observable = useMemo<Observable<S | R>>(
    () => (selector ? toObservable(storage, selector) : toObservable(storage)),
    // selector намеренно не в deps: пересоздавать поток на каждую новую ссылку
    // селектора не нужно (он редко стабилен), переподписка идёт только по storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storage],
  )

  const initial = useMemo<S | R>(
    () => (selector ? selector(storage.getStateSync()) : storage.getStateSync()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storage],
  )

  return useObservable<S | R>(observable, initial)
}
