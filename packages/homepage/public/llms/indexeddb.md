<!-- source: docs/en/indexeddb-storage.md · canonical: https://synapse-homepage.web.app/docs/indexeddb · part of https://synapse-homepage.web.app/llms-full.txt -->

# IndexedDBStorage


**TL;DR:** a persistent storage on top of IndexedDB with an **asynchronous** API. For large volumes and binary data, where localStorage is too tight. Read/write operations return a Promise.

## Why

Persistence without the localStorage limit: IndexedDB holds large arrays and binary data (Blob/ArrayBuffer) and survives reloads. The price is asynchrony: `get`/`set`/`update`/`has`/`keys`/`getState` return a Promise. But the state can always be read **synchronously from the cache** via `getStateSync()` (including in render).

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)), but in a persistent asynchronous storage.

## When to use

- Large amounts of data, arrays of thousands of items, binary data (Blob/ArrayBuffer).
- You need persistence beyond the localStorage limit (~5 MB).

## When NOT to use

- Small state where you don't want asynchrony → [LocalStorage](./local-storage.md).
- Ephemeral UI state → [MemoryStorage](./memory-storage.md).
- The store is needed **synchronously on the server** (SSR/SSG) → IndexedDB has no synchronous construction, and the C-form of [`createSynapse`](./create-synapse-basic.md) does not bring it up synchronously. For a server-safe sync store see [browserStorage](./browser-storage.md).

## How it differs from neighboring storages

| | API | Volume | Server |
|---|---|---|---|
| [MemoryStorage](./memory-storage.md) | sync | RAM | works (ephemeral) |
| [LocalStorage](./local-storage.md) | sync | ~5 MB, strings | needs [browserStorage](./browser-storage.md) |
| **IndexedDB** | **async** | large/binary | **no sync construction** |

## Usage

Copy-paste minimal form (the `options` field is required, may be empty):

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: {}, // required field (may be an empty object)
})

// Or via the static .create() — equivalent to new
const storage = IndexedDBStorage.create<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: {},
})

await storage.initialize()
```

## All parameters (commented)

`IndexedDBStorage` accepts `IndexedDBStorageConfig<T>` — this is `AsyncStorageConfig` + the required `options`.

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

const storage = new IndexedDBStorage<TodoState>({
  // name — required. The name of the store (object store) inside the database.
  name: 'todo-idb',

  // initialState — the default on first run (when the DB is still empty).
  initialState: initialTodoState,

  // options — REQUIRED field (unlike memory/local). Database settings.
  options: {
    // dbName? — the IndexedDB database name. Defaults to 'app_storage'.
    //   Stores with the same dbName live in the same database.
    dbName: 'my_app_db',
  },

  // version? — the version of the state SCHEMA (persist-migration), not to be confused with the DB version.
  //   The version is stored as a reserved record in the same store, not visible in getState()/keys().
  version: 2,

  // migrate? — transforms saved state of an older version to the current schema.
  migrate: (persisted, fromVersion) =>
    fromVersion < 2 ? normalizeOld(persisted) : persisted,

  // middlewares? — the pipeline of ASYNC middleware (getDefault provides batching/shallowCompare/logger).
  middlewares: (getDefault) => [getDefault().shallowCompare()],

  // singleton? — one instance per name/key (enabled/mergeStrategy/warnOnConflict/key).
  singleton: { enabled: true },
})
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | **Required.** The object store name. |
| `options` | `IndexedDBConfig` | **Required.** `{ dbName? }` (defaults to `'app_storage'`). |
| `initialState?` | `T` | The default on first run. |
| `version?` | `number` | Schema version for migrations. |
| `migrate?` | `MigrateFn<T>` | Transform an old schema to the current one. |
| `middlewares?` | `(getDefault) => AsyncMiddleware[]` | The async middleware pipeline. |
| `singleton?` | `SingletonOptions` | One instance per `name`/`key`. |

## Synchronous vs asynchronous API

The key difference from Memory/LocalStorage: operations return a Promise.

```typescript
// Writing
await storage.set('filter', 'active')
await storage.update((s) => { s.todos.push(createTodo('New task')) })

// Reading
const todos = await storage.get<Todo[]>('todos')
const state = await storage.getState()

// getStateSync() — synchronous read from the cache, always available (including in render)
const cached = storage.getStateSync()
```

Subscriptions (`subscribe`, `subscribeToAll`, `useStorageSubscribe`) are identical to synchronous storages.

## Working with data

A full walkthrough of the operations is in the "Working with data" section: [Reading](./reading-data.md), [Writing](./writing-data.md), [remove/has/keys](./delete-has-keys.md), [Subscriptions](./subscriptions.md). Everywhere a synchronous storage returns a value, IndexedDB returns a Promise.

## Persist migrations and SSR

IndexedDB is persistent, so it supports schema migration via `version` + `migrate` (the version is stored as a reserved record in the same store and isn't visible in `getState()`/`keys()`) — see [Persist migrations](./persist-migration.md). Server state is seeded via [`hydrate(state)`](./ssr-hydration.md) (for IndexedDB — `await storage.hydrate(...)`).

## See also

- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md)
- [Persist migrations](./persist-migration.md) · [SSR hydration](./ssr-hydration.md)
