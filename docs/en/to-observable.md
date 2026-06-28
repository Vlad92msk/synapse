# toObservable

> [Back to Main](../../README.md)

Turns a storage (`IStorageBase`) into an RxJS `Observable` of the state stream — for **effects and
non-React code**. It's the low-level utility that [useStorageObservable](./use-storage-observable.md) is
built on. Imported from `synapse-storage/reactive`. The examples use the end-to-end `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Basic usage

Without a selector the stream emits the **whole** state on every store change. With a selector it emits
only the slice, de-duped via `distinctUntilChanged` (default `Object.is`, or a custom `equals`):

```typescript
import { toObservable } from 'synapse-storage/reactive'

const state$ = toObservable(todoStorage)                        // Observable<TodoState>
const count$ = toObservable(todoStorage, (s) => s.todos.length) // Observable<number>, distinct
```

The stream emits the current state immediately on subscribe (via `getStateSync()`), then on every
change. It uses `shareReplay(1)` under the hood, so multiple subscribers share a single store
subscription.

## In effects

A typical case is wiring one storage's state as an external state into `createEffectConfig`:

```typescript
const auth$ = toObservable(authStorage, (s) => s.user.id)

createEffectConfig: () => ({
  externalStates: { userId: auth$ },
})
```

## Custom `equals`

The second argument of the selector overload is the comparator for `distinctUntilChanged`:

```typescript
// emits only when the parity of the count changes
const parity$ = toObservable(todoStorage, (s) => s.todos.length, (a, b) => a % 2 === b % 2)
```

## Notes

- In a React component, do **not** create `toObservable(...)` directly in render — memoize it (which is
  what [useStorageObservable](./use-storage-observable.md) does) or subscribe via `useObservable` with a
  factory.
- For a simple reactive read in a component without RxJS, use
  [useStorageSubscribe](./use-storage-subscribe.md).
