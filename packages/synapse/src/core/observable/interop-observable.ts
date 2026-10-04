import { handleCallbackError } from '../../_utils/error-handling.util'

/**
 * Лёгкие реактивные примитивы ядра — БЕЗ rxjs.
 *
 * Ядро (хранилища, селекторы, диспетчер, createSynapse, React-биндинги) не зависит от rxjs, но
 * отдаёт потоки (`selector.$`, `dispatcher.action$`, вотчеры, `synapse.state$`) в стандартном
 * interop-формате: объект с `subscribe()` и `[Symbol.observable]()`. Его принимает любая
 * Observable-библиотека — в rxjs это `from(x)`, `withLatestFrom(x)`, `switchMap(() => x)` и т.д.;
 * в `synapse-storage/reactive` — `toObservable(x)`.
 *
 * Операторов (`pipe`) здесь намеренно нет: это не rxjs-замена, а «розетка» для неё.
 */

declare global {
  interface SymbolConstructor {
    /** Стандартный interop-ключ Observable (TC39 proposal); объявлен так же, как в rxjs/redux. */
    readonly observable: symbol
  }
}

export interface Observer<T> {
  next: (value: T) => void
  error: (error: unknown) => void
  complete: () => void
}

export interface Unsubscribable {
  unsubscribe(): void
}

/** Минимальный контракт подписки (совместим с rxjs `Subscribable`). */
export interface Subscribable<T> {
  subscribe(observerOrNext?: Partial<Observer<T>> | ((value: T) => void)): Unsubscribable
}

/**
 * Поток ядра synapse: `subscribe` + interop-ключ `Symbol.observable`. В rxjs превращается в
 * Observable через `from(x)` (или `toObservable(x)` из `synapse-storage/reactive`).
 */
export interface InteropObservable<T> extends Subscribable<T> {
  [Symbol.observable]: () => Subscribable<T>
}

/** rxjs читает `Symbol.observable`, если он есть, иначе строковый `'@@observable'`. Ставим оба. */
function defineInteropKeys(target: object): void {
  const self = () => target
  Object.defineProperty(target, '@@observable', { value: self, configurable: true })
  const key = typeof Symbol === 'function' ? Symbol.observable : undefined
  if (key) Object.defineProperty(target, key, { value: self, configurable: true })
}

function toObserver<T>(observerOrNext?: Partial<Observer<T>> | ((value: T) => void)): Partial<Observer<T>> {
  if (typeof observerOrNext === 'function') return { next: observerOrNext }
  return observerOrNext ?? {}
}

// Interop-ключ назначается в конструкторе (defineInteropKeys), а не вычисляемым членом класса:
// вычисляемый ключ мешал бы tree-shaking (см. Dispatcher/FINALIZE). Тип — через слияние с интерфейсом.
export interface SimpleObservable<T> {
  [Symbol.observable]: () => Subscribable<T>
}

/**
 * Холодный поток: `producer` вызывается на каждую подписку и может вернуть teardown.
 * Ошибка в обработчике подписчика не роняет источник (как в rxjs) — уходит в лог.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SimpleObservable<T> implements InteropObservable<T> {
  constructor(private readonly producer: (observer: Observer<T>) => VoidFunction | void) {
    defineInteropKeys(this)
  }

  subscribe(observerOrNext?: Partial<Observer<T>> | ((value: T) => void)): Unsubscribable {
    const target = toObserver(observerOrNext)
    let closed = false
    let teardown: VoidFunction | void = undefined

    const finalize = () => {
      const fn = teardown
      teardown = undefined
      if (fn) fn()
    }

    const observer: Observer<T> = {
      next: (value) => {
        if (closed || !target.next) return
        try {
          target.next(value)
        } catch (error) {
          handleCallbackError('Observable: ошибка в обработчике подписчика', error)
        }
      },
      error: (error) => {
        if (closed) return
        closed = true
        if (target.error) target.error(error)
        else handleCallbackError('Observable: необработанная ошибка потока', error)
        finalize()
      },
      complete: () => {
        if (closed) return
        closed = true
        target.complete?.()
        finalize()
      },
    }

    try {
      teardown = this.producer(observer)
    } catch (error) {
      observer.error(error)
    }
    // Источник завершился синхронно внутри producer — teardown уже не нужен ждать.
    if (closed) finalize()

    return {
      unsubscribe: () => {
        if (closed) return
        closed = true
        finalize()
      },
    }
  }
}

/** Горячий multicast-поток (аналог rxjs `Subject` в минимальном объёме). */
export class SimpleSubject<T> {
  private readonly observers = new Set<Observer<T>>()
  private stopped = false

  next(value: T): void {
    if (this.stopped) return
    // Копия: подписчик может отписаться/подписаться прямо в обработчике.
    for (const observer of Array.from(this.observers)) observer.next(value)
  }

  error(error: unknown): void {
    if (this.stopped) return
    this.stopped = true
    const observers = Array.from(this.observers)
    this.observers.clear()
    for (const observer of observers) observer.error(error)
  }

  complete(): void {
    if (this.stopped) return
    this.stopped = true
    const observers = Array.from(this.observers)
    this.observers.clear()
    for (const observer of observers) observer.complete()
  }

  get observed(): boolean {
    return this.observers.size > 0
  }

  asObservable(): InteropObservable<T> {
    return new SimpleObservable<T>((observer) => {
      if (this.stopped) {
        observer.complete()
        return
      }
      this.observers.add(observer)
      return () => {
        this.observers.delete(observer)
      }
    })
  }
}

/**
 * Делит одну подписку на источник между всеми подписчиками (аналог rxjs `share()`):
 * источник подписывается на первом подписчике и отписывается, когда ушёл последний.
 */
export function shareStream<T>(source: Subscribable<T>): InteropObservable<T> {
  let subject: SimpleSubject<T> | null = null
  let connection: Unsubscribable | null = null
  let refCount = 0

  // Сбрасывает «сессию» шаринга: следующий подписчик переподключит источник заново.
  const reset = () => {
    const c = connection
    connection = null
    subject = null
    refCount = 0
    c?.unsubscribe()
  }

  return new SimpleObservable<T>((observer) => {
    if (!subject) subject = new SimpleSubject<T>()
    const current = subject
    const inner = current.asObservable().subscribe(observer)
    refCount++
    if (!connection) {
      const c = source.subscribe({
        next: (value) => current.next(value),
        error: (error) => {
          if (subject === current) reset()
          current.error(error)
        },
        complete: () => {
          if (subject === current) reset()
          current.complete()
        },
      })
      // Источник мог завершиться синхронно внутри subscribe — тогда сессия уже сброшена.
      if (subject === current) connection = c
      else c.unsubscribe()
    }
    return () => {
      inner.unsubscribe()
      if (subject === current && --refCount === 0) reset()
    }
  })
}

/** Похоже ли значение на поток (есть `subscribe`). */
export function isSubscribable<T = unknown>(value: unknown): value is Subscribable<T> {
  return !!value && typeof (value as Subscribable<T>).subscribe === 'function'
}
