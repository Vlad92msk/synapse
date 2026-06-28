# useCreateStorage (indexedDB)

> [Back to Main](../../README.md)

The same [`useCreateStorage`](./hook-memory.md) with `type: 'indexedDB'`. Returns `IAsyncStorage`.
Note: `destroyOnUnmount` defaults to `false` for IndexedDB (a persistent storage usually doesn't
need to be wiped on unmount).

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## Usage

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady } = useCreateStorage<TodoState>({
    type: 'indexedDB',
    name: 'todo-hook-idb',
    initialState: initialTodoState,
  })
  // storage has type IAsyncStorage<TodoState> | null

  // To destroy the store on unmount — pass the option explicitly:
  const result = useCreateStorage<TodoState>(
    { type: 'indexedDB', name: 'todo-hook-idb', initialState: initialTodoState },
    { destroyOnUnmount: true },
  )

  if (!isReady) return <div>Loading…</div>

  // useStorageSubscribe works identically for synchronous and asynchronous storages
  const todos = useStorageSubscribe(storage, (s) => s.todos)

  // set/update return a Promise, but await isn't required in handlers
  storage.update((s) => { s.filter = 'active' })
}
```

## When to use

- A component store needs persistence and/or large amounts of data.

## When not to use

- Small state without asynchrony → [localStorage variant](./hook-local-storage.md).
- Ephemeral state → [memory variant](./hook-memory.md).

More on asynchronous operations — the "Working with data" section.
