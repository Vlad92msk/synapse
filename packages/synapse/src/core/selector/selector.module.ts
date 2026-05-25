import type { ILogger, IStorage, StorageInitStatus } from '../storage'
import { StorageStatus } from '../storage'
import type { ISelectorModule, Selector, SelectorAPI, SelectorOptions, Subscriber } from './selector.interface'

/**
 * Reference equality (===) — поведение по умолчанию
 */
function defaultEquals<T>(a: T, b: T): boolean {
  return a === b
}

const MAX_DEEP_EQUAL_DEPTH = 10

/**
 * Глубокое сравнение объектов по структуре с защитой от циклических ссылок и лимитом глубины.
 * Используется только при явной передаче через options.equals.
 */
export function deepEquals<T>(a: T, b: T, depth = 0, visited = new WeakSet()): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (depth > MAX_DEEP_EQUAL_DEPTH) return false

  if (typeof a !== 'object') return a === b

  // Защита от циклических ссылок
  if (visited.has(a as object)) return false
  visited.add(a as object)

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i], depth + 1, visited)) return false
    }
    return true
  }

  if (Array.isArray(a) || Array.isArray(b)) return false

  const keysA = Object.keys(a as object)
  const keysB = Object.keys(b as object)

  if (keysA.length !== keysB.length) return false

  return keysA.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    return deepEquals((a as any)[key], (b as any)[key], depth + 1, visited)
  })
}

/**
 * Оборачивает state в Proxy для отслеживания обращений к ключам верхнего уровня.
 * Возвращает проксированный state и Set с именами ключей, к которым обратился селектор.
 */
function trackDependencies<S extends Record<string, any>>(state: S): { proxy: S; accessedKeys: Set<string> } {
  const accessedKeys = new Set<string>()

  const proxy = new Proxy(state, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        accessedKeys.add(prop)
      }
      return Reflect.get(target, prop, receiver)
    },
  })

  return { proxy, accessedKeys }
}

// Мемоизирует функцию селектора для оптимизации + трекинг зависимостей через Proxy
function memoizeSelector<S extends Record<string, any>, R>(
  selectorFn: (state: S) => R,
  equals: (a: R, b: R) => boolean = defaultEquals,
): { memoized: (state: S) => R; getTrackedKeys: () => Set<string> | null } {
  let lastState: S | undefined
  let lastResult: R | undefined
  let hasResult = false
  let trackedKeys: Set<string> | null = null

  const memoized = function (state: S): R {
    // Если это первый вызов или состояние изменилось
    if (!hasResult || lastState !== state) {
      // Трекаем зависимости через Proxy при каждом реальном пересчёте
      const { proxy, accessedKeys } = trackDependencies(state)
      const newResult = selectorFn(proxy)
      trackedKeys = accessedKeys

      // Проверяем, изменился ли результат
      if (!hasResult || !equals(newResult, lastResult as R)) {
        lastResult = newResult
      }

      lastState = state
      hasResult = true
    }

    return lastResult as R
  }

  return { memoized, getTrackedKeys: () => trackedKeys }
}

class SelectorSubscription<T> {
  private readonly id: string
  readonly subscribers = new Set<Subscriber<T>>()
  private lastValue?: T
  private hasValue = false

  constructor(
    private readonly name: string,
    private readonly getState: () => T,
    private readonly equals: (a: T, b: T) => boolean = defaultEquals,
    private readonly logger?: ILogger,
  ) {
    this.id = name
    this.logger?.debug(`[${this.id}] SelectorSubscription created`)
  }

  notify(): void {
    try {
      const newValue = this.getState()

      // Проверка на изменение значения с использованием функции сравнения
      if (!this.hasValue || !this.equals(newValue, this.lastValue as T)) {
        this.logger?.debug(`[${this.id}] Value changed, notify()`)

        this.lastValue = newValue
        this.hasValue = true

        for (const subscriber of this.subscribers) {
          try {
            subscriber.notify(newValue)
          } catch (error) {
            this.logger?.error(`[${this.id}] Ошибка в уведомлении подписчика`, { error })
          }
        }
      }
    } catch (error: any) {
      this.logger?.error(`[${this.id}] Ошибка в notify()`, { error })
      throw error
    }
  }

  subscribe(subscriber: Subscriber<T>): VoidFunction {
    this.subscribers.add(subscriber)

    // Отправляем текущее значение синхронно
    if (this.hasValue) {
      try {
        subscriber.notify(this.lastValue as T)
      } catch (error) {
        this.logger?.error(`[${this.id}] Ошибка в первоначальном уведомлении`, { error })
      }
    } else {
      // Вычисляем значение синхронно
      this.notify()
    }

    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  cleanup(): void {
    this.subscribers.clear()
    this.lastValue = undefined
    this.hasValue = false
  }

  getLastValue(): T | undefined {
    return this.lastValue
  }

  getValue(): T {
    if (!this.hasValue) {
      this.lastValue = this.getState()
      this.hasValue = true
    }
    return this.lastValue as T
  }

  getId(): string {
    return this.id
  }
}

export class SelectorModule<S extends Record<string, any>> implements ISelectorModule<S> {
  storageName: string

