export interface Selector<T, R> {
  (state: T): R
}

export interface ResultFunction<Deps extends any[], R> {
  (...args: Deps): R
}

export interface SelectorOptions<T> {
  equals?: (a: T, b: T) => boolean
  name?: string
}

export interface Subscriber<T> {
  notify: (value: T) => void | Promise<void>
}

export interface Subscribable<T> {
  subscribe: (subscriber: Subscriber<T>) => VoidFunction
}

export interface SelectorAPI<T> {
  select: () => Promise<T>
  subscribe: (subscriber: Subscriber<T>) => VoidFunction
}
