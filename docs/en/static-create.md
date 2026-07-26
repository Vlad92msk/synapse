# Static .create()

> [Back to contents](./README.md) · [Working example on GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/StaticCreateExample.tsx)

**TL;DR:** every storage class has a static `.create()` method — a full equivalent of the `new` operator. A matter of style, not behavior.

## Why

`new MemoryStorage(...)` and `MemoryStorage.create(...)` create identical stores. `.create()` is handy when you want a single "factory" style of call without the `new` keyword (for example, when passing a method reference), or when the codebase style avoids `new`.

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## When to use it

- You need an ordinary store with a fixed type, but stylistically you want `.create()` instead of `new`.

## When you don't need it

- The type is chosen at runtime or in a single place → [`StorageFactory`](./storage-factory.md).
- The store lives inside a React component → [`useCreateStorage`](./hook-memory.md) (it manages the lifecycle).

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

The config for `.create()` is the same as for `new` of the corresponding class — every field is covered in the storage docs ([Memory](./memory-storage.md) / [Local](./local-storage.md) / [IndexedDB](./indexeddb-storage.md)).

## new, .create() or StorageFactory?

| Way | When |
|---|---|
| `new` / `.create()` | The type is known and fixed. Fully equivalent. |
| [`StorageFactory`](./storage-factory.md) | The type is chosen in a single place or at runtime. |
| [`useCreateStorage`](./hook-memory.md) | The store lives inside a React component. |

## See also

- [StorageFactory](./storage-factory.md) · [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) · [IndexedDB](./indexeddb-storage.md)
