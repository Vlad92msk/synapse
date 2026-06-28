# useStorageObservable

> [Back to Main](../../README.md)

The RxJS path for "store → reactive in a component". Equivalent to
[useStorageSubscribe](./use-storage-subscribe.md), but you can pipe RxJS operators (`debounceTime`,
`scan`, `map`, …) on top of the state stream. See the [Reactive reads](./reactive-reads.md) overview.
The examples use the end-to-end `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`).

## Basic usage

```typescript
import { useStorageObservable } from 'synapse-storage/react'

// whole state
const state = useStorageObservable(todoStorage)

// a slice — emits only when the slice changes (distinctUntilChanged)
const total = useStorageObservable(todoStorage, (s) => s.todos.length)
```

Internally it's a memoizing wrapper over [`toObservable`](./to-observable.md) + `useObservable`. The
observable is memoized by `[storage]`, so the hook does **not** re-subscribe on every render. That avoids
the footgun of inlining `toObservable(storage)` in render (a new Observable each render → needless
re-subscriptions).

## Operators on top of the stream

If you need a stateful operator chain (`debounceTime`, `scan`), build the stream with `toObservable` and
subscribe via `useObservable` with a factory — so the subscription is stable and the chain is rebuilt
only by `deps`:

```typescript
import { useObservable } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { debounceTime, map } from 'rxjs/operators'

const debouncedCount = useObservable(
  () => toObservable(todoStorage, (s) => s.todos.length).pipe(debounceTime(200), map((n) => `${n} todos`)),
  '0 todos',
  [todoStorage],
)
```

> `useStorageObservable` returns a **ready value**, not an `Observable` — you can't call `.pipe(...)` on
> it. If you need operators, build the stream with `toObservable` (as above). The key thing: don't call
> `toObservable(...)` directly in the render body without memoization — that creates a new `Observable` on
> every render → re-subscription and a reset of `debounceTime`/`scan` state. The factory + `deps` in
> `useObservable` are exactly what keeps the subscription stable.

## Notes

- A selector stream already runs through `distinctUntilChanged` — an extra `distinctUntilChanged` after
  the selector is almost always redundant.
- Need a reactive read without RxJS? Use [useStorageSubscribe](./use-storage-subscribe.md).
