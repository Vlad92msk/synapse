import { ILogger, IStorage } from '../storage'
import { ISelectorModule, Selector, SelectorAPI, SelectorOptions, Subscriber } from './selector.interface'

// Отладка: управление через параметр DEBUG
const DEBUG = true

// Глобальный кеш селекторов (используем имя селектора как ключ)
const GLOBAL_SELECTOR_CACHE = new Map<
  string,
  {
    api: SelectorAPI<any>
    refCount: number
    unsubscribeFunctions: Array<() => void>
  }
>()

class SelectorSubscription<T> {
  private readonly id: string
  readonly subscribers = new Set<Subscriber<T>>()
  private lastValue?: T

  constructor(
    private readonly name: string,
    public readonly getState: () => Promise<T>,
    private readonly equals: (a: T, b: T) => boolean,
    private readonly logger?: ILogger,
  ) {
    this.id = name // Используем name в качестве id напрямую

    if (DEBUG) {
      console.log(`[${this.id}] Created new SelectorSubscription`)
    }
  }

  async notify(): Promise<void> {
    try {
      const newValue = await this.getState()

      // Проверка на изменение значения
      if (this.lastValue === undefined || !this.equals(newValue, this.lastValue)) {
        if (DEBUG) {
          console.log(`[${this.id}] Value changed in notify()`, {
            old: this.lastValue,
            new: newValue,
          })
        }

        this.lastValue = newValue

        const promises = Array.from(this.subscribers).map(async (subscriber) => {
          try {
            await subscriber.notify(newValue)
          } catch (error) {
            this.logger?.error(`[${this.id}] Error in subscriber notification`, { error })
          }
        })

        await Promise.all(promises)
      } else if (DEBUG) {
        console.log(`[${this.id}] Value unchanged in notify(), skipping notifications`)
      }
    } catch (error: any) {
      this.logger?.error(`[${this.id}] Error in notify()`, { error })
      throw error
    }
  }

  subscribe(subscriber: Subscriber<T>): () => void {
    if (DEBUG) {
      console.log(`[${this.id}] New subscriber added, total: ${this.subscribers.size + 1}`)
    }

    this.subscribers.add(subscriber)

    // Отправляем текущее значение, если оно есть
    if (this.lastValue !== undefined) {
      // Используем микротаск для асинхронности
      Promise.resolve().then(() => {
        try {
          subscriber.notify(this.lastValue as T)
        } catch (error) {
          this.logger?.error(`[${this.id}] Error in initial notification`, { error })
        }
      })
    } else {
      // Если значения нет - запрашиваем его
      this.notify().catch((error) => {
        this.logger?.error(`[${this.id}] Error in initial notification`, { error })
      })
    }

    return () => {
      if (DEBUG) {
        console.log(`[${this.id}] Subscriber removed, remaining: ${this.subscribers.size - 1}`)
      }
      this.subscribers.delete(subscriber)
    }
  }

  cleanup(): void {
    if (DEBUG) {
      console.log(`[${this.id}] Cleaning up subscription, had ${this.subscribers.size} subscribers`)
    }
    this.subscribers.clear()
    this.lastValue = undefined
  }

  getId(): string {
    return this.id
  }
}

export class SelectorModule<S extends Record<string, any>> implements ISelectorModule<S> {
  storageName: string

  private subscriptions = new Map<string, SelectorSubscription<any>>()
  private cachedState?: S // Кеш текущего состояния

  private localSelectorCache = new Map<
    string,
    {
      api: SelectorAPI<any>
      dependencies?: SelectorAPI<any>[]
      unsubscribeFunctions: Array<() => void>
    }
  >()

  constructor(
    private readonly source: IStorage<S>,
    private readonly logger?: ILogger,
  ) {
    this.storageName = source.name

    if (DEBUG) {
      console.log(`Created SelectorModule for storage: ${this.storageName}`)
    }

    // Сразу получаем начальное состояние для кеширования
    this.source.getState().then((state) => {
      this.cachedState = state
      if (DEBUG) {
        console.log(`Cached initial state for ${this.storageName}`)
      }
    })
  }

  createSelector<T>(selector: Selector<S, T>, options: SelectorOptions<T>): SelectorAPI<T>

  createSelector<Deps extends unknown[], T>(dependencies: { [K in keyof Deps]: SelectorAPI<Deps[K]> }, resultFn: (...args: Deps) => T, options: SelectorOptions<T>): SelectorAPI<T>

