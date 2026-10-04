import { DependencyList, useEffect, useRef, useState } from 'react'

import type { Subscribable } from '../../core/observable/interop-observable'

/**
 * Подписка на поток из компонента.
 *
 * `source` — любой поток с `subscribe` (rxjs `Observable`, поток ядра `selector.$` и т.п.), либо
 * фабрика `() => поток`, собирающая цепочку (`toObservable(sel).pipe(debounceTime(...))`) при
 * подписке. Сам хук rxjs не требует.
 *
 * До первого эмита возвращается `initialValue`. Подписка снимается на unmount и
 * пересоздаётся при смене `deps` (вся цепочка строится заново — актуально для
 * операторов с состоянием вроде `debounceTime`/`scan`). Если `deps` не переданы:
 * для прямого Observable цепочка пересоздаётся при смене ссылки `source`, для
 * фабрики — создаётся один раз.
 *
 * @template T тип значения потока
 */
export function useObservable<T>(source: Subscribable<T> | (() => Subscribable<T>), initialValue: T, deps?: DependencyList): T {
  const [value, setValue] = useState<T>(initialValue)

  // Держим source в ref, чтобы замыкание эффекта всегда читало актуальную фабрику,
  // но переподписка управлялась исключительно через deps.
  const sourceRef = useRef(source)
  sourceRef.current = source

  const effectDeps = deps ?? (typeof source === 'function' ? [] : [source])

  useEffect(() => {
    const current = sourceRef.current
    const observable = typeof current === 'function' ? (current as () => Subscribable<T>)() : current
    const subscription = observable.subscribe((next) => setValue(next))
    return () => subscription.unsubscribe()
  }, effectDeps)

  return value
}
