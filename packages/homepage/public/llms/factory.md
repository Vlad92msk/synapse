<!-- source: docs/en/storage-factory.md · canonical: https://synapse-homepage.web.app/docs/factory · part of https://synapse-homepage.web.app/llms-full.txt -->

# StorageFactory


**TL;DR:** a static storage factory — an alternative to calling `new MemoryStorage()` / `new LocalStorage()` / `new IndexedDBStorage()` directly. Useful when the storage type is chosen in a single place or at runtime.

## Why

A single entry point for creating stores. Either typed methods (`createMemory`/`createLocal`/`createIndexedDB`), or the universal `create({ type })`, where the type is set by a field and can depend on the environment/config. Under the hood, each method calls `.create()` of the corresponding class — behavior is identical to `new`.

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## When to use

- The storage type is chosen in a single place or depends on configuration/environment.
- You want a unified style for creating all of the application's stores.

## When not to use

- The type is fixed and known → a direct `new` / [`.create()`](./static-create.md) is just as good.
- The store lives inside a React component → [`useCreateStorage`](./hook-memory.md) is more convenient, and it also manages the lifecycle.

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

## All parameters (commented)

The universal `create` takes a `UniversalStorageConfig<T>` — the base config plus a `type` field. The set of available fields matches the config of the concrete storage.

```typescript
import { StorageFactory } from 'synapse-storage/core'

const storage = StorageFactory.create<TodoState>({
  // type — REQUIRED (only on the universal create). Selects the adapter and the return type:
  //   'memory' | 'localStorage' -> ISyncStorage,  'indexedDB' -> IAsyncStorage.
  //   'worker' is NOT included here (WorkerCacheStorage is not created via the factory).
  type: 'indexedDB',

  // name — required. The store identifier.
  name: 'todo-universal-idb',

  // initialState — the initial state; TState is inferred from it.
  initialState: initialTodoState,

  // options — required ONLY for type: 'indexedDB' ({ dbName? }); ignored for memory/local.
  options: { dbName: 'app_storage' },

  // version? / migrate? — persist migrations (work for local/indexedDB, ignored for memory).
  version: 1,
  migrate: (persisted, fromVersion) => persisted,

  // middlewares? — the middleware pipeline (sync or async depending on type).
  middlewares: (getDefault) => [getDefault().shallowCompare()],

  // singleton? — one instance per name/key (enabled/mergeStrategy/warnOnConflict/key).
  singleton: { enabled: true },
})
```

| Field | Type | Description |
|---|---|---|
| `type` | `'memory' \| 'localStorage' \| 'indexedDB'` | **Required** (only on `create`). Selects the adapter. |
| `name` | `string` | **Required.** The store identifier. |
| `initialState?` | `T` | The initial state. |
| `options?` | `IndexedDBConfig` | Required for `indexedDB`. |
| `version?` / `migrate?` | `number` / `MigrateFn<T>` | Persist migrations (local/indexedDB). |
| `middlewares?` | `(getDefault) => Middleware[]` | The middleware pipeline. |
| `singleton?` | `SingletonOptions` | One instance per `name`/`key`. |

## See also

- [Static .create()](./static-create.md) — `new` vs `.create()` vs `StorageFactory`.
- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) · [IndexedDB](./indexeddb-storage.md).

Reading, writing, and subscriptions — see the "Working with data" section.
