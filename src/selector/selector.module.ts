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
            console.error('DEBUG: Error in subscriber notification:', error)
          }
        })

        await Promise.all(promises)
      }
    } catch (error) {
      console.error('DEBUG: Error in notify():', error)
      throw error
    }
  }

  subscribe(subscriber: Subscriber<T>): () => void {
    this.subscribers.add(subscriber)

    // Сразу уведомляем о текущем значении
    this.notify().catch((error) => {
      console.error('DEBUG: Error in initial notification:', error)
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

export class SelectorModule {
  storageName: string

  private subscriptions = new Map<string, SelectorSubscription<any>>()

  constructor(
    private readonly source: IStorage,
    private readonly logger?: ILogger,
  ) {
    this.storageName = source.name
  }

  createSelector<S, T>(selector: Selector<S, T>, options?: SelectorOptions<T>): SelectorAPI<T>

  createSelector<Deps extends any[], T>(
    dependencies: Array<Selector<any, Deps[number]> | SelectorAPI<Deps[number]>>,
    resultFn: ResultFunction<Deps, T>,
    options?: SelectorOptions<T>,
  ): SelectorAPI<T>

  createSelector<S, T>(
    selectorOrDeps: Selector<S, T> | Array<SelectorAPI<any> | Selector<any, any>>,
    resultFnOrOptions?: ResultFunction<any[], T> | SelectorOptions<T>,
    options?: SelectorOptions<T>,
  ): SelectorAPI<T> {
    if (Array.isArray(selectorOrDeps)) {
      const deps: SelectorAPI<any>[] = selectorOrDeps.map((dep) => {
        if (typeof dep === 'function') {
          return this.createSimpleSelector(dep)
        }
        return dep
      })

      return this.createCombinedSelector(deps, resultFnOrOptions as ResultFunction<any[], T>, options || {})
    }

    return this.createSimpleSelector(selectorOrDeps, resultFnOrOptions as SelectorOptions<T>)
  }

  createSimpleSelector<S, T>(selector: Selector<S, T>, options: SelectorOptions<T> = {}): SelectorAPI<T> {
    const getState = async (): Promise<T> => {
      const state = await this.source.getState()
      const selectedValue = selector(state as S)
      return selectedValue
    }

    const subscription = new SelectorSubscription(getState, options.equals || ((a, b) => a === b), this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Упрощённая обработка событий
    const unsubscribe = this.source.subscribeToAll(async (event: any) => {
      if (event && event.type === 'storage:update') {
        // Сразу запускаем обновление без дополнительных проверок
        await subscription.notify()
      }
    })

    const api = {
      select: () => getState(),
      subscribe: (subscriber: Subscriber<T>) => {
        const unsub = subscription.subscribe(subscriber)

        return () => {
          unsub()
          // Не удаляем подписку на хранилище при отписке одного подписчика
          if (this.subscriptions.get(id)?.subscribers.size === 0) {
            this.subscriptions.delete(id)
            unsubscribe()
          }
        }
      },
    }

    return api
  }

  createCombinedSelector<T>(selectors: SelectorAPI<any>[], resultFn: (...args: any[]) => T, options: SelectorOptions<T> = {}): SelectorAPI<T> {
    const getState = async () => {
      const values = await Promise.all(
        selectors.map(async (s, index) => {
          const value = await s.select()
          return value
        }),
      )
      const result = resultFn(...values)
      return result
    }

    const subscription = new SelectorSubscription(getState, options.equals || ((a, b) => a === b), this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Set для отслеживания ожидающих обновлений
    let pendingUpdate = false
    const debouncedNotify = () => {
      if (!pendingUpdate) {
        pendingUpdate = true
        Promise.resolve().then(() => {
          pendingUpdate = false
          subscription.notify().catch((error) => {
            console.error('DEBUG: Error in combined notification:', error)
          })
        })
      }
    }

    // Подписываемся на все зависимости
    const unsubscribers = selectors.map((selector, index) =>
      selector.subscribe({
        notify: async (value) => {
          debouncedNotify()
        },
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
