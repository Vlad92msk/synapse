import type { IStorageBase } from '../storage/storage.interface'
import { type InteropObservable, SimpleObservable } from './interop-observable'

/**
 * Поток состояния хранилища без rxjs: синхронно отдаёт текущее состояние при подписке
 * (`getStateSync`) и далее — на каждое изменение. Каждая подписка — своя регистрация
 * `subscribeToAll`, снимаемая при отписке.
 *
 * Это `synapse.state$` ядра. Нужны операторы — `toObservable(storage)` из `synapse-storage/reactive`.
 */
export function storageStream<T extends Record<string, any>>(storage: IStorageBase<T>): InteropObservable<T> {
  return new SimpleObservable<T>((observer) => {
    observer.next(storage.getStateSync())
    return storage.subscribeToAll(() => observer.next(storage.getStateSync()))
  })
}
