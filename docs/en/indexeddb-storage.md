# IndexedDBStorage

> [Back to Main](../../README.md)

Data is stored in IndexedDB and survives reloads. **Asynchronous API** — read/write operations
return a Promise.

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)),
but in a persistent asynchronous storage.

## Creating

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

// options is a required field (may be an empty object)
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: {},
})

// With a custom dbName
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: { dbName: 'my_app_db' }, // defaults to 'app_storage'
})

// Or via the static .create()
const storage = IndexedDBStorage.create<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: {},
})

await storage.initialize()
```

## Synchronous vs asynchronous API

The key difference from Memory/LocalStorage: operations return a Promise.

```typescript
// Writing
await storage.set('filter', 'active')
await storage.update((s) => { s.todos.push(createTodo('Новая задача')) })

// Reading
const todos = await storage.get<Todo[]>('todos')
const state = await storage.getState()

// getStateSync() — synchronous read from the cache, always available (including in render)
const cached = storage.getStateSync()
```

Subscriptions (`subscribe`, `subscribeToAll`, `useStorageSubscribe`) are identical to synchronous storages.

## When to use

- Large amounts of data, arrays of thousands of items, binary data (Blob/ArrayBuffer).
- You need persistence beyond the localStorage limit (~5 MB).

## When not to use

- Small state where you don't want asynchrony → [LocalStorage](./local-storage.md).
- Ephemeral UI state → [MemoryStorage](./memory-storage.md).

## Working with data

A full walkthrough of the operations is in the "Working with data" section: [Reading](./reading-data.md),
[Writing](./writing-data.md), [remove/has/keys](./delete-has-keys.md),
[Subscriptions](./subscriptions.md). Everywhere a synchronous storage returns a value,
IndexedDB returns a Promise.

## Persist migrations and SSR

IndexedDB is persistent, so it supports schema migration via `version` + `migrate`
(the version is stored as a reserved record in the same store and isn't visible in
`getState()`/`keys()`) — see [Persist migrations](./persist-migration.md). Server state is seeded via
[`hydrate(state)`](./ssr-hydration.md) (for IndexedDB — `await storage.hydrate(...)`).
