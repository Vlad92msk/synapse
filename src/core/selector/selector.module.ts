import { ILogger, IStorage } from '../storage'
import { ISelectorModule, Selector, SelectorAPI, SelectorOptions, Subscriber } from './selector.interface'

// Отладка: управление через параметр DEBUG
const DEBUG = false

// Глобальный кеш селекторов
const GLOBAL_SELECTOR_CACHE = new Map<
  string,
  {
    api: SelectorAPI<any>
    refCount: number
    permanentSubscriptions?: Array<() => void>
  }
>()

class SelectorSubscription<T> {
  private readonly id: string
  readonly subscribers = new Set<Subscriber<T>>()
  private lastValue?: T
  private lastState?: any // Кеш последнего состояния для предотвращения повторных вычислений
  private pendingNotification = false // Флаг для предотвращения каскадных уведомлений
  private readonly selector?: (state: any) => T // Функция селектора

  constructor(
    public readonly getState: () => Promise<T>,
    private readonly equals: (a: T, b: T) => boolean,
    private readonly logger?: ILogger,
    selectorFn?: (state: any) => T, // Опционально сохраняем селектор для оптимизации
  ) {
    this.id = `selector_${Date.now()}_${Math.random().toString(36).slice(2)}`
    this.selector = selectorFn

    if (DEBUG) {
      console.log(`[${this.id}] Created new SelectorSubscription`)
    }
  }

  // Метод для прямого обновления на основе состояния без повторных вычислений
  async updateWithState(state: any): Promise<void> {
    if (!this.selector) return this.notify()

    try {
      // Если состояние не изменилось, пропускаем обновление
      if (this.lastState === state) {
        if (DEBUG) console.log(`[${this.id}] Skip update - same state reference`)
        return
      }

      // Обновляем последнее состояние
      this.lastState = state

      // Вычисляем новое значение с помощью селектора
      const newValue = this.selector(state)

      // Проверяем, изменилось ли значение
      if (this.lastValue === undefined || !this.equals(newValue, this.lastValue)) {
        this.lastValue = newValue

        if (DEBUG) {
          console.log(`[${this.id}] Value changed, notifying subscribers`, {
            subscribers: this.subscribers.size,
            value: newValue,
          })
        }

        // Уведомляем подписчиков
        const promises = Array.from(this.subscribers).map(async (subscriber) => {
          try {
            await subscriber.notify(newValue)
          } catch (error) {
            // @ts-ignore
            this.logger?.error(`[${this.id}] Error notifying subscriber`, error)
          }
        })

        await Promise.all(promises)
      } else if (DEBUG) {
        console.log(`[${this.id}] Value unchanged, skipping notifications`)
      }
    } catch (error) {
      // @ts-ignore
      this.logger?.error(`[${this.id}] Error in updateWithState`, error)
      throw error
    }
  }

