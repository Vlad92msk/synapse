import { MutableRefObject, useEffect, useReducer, useRef } from 'react'

import { logError } from '../../_utils/error-handling.util'
import { IStorageBase } from '../../core'

export interface UseStorageRefOptions<R> {
  /**
   * Предикат «ререндерить ли». Вызывается на каждое изменение стора с предыдущим
   * и новым значением среза. Если возвращает `true` — компонент ререндерится
   * (значение в `ref` к этому моменту уже свежее). Если опция не передана —
   * ререндера не будет НИКОГДА (значение просто остаётся актуальным в `ref`).
   */
  shouldRerender?: (prev: R, next: R) => boolean
}

export interface StorageRef<R> {
  /** `ref.current` — всегда свежий срез, обновляется по подписке без ререндера */
  ref: MutableRefObject<R | undefined>
  /** Прочитать свежее значение по требованию (например, в обработчике события) */
  get: () => R | undefined
  /** Принудительно ререндерить компонент, когда он сам этого захочет */
  rerender: () => void
}

const identity = <S, R>(state: S): R => state as unknown as R

/**
 * Реактивное чтение хранилища БЕЗ автоматического ререндера.
 *
 * В отличие от {@link useStorageSubscribe}/`useSelector`/`useObservable`, которые
 * синхронизируют рендер с источником на каждое изменение, этот хук держит свежее
 * значение в `ref` и отдаёт контроль над ререндерами компоненту:
 *
 * - **«ререндер, когда я сам решу»** — читай `ref.current`/`get()` и зови
 *   `rerender()` в нужный момент;
 * - **«вообще без ререндера»** — просто `get()` в обработчике события/коллбэке;
 * - **«ререндер по условию»** — передай `options.shouldRerender(prev, next)`.
 *
 * Не использует `useSyncExternalStore` (он не умеет пропускать ререндер по
 * решению компонента), поэтому осознанно не даёт tearing-гарантий Concurrent
 * Mode — что приемлемо для сценария «я сам контролирую ререндеры». Не требует
 * RxJS.
 *
 * @template S - Тип состояния хранилища
 * @template R - Тип возвращаемого среза
 * @param storage - Экземпляр хранилища или null (до инициализации)
 * @param selector - Функция-селектор среза (по умолчанию — всё состояние)
 * @param options - Опции: `shouldRerender` (см. {@link UseStorageRefOptions})
 */
export function useStorageRef<S extends Record<string, any>, R = S>(
  storage: IStorageBase<S> | null,
  selector: (state: S) => R = identity as (state: S) => R,
  options?: UseStorageRefOptions<R>,
): StorageRef<R> {
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  const shouldRerenderRef = useRef(options?.shouldRerender)
  shouldRerenderRef.current = options?.shouldRerender

  const read = (s: IStorageBase<S>): R | undefined => {
    try {
      return selectorRef.current(s.getStateSync())
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        logError('useStorageRef: selector error', error, null, 'warn')
      }
      return undefined
    }
  }

  // Инициализируем синхронно из текущего состояния стора (lazy — один раз).
  const ref = useRef<R | undefined>(undefined)
  const initializedRef = useRef(false)
  if (!initializedRef.current) {
    ref.current = storage ? read(storage) : undefined
    initializedRef.current = true
  }

  const [, force] = useReducer((c: number) => c + 1, 0)

  useEffect(() => {
    if (!storage) {
      ref.current = undefined
      return
    }

    // На случай смены инстанса стора между рендерами — синхронизируем ref.
    ref.current = read(storage)

    return storage.subscribeToAll(() => {
      const prev = ref.current
      const next = read(storage)
      ref.current = next

      const shouldRerender = shouldRerenderRef.current
      if (shouldRerender && shouldRerender(prev as R, next as R)) {
        force()
      }
      // Без shouldRerender ничего не ререндерим — значение просто свежее в ref.
    })
  }, [storage])

  const refsHandle = useRef<StorageRef<R> | undefined>(undefined)
  if (!refsHandle.current) {
    refsHandle.current = {
      ref,
      get: () => ref.current,
      rerender: force,
    }
  }

  return refsHandle.current
}
