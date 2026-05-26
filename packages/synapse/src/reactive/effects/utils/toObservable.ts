import { Observable } from 'rxjs'
import { shareReplay } from 'rxjs/operators'

import { IStorageBase } from '../../../core'

/**
 * Конвертирует хранилище (IStorageBase) в Observable потока состояния.
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
 * ```
 */
export function toObservable<T extends Record<string, any>>(storage: IStorageBase<T>): Observable<T> {
  return new Observable<T>((observer) => {
    observer.next(storage.getStateSync())

    const unsubscribe = storage.subscribeToAll(() => {
      observer.next(storage.getStateSync())
    })

    return () => unsubscribe()
  }).pipe(shareReplay(1))
}

/**
 * Проверяет, является ли значение хранилищем (IStorageBase)
 */
export function isStorage(value: any): value is IStorageBase<any> {
  return value && typeof value === 'object' && typeof value.subscribeToAll === 'function' && typeof value.getState === 'function'
}