  async notify(): Promise<void> {
    // Предотвращаем вложенные вызовы notify()
    if (this.pendingNotification) {
      if (DEBUG) console.log(`[${this.id}] Notification already in progress, skipping`)
      return
    }

    this.pendingNotification = true

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
            // @ts-ignore
            this.logger?.error(`[${this.id}] Error in subscriber notification`, error)
          }
        })

        await Promise.all(promises)
      } else if (DEBUG) {
        console.log(`[${this.id}] Value unchanged in notify(), skipping notifications`)
      }
    } catch (error: any) {
      this.logger?.error(`[${this.id}] Error in notify()`, error)
      throw error
    } finally {
      this.pendingNotification = false
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
          // @ts-ignore
          this.logger?.error(`[${this.id}] Error in initial notification`, error)
        }
      })
    } else {
      // Если значения нет - запрашиваем его
      this.notify().catch((error) => {
        this.logger?.error(`[${this.id}] Error in initial notification`, error)
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
    this.lastState = undefined
  }

  getId(): string {
    return this.id
  }
}

// Создаем мемоизированную версию селектора
function memoizeSelector<S, T>(selector: (state: S) => T, equals: (a: T, b: T) => boolean = (a, b) => a === b): (state: S) => T {
  let lastState: S | undefined
  let lastResult: T | undefined
  let hasResult = false

  // Счетчик для отладки
  let callCount = 0

  return (state: S): T => {
    callCount++

    // Проверяем изменение состояния по ссылке
    if (hasResult && lastState === state) {
      if (DEBUG) {
        console.log(`Memoized selector reused cached value (call #${callCount})`)
      }
      return lastResult as T
    }

    // Вычисляем новое значение
    const result = selector(state)

    // Если у нас есть предыдущий результат, проверяем равенство
    if (hasResult && equals(result, lastResult as T)) {
      if (DEBUG) {
        console.log(`Memoized selector values equal after calculation (call #${callCount})`)
      }
      // Обновляем ссылку на состояние, но сохраняем прежний результат
      lastState = state
      return lastResult as T
    }

    // Полностью обновляем кеш
    if (DEBUG) {
      console.log(`Memoized selector calculated new value (call #${callCount})`)
    }
    lastState = state
    lastResult = result
    hasResult = true
    return result
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
      permanentSubscriptions?: Array<() => void>
      memoizedSelector?: (state: S) => any // Мемоизированная версия селектора
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

  private generateSelectorKey(selectorOrDeps: Selector<S, any> | SelectorAPI<any>[], resultFnOrOptions?: ((...args: any[]) => any) | SelectorOptions<any>): string {
    const typePrefix = Array.isArray(selectorOrDeps) ? 'combined' : 'simple'

    if (Array.isArray(selectorOrDeps)) {
      const depsIds = selectorOrDeps.map((s) => s.toString()).join('|')
      const fnHash = resultFnOrOptions ? resultFnOrOptions.toString().substring(0, 50) : ''
      return `${typePrefix}:${this.storageName}:${depsIds}:${fnHash}`
    } else {
      const fnHash = selectorOrDeps.toString().substring(0, 100)
      return `${typePrefix}:${this.storageName}:${fnHash}`
    }
  }

  createSelector<T>(selector: Selector<S, T>, options?: SelectorOptions<T>): SelectorAPI<T>

  createSelector<Deps extends unknown[], T>(dependencies: { [K in keyof Deps]: SelectorAPI<Deps[K]> }, resultFn: (...args: Deps) => T, options?: SelectorOptions<T>): SelectorAPI<T>

  createSelector<T>(
    selectorOrDeps: Selector<S, T> | SelectorAPI<any>[],
    resultFnOrOptions?: ((...args: any[]) => T) | SelectorOptions<T>,
    options?: SelectorOptions<T>,
  ): SelectorAPI<T> {
    const cacheKey = this.generateSelectorKey(selectorOrDeps, resultFnOrOptions)

    // Проверяем локальный кеш
    if (this.localSelectorCache.has(cacheKey)) {
      if (DEBUG) {
        console.log(`[${this.storageName}] Reusing cached selector: ${cacheKey}`)
      }
      return this.localSelectorCache.get(cacheKey)!.api
    }

    // Проверяем глобальный кеш
    if (GLOBAL_SELECTOR_CACHE.has(cacheKey)) {
      const cached = GLOBAL_SELECTOR_CACHE.get(cacheKey)!
      cached.refCount++
      if (DEBUG) {
        console.log(`[${this.storageName}] Reusing global cached selector: ${cacheKey}, refCount: ${cached.refCount}`)
      }
      return cached.api
    }

    // Создаем новый селектор
    let result: SelectorAPI<T>
    let dependencies: SelectorAPI<any>[] | undefined
    let permanentSubscriptions: Array<() => void> | undefined
    let memoizedSelector: ((state: S) => any) | undefined

    if (Array.isArray(selectorOrDeps)) {
      dependencies = selectorOrDeps
      const created = this.createCombinedSelector(selectorOrDeps, resultFnOrOptions as (...args: any[]) => T, options || {})
      result = created.api
      permanentSubscriptions = created.permanentSubscriptions
    } else {
      // Создаем мемоизированную версию селектора
      memoizedSelector = memoizeSelector(selectorOrDeps, (options as SelectorOptions<T>)?.equals)

      const created = this.createSimpleSelector(
        memoizedSelector, // Используем мемоизированную версию
        resultFnOrOptions as SelectorOptions<T>,
        selectorOrDeps, // Сохраняем оригинальный селектор для отладки
      )

      result = created.api
      permanentSubscriptions = created.permanentSubscriptions
    }

    // Сохраняем в кеши
    this.localSelectorCache.set(cacheKey, {
      api: result,
      dependencies,
      permanentSubscriptions,
      memoizedSelector,
    })

    GLOBAL_SELECTOR_CACHE.set(cacheKey, {
      api: result,
      refCount: 1,
      permanentSubscriptions,
    })

    if (DEBUG) {
      console.log(`[${this.storageName}] Created new selector: ${cacheKey}`)
    }

    return result
  }

  private createSimpleSelector<T>(
    selector: Selector<S, T>,
    options: SelectorOptions<T> = {},
    originalSelector?: Selector<S, T>, // Оригинальный селектор для отладки
  ): {
    api: SelectorAPI<T>
    permanentSubscriptions: Array<() => void>
  } {
    if (DEBUG && originalSelector) {
      console.log(`[${this.storageName}] Creating simple selector with:`, originalSelector.toString().slice(0, 50))
    }

    // Оптимизированный getState с использованием кеша состояния
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

    const subscription = new SelectorSubscription(
      getState,
      options.equals || ((a, b) => a === b),
      this.logger,
      selector, // Передаем селектор в подписку
    )

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

        // Используем оптимизированный метод с передачей состояния
        await (subscription as any).updateWithState(newState)
      }
    })

    const permanentSubscriptions = [unsubscribeFromStorage]

    return {
      api: {
        select: () => getState(),
        subscribe: (subscriber) => {
          return subscription.subscribe(subscriber)
        },
        // @ts-ignore
        toString: () => id,
      },
      permanentSubscriptions,
    }
  }

  private createCombinedSelector<Deps extends unknown[], T>(
    selectors: { [K in keyof Deps]: SelectorAPI<Deps[K]> },
    resultFn: (...args: Deps) => T,
    options: SelectorOptions<T> = {},
  ): {
    api: SelectorAPI<T>
    permanentSubscriptions: Array<() => void>
  } {
    // Мемоизируем функцию результата
    const memoizedResultFn = memoizeSelector((values: Deps) => resultFn(...values), options.equals)

    // Последние значения зависимостей для оптимизации
    const lastDependencyValues: any[] = []
    let hasInitialValues = false

    const getState = async () => {
      const values = await Promise.all(selectors.map((s) => s.select()))

      // Сохраняем значения для оптимизации
      if (!hasInitialValues) {
        for (let i = 0; i < values.length; i++) {
          lastDependencyValues[i] = values[i]
        }
        hasInitialValues = true
      }

      // Используем мемоизированную функцию для вычисления результата
      return memoizedResultFn(values as Deps)
    }

    const subscription = new SelectorSubscription(getState, options.equals || ((a, b) => a === b), this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Оптимизация: отслеживаем, когда последний раз обновлялся селектор
    let lastUpdateTime = 0
    const UPDATE_THROTTLE = 16 // ~60fps

    // Функция для дебаунсинга обновлений
    let updateTimeoutId: any = null
    const scheduleUpdate = () => {
      const now = Date.now()

      // Если прошло достаточно времени, обновляем сразу
      if (now - lastUpdateTime > UPDATE_THROTTLE) {
        if (updateTimeoutId) {
          clearTimeout(updateTimeoutId)
          updateTimeoutId = null
        }

        lastUpdateTime = now
        subscription.notify().catch((error) => this.logger?.error(`[${id}] Error in combined notification:`, error))
      }
      // Иначе планируем отложенное обновление
      else if (!updateTimeoutId) {
        updateTimeoutId = setTimeout(() => {
          updateTimeoutId = null
          lastUpdateTime = Date.now()
          subscription.notify().catch((error) => this.logger?.error(`[${id}] Error in combined notification:`, error))
        }, UPDATE_THROTTLE)
      }
    }

    // Создаем постоянные подписки на зависимости
    const permanentSubscriptions = selectors.map((selector, index) =>
      selector.subscribe({
        notify: async (newValue) => {
          // Проверяем, изменилось ли значение
          if (hasInitialValues && lastDependencyValues[index] === newValue) {
            if (DEBUG) {
              console.log(`[${id}] Dependency ${index} value unchanged, skipping update`)
            }
            return
          }

          // Обновляем значение в кеше
          lastDependencyValues[index] = newValue

          if (DEBUG) {
            console.log(`[${id}] Dependency ${index} changed, scheduling update`)
          }

          // Планируем обновление
          scheduleUpdate()
        },
      }),
    )

    return {
      api: {
        select: () => getState(),
        subscribe: (subscriber) => {
          return subscription.subscribe(subscriber)
        },
        // @ts-ignore
        toString: () => id,
      },
      permanentSubscriptions,
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

    // Очищаем постоянные подписки из локального кеша
    this.localSelectorCache.forEach((cached) => {
      cached.permanentSubscriptions?.forEach((unsub) => unsub())
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
          globalCached.permanentSubscriptions?.forEach((unsub) => unsub())
          GLOBAL_SELECTOR_CACHE.delete(key)

          if (DEBUG) {
            console.log(`[${this.storageName}] Removed selector from global cache: ${key}`)
          }
        }
      }
    })
  }
}
