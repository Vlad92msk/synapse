# toObservable

> [Back to Main](../../README.md)

Turns a storage (`IStorageBase`) into an RxJS `Observable` of the state stream — for **effects and
non-React code**. It's the low-level utility that [useStorageObservable](./use-storage-observable.md) is
built on. Imported from `synapse-storage/reactive`. The examples use the end-to-end `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Signature

```typescript
// whole state
toObservable<T>(storage: IStorageBase<T>): Observable<T>

// slice + optional comparator
toObservable<T, R>(
  storage: IStorageBase<T>,
  selector: (state: T) => R,
  equals?: (a: R, b: R) => boolean,
): Observable<R>
```

Three parameters:

1. **`storage`** — the storage.
2. **`selector`** *(optional)* — which slice to pull out of the state.
3. **`equals`** *(optional)* — how to compare adjacent slice values to skip duplicates.

## `selector` — a slice instead of the whole state

Without a selector the stream emits the **whole** state on **every** store change — even when a field you
don't care about changed. With a selector the stream `map`s the state to a slice and runs it through
`distinctUntilChanged`, so it emits **only when the slice actually changed**:

```typescript
import { toObservable } from 'synapse-storage/reactive'

const state$ = toObservable(todoStorage)                        // Observable<TodoState>, on any change
const count$ = toObservable(todoStorage, (s) => s.todos.length) // Observable<number>, only when it changes
```

Here `count$` won't fire if `filter` changed — the `todos` length is the same. That's the optimization:
the subscriber (component/effect) doesn't wake up on unrelated changes.

## `equals` — how slices are compared

The third parameter is the comparator for `distinctUntilChanged`. It decides whether a new slice value is
"the same" (return `true` → the emission is skipped). By default the comparison uses `Object.is`.

`Object.is` is enough for **primitives** (`number`, `string`, `boolean`) and for slices with a **stable
reference** (when immutable updates don't touch that object — the reference is preserved). A custom
`equals` is needed in two cases:

**1. The selector returns a new object/array every time.** Then `Object.is` sees a new reference on every
tick and `distinctUntilChanged` won't de-dupe — the stream emits on every store change. Pass a by-content
comparison:

```typescript
// factory selector: a new array each time → needs a by-value equals
const ids$ = toObservable(
  todoStorage,
  (s) => s.todos.map((t) => t.id),
  (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
)
```

**2. You need a coarser equivalence than identity.** For example, emit only when a property of the value
changes, not the value itself:

```typescript
// emits only when the parity of the count changes (1→3 stays quiet, 3→4 emits)
const parity$ = toObservable(todoStorage, (s) => s.todos.length, (a, b) => a % 2 === b % 2)
```

> `equals` only makes sense together with `selector` — without a slice there's nothing to compare.

## In effects

A typical case is wiring one storage's state as an external state into `createEffectConfig`:

```typescript
const auth$ = toObservable(authStorage, (s) => s.user.id)

createEffectConfig: () => ({
  externalStates: { userId: auth$ },
})
```

## Notes

- The stream emits the current state immediately on subscribe (via `getStateSync()`), then on every
  change.
- Under the hood it's `shareReplay({ refCount: true })`: multiple subscribers share a single store
  subscription, and when their count drops to zero the stream unsubscribes from the storage (no leaked
  listeners).
- In a React component, do **not** create `toObservable(...)` directly in render — memoize it (which is
  what [useStorageObservable](./use-storage-observable.md) does) or subscribe via `useObservable` with a
  factory.
- For a simple reactive read in a component without RxJS, use
  [useStorageSubscribe](./use-storage-subscribe.md).
