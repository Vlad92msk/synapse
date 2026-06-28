import { Observable } from 'rxjs'
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators'

import { IStorageBase } from '../../../core'

/**
 * Конвертирует хранилище (IStorageBase) в Observable потока состояния.
 *
 * Без `selector` поток эмитит всё состояние `T` на каждое изменение хранилища.
 * С `selector` поток эмитит только выбранный срез и через `distinctUntilChanged`
 * пропускает повторы (по умолчанию сравнение по `Object.is`, либо переданным
 * `equals`) — компонент/эффект получает значение только когда срез реально менялся.
 *
 * @example
 * ```ts
 * import { toObservable } from 'synapse-storage/reactive'
 *
 * const auth$ = toObservable(authStorage)
 *
 * // Использование в createEffectConfig
 * createEffectConfig: () => ({
 *   externalStates: { auth: auth$ },
 * })
 *
 * // Поток только по срезу (эмитит лишь при изменении user.id):
 * const userId$ = toObservable(authStorage, (s) => s.user.id)
 * ```
 */
export function toObservable<T extends Record<string, any>>(storage: IStorageBase<T>): Observable<T>
export function toObservable<T extends Record<string, any>, R>(storage: IStorageBase<T>, selector: (state: T) => R, equals?: (a: R, b: R) => boolean): Observable<R>
export function toObservable<T extends Record<string, any>, R>(storage: IStorageBase<T>, selector?: (state: T) => R, equals?: (a: R, b: R) => boolean): Observable<T | R> {
  const base = new Observable<T>((observer) => {
    observer.next(storage.getStateSync())

    const unsubscribe = storage.subscribeToAll(() => {
      observer.next(storage.getStateSync())
    })

    return () => unsubscribe()
  })

  if (!selector) {
    return base.pipe(shareReplay(1))
  }

  return base.pipe(map(selector), distinctUntilChanged(equals), shareReplay(1))
}

/**
 * Проверяет, является ли значение хранилищем (IStorageBase)
 */
export function isStorage(value: any): value is IStorageBase<any> {
  return value && typeof value === 'object' && typeof value.subscribeToAll === 'function' && typeof value.getState === 'function'
}
