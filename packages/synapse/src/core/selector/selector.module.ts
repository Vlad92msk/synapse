import { ILogger, IStorage } from '../storage'
import { ISelectorModule, Selector, SelectorAPI, SelectorOptions, Subscriber } from './selector.interface'

// Глобальный автоинкрементный счётчик для генерации уникальных ID селекторов
let selectorIdCounter = 0

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

// Мемоизирует функцию селектора для оптимизации
function memoizeSelector<S, R>(selectorFn: (state: S) => R, equals: (a: R, b: R) => boolean = defaultEquals): (state: S) => R {
  let lastState: S | undefined
  let lastResult: R | undefined
  let hasResult = false

  return function memoized(state: S): R {
    // Если это первый вызов или состояние изменилось
    if (!hasResult || lastState !== state) {
      const newResult = selectorFn(state)

      // Проверяем, изменился ли результат
      if (!hasResult || !equals(newResult, lastResult as R)) {
        lastResult = newResult
      }

      lastState = state
      hasResult = true
    }

    return lastResult as R
  }
}

class SelectorSubscription<T> {
  private readonly id: string
  readonly subscribers = new Set<Subscriber<T>>()
  private lastValue?: T
  private readonly memoizedGetState: () => Promise<T>
  private notifyVersion = 0

  constructor(
    private readonly name: string,
    getState: () => Promise<T>,
    private readonly equals: (a: T, b: T) => boolean = defaultEquals,
    private readonly logger?: ILogger,
  ) {
    this.id = name

    // Создаем мемоизированную версию getState
    this.memoizedGetState = this.createMemoizedGetState(getState)

    this.logger?.debug(`[${this.id}] SelectorSubscription created`)
  }

  // Создает мемоизированную версию getState с кешированием результата
  private createMemoizedGetState(getState: () => Promise<T>): () => Promise<T> {
    let lastPromise: Promise<T> | null = null
    let isExecuting = false

    return async () => {
      // Если уже выполняется запрос, возвращаем его
      if (isExecuting && lastPromise) {
        return lastPromise
      }

      isExecuting = true

      try {
        lastPromise = getState()
        return await lastPromise
      } finally {
        isExecuting = false
      }
    }
  }

  async notify(): Promise<void> {
    const version = ++this.notifyVersion

    try {
      const newValue = await this.memoizedGetState()

      // Если за время await был вызван более новый notify — отменяем текущий
      if (version !== this.notifyVersion) return

      // Проверка на изменение значения с использованием функции сравнения
      if (this.lastValue === undefined || !this.equals(newValue, this.lastValue)) {
        this.logger?.debug(`[${this.id}] Value changed, notify()`)

        this.lastValue = newValue

        const promises = Array.from(this.subscribers).map(async (subscriber) => {
          try {
            await subscriber.notify(newValue)
          } catch (error) {
            this.logger?.error(`[${this.id}] Ошибка в уведомлении подписчика`, { error })
          }
        })

        await Promise.all(promises)
      }
    } catch (error: any) {
      this.logger?.error(`[${this.id}] Ошибка в notify()`, { error })
      throw error
    }
  }

  subscribe(subscriber: Subscriber<T>): () => void {
    this.subscribers.add(subscriber)

    // Отправляем текущее значение синхронно, если оно есть
    if (this.lastValue !== undefined) {
      try {
        subscriber.notify(this.lastValue as T)
      } catch (error) {
        this.logger?.error(`[${this.id}] Ошибка в первоначальном уведомлении`, { error })
      }
    } else {
      // Если значения нет - запрашиваем его
      this.notify().catch((error) => {
        this.logger?.error(`[${this.id}] Ошибка в первоначальном уведомлении`, { error })
      })
    }

    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  cleanup(): void {
    this.subscribers.clear()
    this.lastValue = undefined
  }

  getLastValue(): T | undefined {
    return this.lastValue
  }

  getId(): string {
    return this.id
  }
}

export class SelectorModule<S extends Record<string, any>> implements ISelectorModule<S> {
  storageName: string

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
  private batchTimerId: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly source: IStorage<S>,
    private readonly logger?: ILogger,
  ) {
    this.storageName = source.name
  }

