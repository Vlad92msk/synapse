# useCreateStorage (localStorage)

> [Back to Main](../../README.md)

The same [`useCreateStorage`](./hook-memory.md), only with `type: 'localStorage'` — data survives a
page reload. The only difference from the memory variant is the `type` field.

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## Usage

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady } = useCreateStorage<TodoState>({
    type: 'localStorage',         // <- the only difference from memory
    name: 'todo-hook-local',
    initialState: initialTodoState,
  })

  if (!isReady) return <div>Loading…</div>

  // Reading and writing — same as with memory
  const todos = useStorageSubscribe(storage, (s) => s.todos)
  storage.set('filter', 'completed')
}
```

## When to use

- A component/screen state should survive a reload (draft, selected filter, settings), but you
  don't want to set up a global module-level store.

## When not to use

- The state is ephemeral → [memory variant](./hook-memory.md).
- Large data → [IndexedDB variant](./hook-indexeddb.md).

More on subscriptions and operations — the "Working with data" section.
