import { DependencyList, useEffect, useRef, useState } from 'react'
import { Observable } from 'rxjs'

/**
 * Подписка на Observable из компонента.
 *
 * `source` — либо готовый `Observable<T>` (например `selector.$`), либо фабрика
 * `() => Observable<T>`, собирающая цепочку (`pipe(debounceTime(...))`) при подписке.
 *
 * До первого эмита возвращается `initialValue`. Подписка снимается на unmount и
 * пересоздаётся при смене `deps` (вся цепочка строится заново — актуально для
 * операторов с состоянием вроде `debounceTime`/`scan`). Если `deps` не переданы:
 * для прямого Observable цепочка пересоздаётся при смене ссылки `source`, для
 * фабрики — создаётся один раз.
 *
 * @template T тип значения потока
 */
export function useObservable<T>(source: Observable<T> | (() => Observable<T>), initialValue: T, deps?: DependencyList): T {
  const [value, setValue] = useState<T>(initialValue)

  // Держим source в ref, чтобы замыкание эффекта всегда читало актуальную фабрику,
  // но переподписка управлялась исключительно через deps.
  const sourceRef = useRef(source)
  sourceRef.current = source

  const effectDeps = deps ?? (typeof source === 'function' ? [] : [source])

  useEffect(() => {
    const current = sourceRef.current
    const observable = typeof current === 'function' ? (current as () => Observable<T>)() : current
    const subscription = observable.subscribe((next) => setValue(next))
    return () => subscription.unsubscribe()
  }, effectDeps)

  return value
}
