import { ILogger, IStorage } from '../storage/storage.interface'
import { ResultFunction, Selector, SelectorAPI, SelectorOptions, Subscriber } from './selector.interface'

class SelectorSubscription<T> {
  private readonly id: string

  readonly subscribers = new Set<Subscriber<T>>()

  private lastValue?: T

  constructor(
    public readonly getState: () => Promise<T>,
    private readonly equals: (a: T, b: T) => boolean,
    private readonly logger?: ILogger,
  ) {
    this.id = `selector_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }

  async notify(): Promise<void> {
    try {
      const newValue = await this.getState()

      // Всегда уведомляем при undefined или изменении значения
      if (this.lastValue === undefined || !this.equals(newValue, this.lastValue)) {
        this.lastValue = newValue

        const promises = Array.from(this.subscribers).map(async (subscriber) => {
          try {
            await subscriber.notify(newValue)
          } catch (error) {
            this.logger?.error('Ошибка в уведомлении подписчика')
          }
        })

        await Promise.all(promises)
      }
    } catch (error: any) {
      this.logger?.error('Ошибка в методе notify()', error)
      throw error
    }
  }

  subscribe(subscriber: Subscriber<T>): () => void {
    this.subscribers.add(subscriber)

    // Сразу уведомляем о текущем значении
    this.notify().catch((error) => {
      this.logger?.error('Ошибка в первоначальном уведомлении', error)
    })

    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  cleanup(): void {
    this.subscribers.clear()
    this.lastValue = undefined
  }

  getId(): string {
    return this.id
  }
}

export class SelectorModule<S extends Record<string, any>> {
  storageName: string

  private subscriptions = new Map<string, SelectorSubscription<any>>()

  constructor(
    private readonly source: IStorage<S>,
    private readonly logger?: ILogger,
  ) {
    this.storageName = source.name
  }

  createSelector<T>(selector: Selector<S, T>, options?: SelectorOptions<T>): SelectorAPI<T>

  createSelector<Deps extends unknown[], T>(dependencies: { [K in keyof Deps]: SelectorAPI<Deps[K]> }, resultFn: (...args: Deps) => T, options?: SelectorOptions<T>): SelectorAPI<T>

  createSelector<T>(
    selectorOrDeps: Selector<S, T> | SelectorAPI<any>[],
    resultFnOrOptions?: ((...args: any[]) => T) | SelectorOptions<T>,
    options?: SelectorOptions<T>,
  ): SelectorAPI<T> {
    if (Array.isArray(selectorOrDeps)) {
      return this.createCombinedSelector(selectorOrDeps, resultFnOrOptions as (...args: any[]) => T, options || {})
    }

    return this.createSimpleSelector(selectorOrDeps, resultFnOrOptions as SelectorOptions<T>)
  }

  private createSimpleSelector<T>(selector: Selector<S, T>, options: SelectorOptions<T> = {}): SelectorAPI<T> {
    const getState = async (): Promise<T> => {
      const state = await this.source.getState()
      return selector(state as S)
    }

    const subscription = new SelectorSubscription(getState, options.equals || ((a, b) => a === b), this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    const unsubscribe = this.source.subscribeToAll(async (event: any) => {
      if (event?.type === 'storage:update') {
        await subscription.notify()
      }
    })

    return {
      select: () => getState(),
      subscribe: (subscriber) => {
        const unsub = subscription.subscribe(subscriber)

        return () => {
          unsub()
          if (this.subscriptions.get(id)?.subscribers.size === 0) {
            this.subscriptions.delete(id)
            unsubscribe()
          }
        }
      },
    }
  }

  private createCombinedSelector<Deps extends unknown[], T>(
    selectors: { [K in keyof Deps]: SelectorAPI<Deps[K]> },
    resultFn: (...args: Deps) => T,
    options: SelectorOptions<T> = {},
  ): SelectorAPI<T> {
    const getState = async () => {
      const values = await Promise.all(selectors.map((s) => s.select()))
      return resultFn(...(values as Deps))
    }

    const subscription = new SelectorSubscription(getState, options.equals || ((a, b) => a === b), this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    let pendingUpdate = false
    const debouncedNotify = () => {
      if (!pendingUpdate) {
        pendingUpdate = true
        Promise.resolve().then(() => {
          pendingUpdate = false
          subscription.notify().catch((error) => console.error('DEBUG: Error in combined notification:', error))
        })
      }
    }

    const unsubscribers = selectors.map((selector) =>
      selector.subscribe({
        notify: async () => debouncedNotify(),
      }),
    )

    return {
      select: () => getState(),
      subscribe: (subscriber) => {
        const unsub = subscription.subscribe(subscriber)

        return () => {
          unsub()
          if (this.subscriptions.get(id)?.subscribers.size === 0) {
            this.subscriptions.delete(id)
            unsubscribers.forEach((unsubscribe) => unsubscribe())
          }
        }
      },
    }
  }

  destroy(): void {
    this.subscriptions.forEach((sub) => sub.cleanup())
    this.subscriptions.clear()
  }
}
