# StorageFactory

> [Back to Main](../../README.md)

A factory for creating storages — an alternative to calling `new MemoryStorage()` / `new LocalStorage()` /
`new IndexedDBStorage()` directly. Handy when the storage type is chosen in a single place or at runtime.

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## Typed methods

Each method returns a concrete storage type:

```typescript
import { StorageFactory } from 'synapse-storage/core'

// createMemory -> MemoryStorage<T> (synchronous)
const memStorage = StorageFactory.createMemory<TodoState>({
  name: 'todo-factory',
  initialState: initialTodoState,
})

// createLocal -> LocalStorage<T> (synchronous)
const localStore = StorageFactory.createLocal<TodoState>({
  name: 'todo-factory-local',
  initialState: initialTodoState,
})

// createIndexedDB -> IndexedDBStorage<T> (asynchronous)
const idbStore = StorageFactory.createIndexedDB<TodoState>({
  name: 'todo-factory-idb',
  initialState: initialTodoState,
  options: {},
})

await memStorage.initialize()
```

## Universal create()

The type is chosen via the `type` field, and the return type depends on it:

```typescript
const sync = StorageFactory.create<TodoState>({
  type: 'memory',                 // -> ISyncStorage<TodoState>
  name: 'todo-universal-mem',
  initialState: initialTodoState,
})

const sync2 = StorageFactory.create<TodoState>({
  type: 'localStorage',           // -> ISyncStorage<TodoState>
  name: 'todo-universal-local',
  initialState: initialTodoState,
})

const async = StorageFactory.create<TodoState>({
  type: 'indexedDB',              // -> IAsyncStorage<TodoState>
  name: 'todo-universal-idb',
  initialState: initialTodoState,
  options: {},
})
```

## When to use

- The storage type is chosen in a single place or depends on configuration/environment.
- You want a unified style for creating all of the application's stores.

## When not to use

- Inside a component — usually [`useCreateStorage`](./hook-memory.md) is more convenient, since it
  also manages the lifecycle.
- If the type is fixed and known — a direct `new`/`.create()` is just as good.

Reading, writing, and subscriptions — see the "Working with data" section.
