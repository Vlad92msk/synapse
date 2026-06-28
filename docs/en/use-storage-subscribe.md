# useStorageSubscribe

> [Back to Main](../../README.md)

The **default** way to read a storage reactively. `useSyncExternalStore` under the hood (Concurrent-safe),
no RxJS. Re-renders the component when the selected slice changes. See also the [Reactive
reads](./reactive-reads.md) overview. The examples use the end-to-end `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

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

## Notes

- `useSyncExternalStore` gives correct behavior in Concurrent Mode (no tearing).
- Accepts `IStorageBase` — the shared interface of sync and async storages; the subscription is the same
  for all types.
- Before init you can pass `null` instead of the storage — the hook returns `undefined`.
- Need RxJS operators on top of the stream? That's [useStorageObservable](./use-storage-observable.md).
  Reading a `SelectorAPI`? That's [useSelector](./selector-system.md). Need to read without a re-render
  in a handler? `todoStorage.getStateSync()` — see the [overview](./reactive-reads.md).
