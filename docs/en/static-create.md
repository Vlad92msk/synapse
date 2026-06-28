# Static .create()

> [Back to Main](../../README.md)

Every storage class has a static `.create()` method — a full equivalent of the `new` operator.
It's a matter of style: `new MemoryStorage(...)` and `MemoryStorage.create(...)` create identical stores.

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## Usage

```typescript
import { MemoryStorage, LocalStorage, IndexedDBStorage } from 'synapse-storage/core'

// MemoryStorage.create() — equivalent to new MemoryStorage()
const memStorage = MemoryStorage.create<TodoState>({
  name: 'todo-static',
  initialState: initialTodoState,
})

// LocalStorage.create() — equivalent to new LocalStorage()
const localStore = LocalStorage.create<TodoState>({
  name: 'todo-static-local',
  initialState: initialTodoState,
})

// IndexedDBStorage.create() — equivalent to new IndexedDBStorage()
const idbStore = IndexedDBStorage.create<TodoState>({
  name: 'todo-static-idb',
  initialState: initialTodoState,
  options: {},                    // required for IndexedDB
})

await Promise.all([
  memStorage.initialize(),
  localStore.initialize(),
  idbStore.initialize(),
])
```

## new, .create() or StorageFactory?

- `new` / `.create()` — when the storage type is known and fixed. Fully equivalent.
- [`StorageFactory`](./storage-factory.md) — when the type is chosen in a single place or at runtime.
- [`useCreateStorage`](./hook-memory.md) — when the store lives inside a React component.
