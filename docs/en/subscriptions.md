# Subscriptions (subscribe)

> [Back to Main](../../README.md)

All the ways to subscribe to data changes in a storage. The examples use the end-to-end `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`). They work the same way for Memory, LocalStorage and
IndexedDB.

## 1. subscribe(key, callback)

Subscribing to a specific top-level key. The callback is called on every change of that key.

```typescript
const unsub = todoStorage.subscribe('filter', (newFilter) => {
  console.log('filter changed:', newFilter)  // 'all' | 'active' | 'completed'
})

const unsub2 = todoStorage.subscribe('todos', (newTodos) => {
  console.log('list changed:', newTodos)  // Todo[]
})

// Unsubscribe
unsub()
```

## 2. subscribe(selector, callback)

Subscribing via a selector function. The callback is called when the selector's result changes.

```typescript
// Computed value — the number of active tasks
const unsub = todoStorage.subscribe(
  (state) => state.todos.filter((t) => !t.done).length,
  (activeCount) => console.log('active tasks:', activeCount)
)

// Subscribing to a single field
const unsub2 = todoStorage.subscribe(
  (state) => state.filter,
  (filter) => console.log('filter:', filter)
)

unsub()
```

## 3. subscribeToAll(callback)

Subscribing to ALL storage changes. The callback receives an event with information about the change.

```typescript
const unsub = todoStorage.subscribeToAll((event) => {
  console.log(event.type)          // 'set' | 'update' | 'remove' | 'clear' | 'reset'
  console.log(event.key)           // a key or an array of keys
  console.log(event.changedPaths)  // paths to the changed fields
})

unsub()
```

## 4. useStorageSubscribe (React hook)

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function TodoStats({ storage }: { storage: ISyncStorage<TodoState> }) {
  // Subscribing to a single field
  const filter = useStorageSubscribe(storage, (s) => s.filter)

  // Computed value — re-render only when the result changes
  const total = useStorageSubscribe(storage, (s) => s.todos.length)
  const active = useStorageSubscribe(storage, (s) => s.todos.filter((t) => !t.done).length)

  return <div>{filter}: {active} active of {total}</div>
}
```

Pass `equals` to skip re-renders when an object/array slice is referentially unchanged:

```typescript
const todos = useStorageSubscribe(storage, (s) => s.todos, { equals: (a, b) => a === b })
```

See **[Reactive reads & controlled re-renders](./reactive-reads.md)** for `useStorageObservable`
(RxJS path) and `useStorageRef` (read without re-rendering / manual trigger).
