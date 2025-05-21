import { ILogger, IStorage } from '../storage'
import { ISelectorModule, Selector, SelectorAPI, SelectorOptions, Subscriber } from './selector.interface'

// Отладка: управление через параметр DEBUG
const DEBUG = false

// Глобальный кеш селекторов (используем имя селектора как ключ)
const GLOBAL_SELECTOR_CACHE = new Map<
  string,
  {
    api: SelectorAPI<any>
    refCount: number
    unsubscribeFunctions: VoidFunction[]
  }
>()

/**
 * Получает короткий хеш строки для добавления уникальности к имени селектора
 * @param str Строка для хеширования
 * @returns Короткий хеш
 */
function getStringHash(str: string): string {
  let hash = 0
  if (str.length === 0) return hash.toString(36)

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }

  // Преобразуем в короткую строку в формате base36
  return Math.abs(hash).toString(36).substring(0, 6)
}

/**
 * Интеллектуальное сравнение объектов по структуре
 * Сравнивает примитивы через ===, объекты - рекурсивно по структуре
 */
function defaultEquals<T>(a: T, b: T): boolean {
  // Проверяем, одинаковые ли объекты по ссылке
  if (a === b) return true

  // Если один из объектов null или undefined, но не оба одновременно
  if (a == null || b == null) return false

  // Если это не объекты или функции, значит это примитивы
  if (typeof a !== 'object' && typeof a !== 'function' && typeof b !== 'object' && typeof b !== 'function') {
    return a === b
  }

  // Если это разные типы
  if (typeof a !== typeof b) return false

  // Если это даты
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }

  // Если это массивы
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!defaultEquals(a[i], b[i])) return false
    }
    return true
  }

  // Обычные объекты
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object)
    const keysB = Object.keys(b as object)

    if (keysA.length !== keysB.length) return false

    // Проверяем все ключи в a
    return keysA.every((key) => {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false
      return defaultEquals((a as any)[key], (b as any)[key])
    })
  }

  // По умолчанию считаем объекты разными
  return false
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

  constructor(
    private readonly name: string,
    getState: () => Promise<T>,
    private readonly equals: (a: T, b: T) => boolean = defaultEquals,
    private readonly logger?: ILogger,
  ) {
    this.id = name

    // Создаем мемоизированную версию getState
    this.memoizedGetState = this.createMemoizedGetState(getState)

    if (DEBUG) {
      console.log(`[${this.id}] Создан new SelectorSubscription`)
    }
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
    try {
      const newValue = await this.memoizedGetState()

      // Проверка на изменение значения с использованием функции сравнения
      if (this.lastValue === undefined || !this.equals(newValue, this.lastValue)) {
        if (DEBUG) {
          console.log(`[${this.id}] Значение изменилось, notify()`, {
            old: this.lastValue,
            new: newValue,
          })
        }

        this.lastValue = newValue

        const promises = Array.from(this.subscribers).map(async (subscriber) => {
          try {
            await subscriber.notify(newValue)
          } catch (error) {
            this.logger?.error(`[${this.id}] Ошибка в уведомлении подписчика`, { error })
          }
        })

        await Promise.all(promises)
      } else if (DEBUG) {
        console.log(`[${this.id}] Значение не изменилось in notify(), пропуск уведомления`)
      }
    } catch (error: any) {
      this.logger?.error(`[${this.id}] Ошибка в notify()`, { error })
      throw error
    }
  }

  subscribe(subscriber: Subscriber<T>): () => void {
    if (DEBUG) {
      console.log(`[${this.id}] Добавлено новый подписчик, всего: ${this.subscribers.size + 1}`)
    }

    this.subscribers.add(subscriber)

    // Отправляем текущее значение, если оно есть
    if (this.lastValue !== undefined) {
      // Используем микротаск для асинхронности
      Promise.resolve().then(() => {
        try {
          subscriber.notify(this.lastValue as T)
        } catch (error) {
          this.logger?.error(`[${this.id}] Ошибка в первоначальном уведомлении`, { error })
        }
      })
    } else {
      // Если значения нет - запрашиваем его
      this.notify().catch((error) => {
        this.logger?.error(`[${this.id}] Ошибка в первоначальном уведомлении`, { error })
      })
    }

    return () => {
      if (DEBUG) {
        console.log(`[${this.id}] Подписчик удален, осталось: ${this.subscribers.size - 1}`)
      }
      this.subscribers.delete(subscriber)
    }
  }

  cleanup(): void {
    if (DEBUG) {
      console.log(`[${this.id}] Очистка подписки, было ${this.subscribers.size} подписчиков`)
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
  private cachedState?: S

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

    if (DEBUG) {
      console.log(`Создан SelectorModule для хранилища: ${this.storageName}`)
    }

    // Сразу получаем начальное состояние для кеширования
    this.source.getState().then((state) => {
      this.cachedState = state
      if (DEBUG) {
        console.log(`Кэшированное начальное состояние для ${this.storageName}`)
      }
    })
  }

  /**
   * Генерирует имя для селектора на основе его типа и функции
   */
  private generateName(isSimpleSelector: boolean, selectorOrDeps: any, resultFnOrOptions?: any): string {
    const type = isSimpleSelector ? 'simple' : 'combined'
    let hash = ''

    if (isSimpleSelector) {
      // Для простого селектора генерируем хеш на основе функции селектора
      const selectorStr = selectorOrDeps.toString()
      hash = getStringHash(selectorStr)
    } else {
      // Для комбинированного селектора генерируем хеш на основе ID зависимостей и функции результата
      const depsIds = (selectorOrDeps as SelectorAPI<any>[]).map((s) => s.getId()).join('_')
      const resultFnStr = resultFnOrOptions.toString()
      hash = getStringHash(depsIds + resultFnStr)
    }

    return `${this.storageName}_${type}_${hash}`
  }

  /**
   * Обрабатывает отложенные обновления, чтобы избежать каскадных уведомлений
   */
  private processPendingUpdates(): void {
    if (this.pendingUpdates.size === 0 || this.batchUpdateInProgress) return

    this.batchUpdateInProgress = true

    // Используем setTimeout для обеспечения асинхронности и батчинга обновлений
    setTimeout(async () => {
      try {
        // Копируем список селекторов для обновления
        const subscriptionsToUpdate = Array.from(this.pendingUpdates)
        this.pendingUpdates.clear()

        // Обновляем состояние один раз
        this.cachedState = await this.source.getState()

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

    // Используем предоставленное имя или генерируем новое
    const selectorId = options.name || this.generateName(isSimpleSelector, selectorOrDeps, isSimpleSelector ? undefined : resultFnOrOptions)

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
        console.log(`[${this.storageName}] Повторное использование глобального кэшированного селектора: ${selectorId}, refCount: ${cached.refCount}`)
      }
      return cached.api
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

    GLOBAL_SELECTOR_CACHE.set(selectorId, {
      api: result,
      refCount: 1,
      unsubscribeFunctions,
    })

    if (DEBUG) {
      console.log(`[${this.storageName}] Создан новый селектор: ${selectorId}`)
    }

    return result
  }

  private createSimpleSelector<T>(
    selector: Selector<S, T>,
    options: SelectorOptions<T> & { name: string },
  ): {
    api: SelectorAPI<T>
    unsubscribeFunctions: VoidFunction[]
  } {
    if (DEBUG) {
      console.log(`[${this.storageName}] Создан простой селектор: ${options.name}`)
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

    const subscription = new SelectorSubscription(options.name, getState, options.equals || defaultEquals, this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Подписка на обновления хранилища с батчингом
    const unsubscribeFromStorage = this.source.subscribeToAll(async (event: any) => {
      if (event?.type === 'storage:update') {
        if (DEBUG) {
          console.log(`[${id}] Получено событие обновления хранилища`)
        }

        // Добавляем селектор в список ожидающих обновления
        this.pendingUpdates.add(id)
        this.processPendingUpdates()
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
    options: SelectorOptions<T> & { name: string },
  ): {
    api: SelectorAPI<T>
    unsubscribeFunctions: Array<() => void>
  } {
    // Мемоизируем функцию для более эффективного вычисления
    const memoizedResultFn = memoizeSelector((args: Deps) => resultFn(...args), options.equals || defaultEquals)

    const getState = async () => {
      const values = await Promise.all(selectors.map((s) => s.select()))
      return memoizedResultFn(values as Deps)
    }

    const subscription = new SelectorSubscription(options.name, getState, options.equals || defaultEquals, this.logger)

    const id = subscription.getId()
    this.subscriptions.set(id, subscription)

    // Создаем подписки на зависимости с дебаунсингом
    let debounceTimer: any = null

    const triggerUpdate = () => {
      // Очищаем предыдущий таймер
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }

      // Устанавливаем новый таймер для дебаунсинга
      debounceTimer = setTimeout(() => {
        debounceTimer = null

        // Вызываем уведомление только после завершения дебаунса
        subscription.notify().catch((error) => this.logger?.error(`[${id}] Ошибка в объединенном уведомлении:`, { error }))
      }, 10) // Короткая задержка для дебаунсинга
    }

    const unsubscribeFunctions = selectors.map((selector) =>
      selector.subscribe({
        notify: () => {
          triggerUpdate()
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
      console.log(`[${this.storageName}] Началось уничтожение SelectorModule`)
    }

    // Очищаем все подписки
    this.subscriptions.forEach((sub) => sub.cleanup())
    this.subscriptions.clear()

    // Очищаем кеш состояния
    this.cachedState = undefined

    // Очищаем список ожидающих обновлений
    this.pendingUpdates.clear()

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
            console.log(`[${this.storageName}] Удален селектор из глобального кэша: ${key}`)
          }
        }
      }
    })
    if (DEBUG) {
      console.log(`[${this.storageName}] Уничтожен`)
    }
  }
}