  createSelector<T>(
    selectorOrDeps: Selector<S, T> | SelectorAPI<any>[],
    resultFnOrOptions: ((...args: any[]) => T) | SelectorOptions<T>,
    optionsArg?: SelectorOptions<T>,
  ): SelectorAPI<T> {
    // Определяем, какую перегрузку используем
    const isSimpleSelector = !Array.isArray(selectorOrDeps)

    // Извлекаем options
    const options = isSimpleSelector ? (resultFnOrOptions as SelectorOptions<T>) : (optionsArg as SelectorOptions<T>)

    // Проверяем наличие обязательного name
    if (!options || !options.name) {
      throw new Error('Selector name is required')
    }

    const selectorId = options.name

    // Проверяем локальный кеш
    if (this.localSelectorCache.has(selectorId)) {
      if (DEBUG) {
        console.log(`[${this.storageName}] Reusing cached selector: ${selectorId}`)
      }
      return this.localSelectorCache.get(selectorId)!.api
    }

    // Проверяем глобальный кеш
    if (GLOBAL_SELECTOR_CACHE.has(selectorId)) {
      const cached = GLOBAL_SELECTOR_CACHE.get(selectorId)!
      cached.refCount++
      if (DEBUG) {
        console.log(`[${this.storageName}] Reusing global cached selector: ${selectorId}, refCount: ${cached.refCount}`)
      }
      return cached.api
    }

    // Создаем новый селектор
    let result: SelectorAPI<T>
    let dependencies: SelectorAPI<any>[] | undefined
    let unsubscribeFunctions: Array<() => void> = []

    if (isSimpleSelector) {
      // Простой селектор
      const created = this.createSimpleSelector(selectorOrDeps as Selector<S, T>, options)
      result = created.api
      unsubscribeFunctions = created.unsubscribeFunctions
    } else {
      // Комбинированный селектор
      dependencies = selectorOrDeps as SelectorAPI<any>[]
      const created = this.createCombinedSelector(dependencies, resultFnOrOptions as (...args: any[]) => T, options)
      result = created.api
      unsubscribeFunctions = created.unsubscribeFunctions
    }

    // Сохраняем в кеши
    this.localSelectorCache.set(selectorId, {
      api: result,
      dependencies,
      unsubscribeFunctions,
    })

    GLOBAL_SELECTOR_CACHE.set(selectorId, {
      api: result,
      refCount: 1,
      unsubscribeFunctions,
    })

    if (DEBUG) {
      console.log(`[${this.storageName}] Created new selector: ${selectorId}`)
    }

    return result
  }

  private createSimpleSelector<T>(
    selector: Selector<S, T>,
    options: SelectorOptions<T>,
  ): {
    api: SelectorAPI<T>
    unsubscribeFunctions: Array<() => void>
  } {
    if (DEBUG) {
      console.log(`[${this.storageName}] Creating simple selector with name: ${options.name}`)
    }

    // Функция для получения данных
    const getState = async (): Promise<T> => {
      // Используем кешированное состояние, если оно доступно
      if (this.cachedState) {
        return selector(this.cachedState as S)
      }

      // Иначе получаем его из хранилища
      const state = await this.source.getState()
      this.cachedState = state // Обновляем кеш
      return selector(state as S)
    }

    const subscription = new SelectorSubscription(options.name, getState, options.equals || ((a, b) => a === b), this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Подписка на обновления хранилища
    const unsubscribeFromStorage = this.source.subscribeToAll(async (event: any) => {
      if (event?.type === 'storage:update') {
        if (DEBUG) {
          console.log(`[${id}] Storage update event received`)
        }

        // Получаем новое состояние и обновляем кеш
        const newState = await this.source.getState()
        this.cachedState = newState

        // Уведомляем подписчиков
        await subscription.notify()
      }
    })

    const unsubscribeFunctions = [unsubscribeFromStorage]

    return {
      api: {
        select: () => getState(),
        subscribe: (subscriber) => {
          return subscription.subscribe(subscriber)
        },
        getId: () => id,
      },
      unsubscribeFunctions,
    }
  }

  private createCombinedSelector<Deps extends unknown[], T>(
    selectors: { [K in keyof Deps]: SelectorAPI<Deps[K]> },
    resultFn: (...args: Deps) => T,
    options: SelectorOptions<T>,
  ): {
    api: SelectorAPI<T>
    unsubscribeFunctions: Array<() => void>
  } {
    const getState = async () => {
      const values = await Promise.all(selectors.map((s) => s.select()))
      return resultFn(...(values as Deps))
    }

    const subscription = new SelectorSubscription(options.name, getState, options.equals || ((a, b) => a === b), this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Создаем подписки на зависимости
    const unsubscribeFunctions = selectors.map((selector) =>
      selector.subscribe({
        notify: () => {
          // При изменении любой зависимости, обновляем значение
          subscription.notify().catch((error) => this.logger?.error(`[${id}] Error in combined notification:`, { error }))
        },
      }),
    )

    return {
      api: {
        select: () => getState(),
        subscribe: (subscriber) => {
          return subscription.subscribe(subscriber)
        },
        getId: () => id,
      },
      unsubscribeFunctions,
    }
  }

  destroy(): void {
    if (DEBUG) {
      console.log(`[${this.storageName}] Destroying SelectorModule`)
    }

    // Очищаем все подписки
    this.subscriptions.forEach((sub) => sub.cleanup())
    this.subscriptions.clear()

    // Очищаем кеш состояния
    this.cachedState = undefined

    // Очищаем подписки из локального кеша
    this.localSelectorCache.forEach((cached) => {
      cached.unsubscribeFunctions.forEach((unsub) => unsub())
    })

    // Собираем ключи для глобального кеша
    const keysToCheck = new Set<string>()
    this.localSelectorCache.forEach((_, key) => {
      keysToCheck.add(key)
    })
    this.localSelectorCache.clear()

    // Уменьшаем счетчики ссылок в глобальном кеше
    keysToCheck.forEach((key) => {
      const globalCached = GLOBAL_SELECTOR_CACHE.get(key)
      if (globalCached) {
        globalCached.refCount--
        if (globalCached.refCount <= 0) {
          globalCached.unsubscribeFunctions.forEach((unsub) => unsub())
          GLOBAL_SELECTOR_CACHE.delete(key)

          if (DEBUG) {
            console.log(`[${this.storageName}] Removed selector from global cache: ${key}`)
          }
        }
      }
    })
  }
}
