<!-- source: docs/en/use-storage-subscribe.md · canonical: https://synapse-homepage.web.app/docs/use-storage-subscribe · part of https://synapse-homepage.web.app/llms-full.txt -->

# useStorageSubscribe


**TL;DR.** `useStorageSubscribe(storage, selector[, { equals }])` — the **default** way to read a
storage reactively in a component. `useSyncExternalStore` under the hood (Concurrent-safe), **no RxJS**.
Re-renders the component when the selected slice changes and returns the slice value itself. This is your
first choice for "show a value from the store"; RxJS operators and side effects live in sibling hooks (see
the table below). The examples use the end-to-end `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Why

99% of reactive reads are "take a store slice and render it, updating when it changes". That needs neither
RxJS nor a manual `useEffect` + `useState`: `useStorageSubscribe` subscribes to the storage via
`useSyncExternalStore`, hands the value straight to render, and works correctly in Concurrent Mode (no
tearing).

## When to use / when you don't need it

**Use it:** you need the **value of a store slice in JSX**, updating when it changes, without RxJS.

**You don't need it:**

- you need **RxJS operators** on top of the stream (`debounceTime`, `scan`, …) → [`useStorageObservable`](./use-storage-observable.md);
- you read a **`SelectorAPI`** (a memoized selector) → [`useSelector`](./selector-system.md);
- you need a **side effect** on change (toast/log), not a value in render → [`useSubscription`](./use-subscription.md);
- you need a **one-off read in a handler** without a re-render → `todoStorage.getStateSync()`, see the
  [overview](./reactive-reads.md).

## Signature

```typescript
useStorageSubscribe<S, R>(
  storage: IStorageBase<S> | null,
  selector: (state: S) => R,
  options?: { equals?: (a: R, b: R) => boolean },
): R | undefined
```

## Basic usage

For **primitive** slices it de-dupes automatically via `Object.is` — no needless re-renders.

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// primitive slice — de-duped automatically
const filter = useStorageSubscribe(todoStorage, (s) => s.filter)
```

## Object and array slices: `equals`

When the selector returns an object/array (a new reference every tick) or you want to re-render only when
a specific slice changes, pass `equals`. It keeps a stable snapshot and skips needless re-renders even
when the rest of the store changes.

```typescript
// an unrelated store change won't re-render the component until `todos` changes by reference
const todos = useStorageSubscribe(todoStorage, (s) => s.todos, {
  equals: (a, b) => a === b,
})
```

`equals` returns `true` when the slices are "equal" — then the snapshot keeps its reference and there is
no re-render.

## All parameters (commented)

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

const todos = useStorageSubscribe(
  // 1. storage — IStorageBase (sync/async — the shared interface). You can pass null
  //    (before init) → the hook returns undefined.
  todoStorage,

  // 2. selector — which slice to pull out of the state. Called on every snapshot.
  (s) => s.todos,

  // 3. options.equals? — comparison of the previous and new slice. true → the snapshot does NOT
  //    change by reference, no re-render (even if the rest of the store's state changed). Needed for
  //    object/array slices; not needed for primitives (de-duped via Object.is).
  { equals: (a, b) => a === b },
)
```

## Options

| Parameter | Type | Description |
|---|---|---|
| `storage` | `IStorageBase<S> \| null` | The storage, or `null` before init (then the hook returns `undefined`). |
| `selector` | `(state: S) => R` | The slice we read and re-render on when it changes. |
| `options.equals?` | `(a: R, b: R) => boolean` | Snapshot memoization. `true` → no re-render. For object/array slices. |

## Notes

- `useSyncExternalStore` gives correct behavior in Concurrent Mode (no tearing).
- Accepts `IStorageBase` — the shared interface of sync and async storages; the subscription is the same
  for all types.
- Before init you can pass `null` instead of the storage — the hook returns `undefined`.

## See also

- [useStorageObservable](./use-storage-observable.md) — the same reactive read, but with RxJS operators.
- [useSelector](./selector-system.md) — reading a memoized `SelectorAPI`.
- [useSubscription](./use-subscription.md) — a side effect on change (without render).
- [Reactive reads](./reactive-reads.md) — overview and choosing a tool.
