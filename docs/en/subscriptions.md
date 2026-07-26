# Subscriptions (subscribe)

> [Back to contents](./README.md) · [Working example on GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SubscriptionPatternsExample.tsx)

Subscriptions are a **reaction to changes** in data (as opposed to a one-off [read](./reading-data.md)).
Three low-level ways + a React hook; the choice depends on exactly what you react to:

| Way | What it reacts to | When to use |
|---|---|---|
| `subscribe(key, cb)` | a change of a single top-level key | you need one field as-is |
| `subscribe(selector, cb)` | a change of a selector function's result | a computed/nested value |
| `subscribeToAll(cb)` | **any** store change | logging, syncing, debugging |
| `useStorageSubscribe(...)` | a slice value in a React component | subscription + re-render in React |

For **memoized and composable** derived values, prefer [Selectors](./selector-system.md) over an inline
selector — here the selector is recomputed on every store change.

All the ways return an **unsubscribe** function — call it to stop the subscription (in React, return it
from `useEffect`). The examples use the end-to-end `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`). They work the same way for Memory, LocalStorage and IndexedDB.

## 1. subscribe(key, callback) — a single key

The callback is called on every change of a specific top-level key.

```typescript
const unsub = todoStorage.subscribe('filter', (newFilter) => {
  console.log('filter changed:', newFilter)  // 'all' | 'active' | 'completed'
})

const unsub2 = todoStorage.subscribe('todos', (newTodos) => {
  console.log('list changed:', newTodos)  // Todo[]
})

unsub()   // unsubscribe
```

## 2. subscribe(selector, callback) — a computed value

The selector function is computed on every store change; the callback is called **only when its result
has changed**. This is how you subscribe to a nested or derived value.

```typescript
// Number of active tasks — the callback fires only when this exact number changes.
const unsub = todoStorage.subscribe(
  (state) => state.todos.filter((t) => !t.done).length,
  (activeCount) => console.log('active tasks:', activeCount),
)

// A single field via a selector.
const unsub2 = todoStorage.subscribe(
  (state) => state.filter,
  (filter) => console.log('filter:', filter),
)

unsub()
```

> If the selector returns an **object/array**, it is compared by reference — a new object on every change
> will be treated as "changed" every time. For stable derived values with a custom comparison, use
> [Selectors](./selector-system.md) (`this.select(..., { equals })`).

## 3. subscribeToAll(callback) — any change

The callback receives an **event** on every store change — with the operation type, keys and paths.
Suitable for logging, cross-syncing, and debugging.

```typescript
const unsub = todoStorage.subscribeToAll((event) => {
  // event.type          — operation type: 'set' | 'update' | 'remove' | 'clear' | 'reset' etc.
  // event.key           — the affected key or array of keys (StorageKeyType | StorageKeyType[])
  // event.changedPaths  — paths to the changed fields (string[]), e.g. ['todos', 'filter']
  // event.value         — the new value (when applicable)
  console.log(event.type, event.key, event.changedPaths)
})

unsub()
```

## 4. useStorageSubscribe — React hook

A subscription to a state slice with a component re-render when the result changes.

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function TodoStats({ storage }: { storage: ISyncStorage<TodoState> }) {
  const filter = useStorageSubscribe(storage, (s) => s.filter)

  // Re-render only when the selector's result changes.
  const total = useStorageSubscribe(storage, (s) => s.todos.length)
  const active = useStorageSubscribe(storage, (s) => s.todos.filter((t) => !t.done).length)

  return <div>{filter}: {active} active of {total}</div>
}
```

For object/array slices, pass `equals` to avoid re-rendering when the contents haven't changed:

```typescript
// { equals } is supported by the useStorageSubscribe hook specifically (the low-level subscribe has none).
const todos = useStorageSubscribe(storage, (s) => s.todos, { equals: (a, b) => a === b })
```

## See also

- [Selectors](./selector-system.md) — memoized composable derived values and `selector.$`.
- [Reactive reads & controlled re-renders](./reactive-reads.md) — `useStorageObservable` (RxJS)
  and `useStorageRef` (read without re-rendering / manual trigger).
- [Reading data](./reading-data.md) — a one-off read instead of reacting to changes.