  private selectorIdCounter = 0
  private subscriptions = new Map<string, SelectorSubscription<any>>()

  private localSelectorCache = new Map<
    string,
    {
      api: SelectorAPI<any>
      dependencies?: SelectorAPI<any>[]
      unsubscribeFunctions: Array<() => void>
    }
  >()

  // Флаг для батчинга обновлений
  private batchUpdateInProgress = false
  private pendingUpdates = new Set<string>()

  constructor(
    private readonly source: IStorage<S>,
    private readonly logger?: ILogger,
  ) {
    this.storageName = source.name
  }

  private isSourceReady = (): boolean => {
    return this.source.initStatus.status === StorageStatus.READY
  }

  private onSourceStatusChange = (callback: (isReady: boolean) => void): VoidFunction => {
    return this.source.onStatusChange((status: StorageInitStatus) => {
      callback(status.status === StorageStatus.READY)
    })
  }

  /**
   * Генерирует уникальное имя для селектора через автоинкрементный счётчик
   */
  private generateName(): string {
    return `${this.storageName}_selector_${this.selectorIdCounter++}`
  }

  /**
   * Обрабатывает отложенные обновления синхронно
   */
  private processPendingUpdates(): void {
    if (this.pendingUpdates.size === 0 || this.batchUpdateInProgress) return

    this.batchUpdateInProgress = true

    try {
      // Копируем список селекторов для обновления
      const subscriptionsToUpdate = Array.from(this.pendingUpdates)
      this.pendingUpdates.clear()

      // Обновляем все ожидающие селекторы синхронно
      for (const id of subscriptionsToUpdate) {
        const subscription = this.subscriptions.get(id)
        if (subscription) {
          try {
            subscription.notify()
          } catch (error) {
            this.logger?.error(`Ошибка уведомления подписчика ${id}`, { error })
          }
        }
      }
    } catch (error) {
      this.logger?.error('Ошибка обработки ожидающих обновлений', { error })
    } finally {
      this.batchUpdateInProgress = false

      // Если появились новые обновления во время обработки, запускаем процесс снова
      if (this.pendingUpdates.size > 0) {
        this.processPendingUpdates()
      }
    }
  }

  createSelector<T>(selector: Selector<S, T>, options?: SelectorOptions<T>): SelectorAPI<T>
  createSelector<Deps extends unknown[], T>(dependencies: { [K in keyof Deps]: SelectorAPI<Deps[K]> }, resultFn: (...args: Deps) => T, options?: SelectorOptions<T>): SelectorAPI<T>

  createSelector<T>(
    selectorOrDeps: Selector<S, T> | SelectorAPI<any>[],
    resultFnOrOptions?: ((...args: any[]) => T) | SelectorOptions<T>,
    optionsArg?: SelectorOptions<T>,
  ): SelectorAPI<T> {
    // Определяем, какую перегрузку используем
    const isSimpleSelector = !Array.isArray(selectorOrDeps)

    // Извлекаем options
    const options = isSimpleSelector ? (resultFnOrOptions as SelectorOptions<T>) || {} : optionsArg || {}

    const hasExplicitName = !!options.name

    // Используем предоставленное имя или генерируем уникальный ID
    const selectorId = options.name || this.generateName()

    // Кеширование по имени — только для явно именованных селекторов
    if (hasExplicitName && this.localSelectorCache.has(selectorId)) {
      return this.localSelectorCache.get(selectorId)!.api
    }


    // Создаем новый селектор
    let result: SelectorAPI<T>
    let dependencies: SelectorAPI<any>[] | undefined
    let unsubscribeFunctions: VoidFunction[] = []

    if (isSimpleSelector) {
      // Простой селектор с мемоизацией и трекингом зависимостей
      const { memoized, getTrackedKeys } = memoizeSelector(selectorOrDeps as Selector<S, T>, options.equals || defaultEquals)

      const created = this.createSimpleSelector(memoized, getTrackedKeys, { ...options, name: selectorId, equals: options.equals || defaultEquals })

      result = created.api
      unsubscribeFunctions = created.unsubscribeFunctions
    } else {
      // Комбинированный селектор
      dependencies = selectorOrDeps as SelectorAPI<any>[]

      const created = this.createCombinedSelector(dependencies, resultFnOrOptions as (...args: any[]) => T, {
        ...options,
        name: selectorId,
        equals: options.equals || defaultEquals,
      })

      result = created.api
      unsubscribeFunctions = created.unsubscribeFunctions
    }

    // Сохраняем в кеши
    this.localSelectorCache.set(selectorId, {
      api: result,
      dependencies,
      unsubscribeFunctions,
    })

    return result
  }