  /**
   * Генерирует уникальное имя для селектора через автоинкрементный счётчик
   */
  private generateName(): string {
    return `${this.storageName}_selector_${selectorIdCounter++}`
  }

  /**
   * Обрабатывает отложенные обновления, чтобы избежать каскадных уведомлений
   */
  private processPendingUpdates(): void {
    if (this.pendingUpdates.size === 0 || this.batchUpdateInProgress) return

    this.batchUpdateInProgress = true

    // Используем setTimeout для обеспечения асинхронности и батчинга обновлений
    this.batchTimerId = setTimeout(async () => {
      this.batchTimerId = null
      try {
        // Копируем список селекторов для обновления
        const subscriptionsToUpdate = Array.from(this.pendingUpdates)
        this.pendingUpdates.clear()

        // Обновляем все ожидающие селекторы
        const updatePromises = subscriptionsToUpdate.map(async (id) => {
          const subscription = this.subscriptions.get(id)
          if (subscription) {
            try {
              return await subscription.notify()
            } catch (error) {
              this.logger?.error(`Ошибка уведомления подписчика ${id}`, { error })
            }
          }
          return Promise.resolve()
        })

        await Promise.all(updatePromises)
      } catch (error) {
        this.logger?.error('Ошибка обработки ожидающих обновлений', { error })
      } finally {
        this.batchUpdateInProgress = false

        // Если появились новые обновления во время обработки, запускаем процесс снова
        if (this.pendingUpdates.size > 0) {
          this.processPendingUpdates()
        }
      }
    }, 0)
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
      // Простой селектор с мемоизацией
      const memoized = memoizeSelector(selectorOrDeps as Selector<S, T>, options.equals || defaultEquals)

      const created = this.createSimpleSelector(memoized, { ...options, name: selectorId, equals: options.equals || defaultEquals })

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
    options: SelectorOptions<T> & { name: string },
  ): {
    api: SelectorAPI<T>
    unsubscribeFunctions: VoidFunction[]
  } {
    // Функция для получения данных — всегда из source напрямую,
    // мемоизация в memoizeSelector предотвращает лишние пересчёты
    const getState = async (): Promise<T> => {
      const state = await this.source.getState()
      return selector(state as S)
    }

    const subscription = new SelectorSubscription(options.name, getState, options.equals || defaultEquals, this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Подписка на обновления хранилища с батчингом
    const unsubscribeFromStorage = this.source.subscribeToAll(async (event: any) => {
      if (event?.type === 'storage:update') {
        // Добавляем селектор в список ожидающих обновления
        this.pendingUpdates.add(id)
        this.processPendingUpdates()
      }
    })

    const unsubscribeFunctions = [unsubscribeFromStorage]

    return {
      api: {
        select: () => getState(),
        selectSync: () => subscription.getLastValue(),
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
    options: SelectorOptions<T> & { name: string },
  ): {
    api: SelectorAPI<T>
    unsubscribeFunctions: Array<() => void>
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

    const getState = async () => {
      const values = await Promise.all(selectors.map((s) => s.select())) as Deps
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
            subscription.notify().catch((error) => this.logger?.error(`[${id}] Ошибка в объединенном уведомлении:`, { error }))
          }
        })
      }
    }

    const unsubscribeFunctions: Array<() => void> = selectors.map((selector) =>
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
        selectSync: () => subscription.getLastValue(),
        subscribe: (subscriber) => {
          return subscription.subscribe(subscriber)
        },
        getId: () => id,
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

    // Отменяем отложенный таймер батчинга
    if (this.batchTimerId !== null) {
      clearTimeout(this.batchTimerId)
      this.batchTimerId = null
    }

    // Очищаем подписки из локального кеша
    this.localSelectorCache.forEach((cached) => {
      cached.unsubscribeFunctions.forEach((unsub) => unsub())
    })
    this.localSelectorCache.clear()
  }
}
