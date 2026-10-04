import { Observable } from 'rxjs'
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators'

import type { Subscribable } from '../../../core/observable/interop-observable'
import type { SelectorAPI } from '../../../core/selector/selector.interface'
import type { IStorageBase } from '../../../core/storage/storage.interface'

/**
 * Проверяет, является ли значение хранилищем (IStorageBase)
 */
export function isStorage(value: any): value is IStorageBase<any> {
  return value && typeof value === 'object' && typeof value.subscribeToAll === 'function' && typeof value.getState === 'function'
}

/** Селектор ли это (`SelectorAPI`: есть `$` и `getId`). */
function isSelectorApi(value: any): value is SelectorAPI<any> {
  return !!value && typeof value === 'object' && typeof value.getId === 'function' && !!value.$
}

/** Любой `subscribe`-источник (interop-поток ядра) → rxjs Observable. */
function fromSubscribable<T>(source: Subscribable<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = source.subscribe({
      next: (value) => subscriber.next(value),
      error: (error) => subscriber.error(error),
      complete: () => subscriber.complete(),
    })
    return () => subscription.unsubscribe()
  })
}

/**
 * Мост «ядро → rxjs»: превращает источник synapse в rxjs `Observable`.
 *
 * - **Хранилище** (`IStorageBase`) — поток состояния (или среза, см. ниже).
 * - **Селектор** (`SelectorAPI`) — поток значений селектора (`selector.$` как rxjs Observable).
 * - **Любой поток ядра** (`selector.$`, `dispatcher.action$`, вотчер `d.someWatcher()`,
 *   `synapse.state$`) — тот же поток, но с операторами rxjs.
 *
 * Ядро synapse не зависит от rxjs и отдаёт потоки в interop-формате (без `pipe`); этот хелпер —
 * точка входа в rxjs. Эквивалент — rxjs `from(x)`.
 *
 * Для хранилища:
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
export function toObservable<T>(selector: SelectorAPI<T>): Observable<T>
export function toObservable<T>(stream: Subscribable<T>): Observable<T>
export function toObservable<T extends Record<string, any>, R>(
  source: IStorageBase<T> | SelectorAPI<any> | Subscribable<any>,
  selector?: (state: T) => R,
  equals?: (a: R, b: R) => boolean,
): Observable<any> {
  if (!isStorage(source)) {
    return fromSubscribable(isSelectorApi(source) ? source.$ : (source as Subscribable<unknown>))
  }
  const storage = source
  const base = new Observable<T>((observer) => {
    observer.next(storage.getStateSync())

    const unsubscribe = storage.subscribeToAll(() => {
      observer.next(storage.getStateSync())
    })

    return () => unsubscribe()
  })

  // refCount: true — критично против утечки: при падении числа подписчиков до нуля
  // shareReplay отписывается от `base`, снимая регистрацию `storage.subscribeToAll`.
  // С дефолтным `shareReplay(1)` (refCount: false) источник остаётся подписан навсегда,
  // и каждый смонтированный поток копит слушателей на сторе до его destroy().
  // Безопасно: `base` синхронно эмитит текущее состояние (getStateSync) при каждой
  // новой подписке, так что поздний подписчик сразу получает актуальное значение.
  if (!selector) {
    return base.pipe(shareReplay({ bufferSize: 1, refCount: true }))
  }

  return base.pipe(map(selector), distinctUntilChanged(equals), shareReplay({ bufferSize: 1, refCount: true }))
}
