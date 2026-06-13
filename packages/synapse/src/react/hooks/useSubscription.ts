import { DependencyList, useEffect } from 'react'
import { Unsubscribable } from 'rxjs'

/**
 * Императивная подписка-side-effect без возврата значения в рендер.
 *
 * `factory` создаёт подписку (`source$.subscribe(...)`) — её side-effect'ы (логирование,
 * императивные вызовы, диспатч) живут внутри коллбэка `subscribe`. Возвращённый
 * `Unsubscribable` снимается на unmount и при смене `deps` (перед созданием новой
 * подписки).
 *
 * В отличие от `useObservable`, ничего не рендерит — только запускает и гасит подписку.
 */
export function useSubscription(factory: () => Unsubscribable, deps: DependencyList): void {
  useEffect(() => {
    const subscription = factory()
    return () => subscription.unsubscribe()
  }, deps)
}
