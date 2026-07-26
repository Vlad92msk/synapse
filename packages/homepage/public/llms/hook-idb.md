<!-- source: docs/en/hook-indexeddb.md · canonical: https://synapse-homepage.web.app/docs/hook-idb · part of https://synapse-homepage.web.app/llms-full.txt -->

# useCreateStorage (indexedDB)


**TL;DR.** The same [`useCreateStorage`](./hook-memory.md) with `type: 'indexedDB'` — a component
store for **large / persistent** data. Returns `IAsyncStorage` (writes return a `Promise`).
Differences from the sync variants: asynchronous initialization and **`destroyOnUnmount` defaults
to `false`** (a persistent storage usually isn't wiped on unmount).

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## Why

When a component store needs persistence **and** a volume larger than the `localStorage` limit
(~5 MB), or structured/binary data. `useCreateStorage` with `type: 'indexedDB'` takes on the
asynchronous DB initialization and lifecycle; you can still read synchronously from the cache via
`useStorageSubscribe`, while writes (`set`/`update`) go asynchronously, though `await` isn't
required in handlers.

## When to use

- A component store needs **persistence and/or large volumes** of data.
- Data is structured, doesn't fit in `localStorage`, or asynchronous writes are needed.

## When not to use

- Small persistent state without asynchrony → [localStorage variant](./hook-local-storage.md)
  (simpler, synchronous).
- Ephemeral state → [memory variant](./hook-memory.md).
- You need a **global** IndexedDB store → [IndexedDB](./indexeddb-storage.md) at the module level.
- The store must **render synchronously on the server** — an async storage has no sync shell
  (see [createSynapseCtx](./synapse-ctx.md), the section on async stores).

## Usage

Copy-paste minimal form:

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady } = useCreateStorage<TodoState>({
    type: 'indexedDB',
    name: 'todo-hook-idb',
    initialState: initialTodoState,
  })
  // storage: IAsyncStorage<TodoState> | null

  if (!isReady) return <div>Loading…</div>

  // useStorageSubscribe reads state synchronously from the cache — identical to sync storages
  const todos = useStorageSubscribe(storage, (s) => s.todos)

  // set/update return a Promise, but await isn't required in handlers
  storage.update((s) => { s.filter = 'active' })
}
```

## All parameters (commented)

Differences from the sync variants: `options.dbName`, the async return of `storage`, and the
`destroyOnUnmount: false` default:

```typescript
const result = useCreateStorage<TodoState>(
  {
    type: 'indexedDB',         // the type picks the hook variant → IAsyncStorage
    name: 'todo-hook-idb',     // the object store name
    initialState: initialTodoState, // TState is inferred from it
    version: 2,                // persist schema version (see Persist migrations). Optional.
    migrate: (old, from) => old, // upgrade old data to the current schema
    options: { dbName: 'my-app-db' }, // the IndexedDB database name (groups several stores into one DB)
    // middlewares — the store's async-middleware configurator (see Middlewares).
  },
  {
    autoInitialize: true,      // auto initialize() on mount. Defaults to true.
    destroyOnUnmount: false,   // DEFAULT false for indexedDB (a persistent store isn't wiped on
                               //   unmount). Pass true to destroy it explicitly.
  },
)
// The returned object is the same as the memory variant, but storage: IAsyncStorage<TodoState> | null.
```

To destroy the store on unmount, pass the option explicitly:

```typescript
useCreateStorage<TodoState>(
  { type: 'indexedDB', name: 'todo-hook-idb', initialState: initialTodoState },
  { destroyOnUnmount: true },
)
```

## Lifecycle options

| Field | Type | Default | Description |
|---|---|---|---|
| `autoInitialize` | `boolean` | `true` | Automatically call `initialize()` on mount. |
| `destroyOnUnmount` | `boolean` | **`false`** | Destroy the storage on unmount. Off by default for IndexedDB. |

## See also

- [useCreateStorage (memory)](./hook-memory.md) — the base description of the hook and the returned object.
- [useCreateStorage (localStorage)](./hook-local-storage.md) — for small synchronous data.
- [IndexedDB](./indexeddb-storage.md) — the same storage at the module level (the global variant).
- [Persist migrations](./persist-migration.md) — `version`/`migrate`.
