# useCreateStorage (memory)

> [Back to Main](../../README.md)

A React hook that creates and initializes a storage right inside a component and destroys it on
unmount. There's no need to keep the store at the module level — its lifecycle matches the
component's lifecycle.

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## useCreateStorage

```typescript
import { useCreateStorage } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<TodoState>({
    type: 'memory',           // 'memory' | 'localStorage' | 'indexedDB'
    name: 'todo-hook-memory',
    initialState: initialTodoState,
  })

  // Optional: lifecycle settings as a second argument
  const result = useCreateStorage<TodoState>(
    { type: 'memory', name: 'todo-hook-memory', initialState: initialTodoState },
    {
      autoInitialize: true,    // auto-initialize (default: true)
      destroyOnUnmount: true,  // destroy on unmount (default: true for memory/local)
    },
  )

  // isReady = true  -> storage is available (type: ISyncStorage<TodoState>)
  // isReady = false -> storage = null
  if (!isReady) return <div>Loading…</div>

  // After isReady the storage is guaranteed to be non-null
  storage.set('filter', 'active')
}
```

## Reading state — useStorageSubscribe

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// Subscribe to the whole state or to individual fields (re-renders only when the result changes)
const state = useStorageSubscribe(storage, (s) => s)
const filter = useStorageSubscribe(storage, (s) => s.filter)
const activeCount = useStorageSubscribe(storage, (s) => s.todos.filter((t) => !t.done).length)
```

`useStorageSubscribe` accepts `storage | null`, so you can call it before readiness — it returns
`undefined`. More details in the [Subscriptions](./subscriptions.md) section.

## When to use

- The store is only needed inside a specific component/screen and should disappear with it.
- You don't want manual `initialize()` / `destroy()` in `useEffect`.

## When not to use

- The store must be global and survive component unmount → create it at the module level
  (see [MemoryStorage](./memory-storage.md)) or via [createSynapse](./create-synapse-basic.md).