  private createSimpleSelector<T>(
    selector: Selector<S, T>,
    getTrackedKeys: () => Set<string> | null,
    options: SelectorOptions<T> & { name: string },
  ): {
    api: SelectorAPI<T>
    unsubscribeFunctions: VoidFunction[]
  } {
    // Синхронное получение состояния из кеша
    const getState = (): T => {
      const state = this.source.getStateSync()
      return selector(state as S)
    }

    const subscription = new SelectorSubscription(options.name, getState, options.equals || defaultEquals, this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Подписка на обновления хранилища с фильтрацией по changedPaths
    const unsubscribeFromStorage = this.source.subscribeToAll((event: any) => {
      if (event?.type === 'storage:update') {
        // Фильтруем по changedPaths: если зависимости известны и нет пересечения — пропускаем
        const changedPaths: string[] | undefined = event?.changedPaths
        const deps = getTrackedKeys()

        if (changedPaths && deps && deps.size > 0) {
          const hasRelevantChange = changedPaths.some((path) => {
            // changedPaths может содержать вложенные пути ("users.0.name")
            // берём ключ верхнего уровня для сравнения с deps
            const topLevelKey = path.split('.')[0]
            return deps.has(topLevelKey)
          })
          if (!hasRelevantChange) return
        }

        this.pendingUpdates.add(id)
        this.processPendingUpdates()
      }
    })

    const unsubscribeFunctions = [unsubscribeFromStorage]

    return {
      api: {
        select: () => getState(),
        selectSync: () => subscription.getValue(),
        subscribe: (subscriber) => {
          return subscription.subscribe(subscriber)
        },
        getId: () => id,
        isSourceReady: this.isSourceReady,
        onSourceStatusChange: this.onSourceStatusChange,
      },
      unsubscribeFunctions,
    }
  }

  private createCombinedSelector<Deps extends unknown[], T>(
    selectors: { [K in keyof Deps]: SelectorAPI<Deps[K]> },
    resultFn: (...args: Deps) => T,
    options: SelectorOptions<T> & { name: string },
  ): {
    api: SelectorAPI<T>
    unsubscribeFunctions: Array<VoidFunction>
  } {
    // Мемоизация для combined selectors: поэлементное сравнение аргументов по ссылке (как reselect)
    let lastArgs: Deps | undefined
    let lastResult: T | undefined
    let hasResult = false
    const equals = options.equals || defaultEquals

    const memoizedResultFn = (args: Deps): T => {
      // Проверяем, изменился ли хотя бы один аргумент
      if (hasResult && lastArgs && lastArgs.length === args.length) {
        let argsEqual = true
        for (let i = 0; i < args.length; i++) {
          if (lastArgs[i] !== args[i]) {
            argsEqual = false
            break
          }
        }
        if (argsEqual) return lastResult as T
      }

      const newResult = resultFn(...args)

      // Сохраняем аргументы без создания нового массива — переиспользуем переданный
      lastArgs = args

      if (!hasResult || !equals(newResult, lastResult as T)) {
        lastResult = newResult
      }

      hasResult = true
      return lastResult as T
    }

    const getState = (): T => {
      const values = selectors.map((s) => s.selectSync()) as Deps
      return memoizedResultFn(values)
    }

    const subscription = new SelectorSubscription(options.name, getState, options.equals || defaultEquals, this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Батчинг обновлений через microtask — без искусственной задержки
    let pendingNotify = false
    let destroyed = false

    const triggerUpdate = () => {
      if (!pendingNotify) {
        pendingNotify = true
        queueMicrotask(() => {
          pendingNotify = false
          if (!destroyed) {
            try {
              subscription.notify()
            } catch (error) {
              this.logger?.error(`[${id}] Ошибка в объединенном уведомлении:`, { error })
            }
          }
        })
      }
    }

    const unsubscribeFunctions: Array<VoidFunction> = selectors.map((selector) =>
      selector.subscribe({
        notify: () => {
          triggerUpdate()
        },
      }),
    )

    // При уничтожении предотвращаем выполнение отложенного microtask
    unsubscribeFunctions.push(() => {
      destroyed = true
    })

    return {
      api: {
        select: () => getState(),
        selectSync: () => subscription.getValue(),
        subscribe: (subscriber) => {
          return subscription.subscribe(subscriber)
        },
        getId: () => id,
        isSourceReady: this.isSourceReady,
        onSourceStatusChange: this.onSourceStatusChange,
      },
      unsubscribeFunctions,
    }
  }

  destroy(): void {
    // Очищаем все подписки
    this.subscriptions.forEach((sub) => sub.cleanup())
    this.subscriptions.clear()

    // Очищаем список ожидающих обновлений
    this.pendingUpdates.clear()

    // Очищаем подписки из локального кеша
    this.localSelectorCache.forEach((cached) => {
      cached.unsubscribeFunctions.forEach((unsub) => unsub())
    })
    this.localSelectorCache.clear()
  }
}
