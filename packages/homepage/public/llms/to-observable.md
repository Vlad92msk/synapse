<!-- source: docs/en/to-observable.md · canonical: https://synapse-homepage.web.app/docs/to-observable · part of https://synapse-homepage.web.app/llms-full.txt -->

# toObservable


**TL;DR.** `toObservable(storage[, selector, equals])` — turns a storage into an RxJS `Observable` of
the state stream. It's a **low-level utility for effects and non-React code**; the React hooks
`useStorageObservable` / `useObservable` are built on it. Imported from `synapse-storage/reactive`. The
examples use the end-to-end `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`).

## Why

A storage is not an RxJS source on its own: it has `subscribe`/`getStateSync`, not `pipe`. As soon as
you need to **run the state through operators** (`debounceTime`, `scan`, `bufferTime`, …) or **feed it
into `createEffectConfig` as external state**, you need an `Observable`. `toObservable` builds exactly
that bridge: it emits the current state on subscribe, then on every change.

## When to use / when you DON'T need it

**Use it:**

- you're building a stream **outside React** — in effects, watchers, plain non-React modules;
- you need an `Observable` of state as **external state** for `createEffectConfig.externalStates`;
- in React you need **your own set of operators** on top of a slice — then `toObservable(...)` in a
  factory + [`useObservable`](./use-storage-observable.md) / [`useSubscription`](./use-subscription.md).

**You DON'T need it:**

- **just a slice into a component without your own operators** →
  [`useStorageObservable`](./use-storage-observable.md) (it memoizes `toObservable` for you);
- **a reactive read with no RxJS at all** → [`useStorageSubscribe`](./use-storage-subscribe.md);
- you're reading a memoized `SelectorAPI` — it already has `.$` (a ready-made `Observable`), no need to
  wrap the store, see [Selectors](./selector-system.md).

> In a React component, do **not** create `toObservable(...)` directly in render — a new Observable on
> every render triggers re-subscriptions. Memoize it (which is what `useStorageObservable` does) or pass
> it as a **factory** to `useObservable`.

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

## All parameters (commented)

```typescript
import { toObservable } from 'synapse-storage/reactive'

const slice$ = toObservable(
  // 1. storage — IStorageBase (Memory/Local/IndexedDB — a shared interface).
  //    The stream subscribes to storage.subscribeToAll and emits getStateSync().
  todoStorage,

  // 2. selector? — which slice to pull out. Without it the stream emits the WHOLE state on any
  //    change. With it — map + distinctUntilChanged, emitting only when the slice changes.
  (s) => s.todos.length,

  // 3. equals? — comparator for distinctUntilChanged (defaults to Object.is).
  //    Needed if the selector returns a new object/array every tick, or when you want a
  //    coarser equivalence. Only makes sense TOGETHER with selector.
  (a, b) => a === b,
)
```

## Parameters

| Parameter | Type | Description |
|---|---|---|
| `storage` | `IStorageBase<T>` | The storage. The stream emits `getStateSync()` on subscribe and on every change. |
| `selector?` | `(state: T) => R` | The slice. Without it — the whole state; with it — `map` + `distinctUntilChanged`. |
| `equals?` | `(a: R, b: R) => boolean` | Comparator for `distinctUntilChanged`. Defaults to `Object.is`. Only together with `selector`. |

## Notes

- The stream emits the current state immediately on subscribe (via `getStateSync()`), then on every
  change.
- Under the hood it's `shareReplay({ refCount: true })`: multiple subscribers share a single store
  subscription, and when their count drops to zero the stream unsubscribes from the storage (no leaked
  listeners).

## See also

- [useStorageObservable / useObservable](./use-storage-observable.md) — the same stream in a React component.
- [useSubscription](./use-subscription.md) — a subscription side-effect in React (the same `toObservable` inside).
- [useStorageSubscribe](./use-storage-subscribe.md) — a reactive read in a component without RxJS.
- [Reactive reads](./reactive-reads.md) — an overview and how to pick the tool.
