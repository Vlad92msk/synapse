<!-- source: docs/en/hook-local-storage.md · canonical: https://synapse-homepage.web.app/docs/hook-local · part of https://synapse-homepage.web.app/llms-full.txt -->

# useCreateStorage (localStorage)


**TL;DR.** The same [`useCreateStorage`](./hook-memory.md), only `type: 'localStorage'` — data survives
a page reload. The only difference from the memory variant in code is the `type` field; everything else
(the returned object, the lifecycle options, `useStorageSubscribe`) is identical.

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## Why

Screen state (a draft, the selected filter, local settings) should survive a reload, but setting up a
global module-level store just for that is overkill. `useCreateStorage` with `type: 'localStorage'` gives
a **component-scoped** store, synchronous (`ISyncStorage`), with automatic persistence to `localStorage`
and no manual `initialize()`/`destroy()`.

## When to use

- A component/screen state should **survive a reload** (draft, filter, settings), but you don't want to
  set up a global module-level store.
- The data is small and **synchronous** (`localStorage` limit ~5 MB; everything is serialized to a string).

## When not to use

- The state is ephemeral (doesn't survive a reload) → [memory variant](./hook-memory.md).
- **Large** data or binary, you need async → [IndexedDB variant](./hook-indexeddb.md).
- You need a **global** persistent store at the module level → [LocalStorage](./local-storage.md)
  directly or via [createSynapse](./create-synapse-basic.md).
- The store renders on the **server** (SSR/SSG) — there's no `localStorage` there; for a module-level
  store, wrap it in [`browserStorage`](./browser-storage.md).

## Usage

Copy-paste minimal form:

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady } = useCreateStorage<TodoState>({
    type: 'localStorage',         // <- the only difference from memory
    name: 'todo-hook-local',
    initialState: initialTodoState,
  })

  if (!isReady) return <div>Loading…</div>

  // Reading and writing — same as with memory (storage: ISyncStorage<TodoState>)
  const todos = useStorageSubscribe(storage, (s) => s.todos)
  storage.set('filter', 'completed')
}
```

## All parameters (commented)

Differs from [memory](./hook-memory.md) only in `type` and the `destroyOnUnmount` default; here you also
have `version`/`migrate` available (the persist is real):

```typescript
const result = useCreateStorage<TodoState>(
  {
    type: 'localStorage',      // the type selects the hook variant
    name: 'todo-hook-local',   // the key in localStorage
    initialState: initialTodoState, // TState is inferred from it
    version: 2,                // persist schema version (see Persist migrations). Optional.
    migrate: (old, from) => (from < 1 ? { ...old } : old), // upgrade old data to the current schema
    // middlewares — the store's middleware configurator (see Middlewares).
  },
  {
    autoInitialize: true,      // auto initialize() on mount. Defaults to true.
    destroyOnUnmount: true,    // destroy() on unmount. Defaults to true for localStorage.
                               //   NB: destroy() of an ephemeral store cleans only the instance; the
                               //   data in localStorage is controlled by the adapter's clearOnDestroy
                               //   (the default for localStorage is not to clear). See LocalStorage.
  },
)
// The returned object is identical to the memory variant (storage: ISyncStorage<TodoState> | null etc.).
```

## Lifecycle options

| Field | Type | Default | Description |
|---|---|---|---|
| `autoInitialize` | `boolean` | `true` | Automatically call `initialize()` on mount. |
| `destroyOnUnmount` | `boolean` | `true` | Destroy the storage instance on unmount. |

## See also

- [useCreateStorage (memory)](./hook-memory.md) — the base description of the hook and the returned object.
- [useCreateStorage (indexedDB)](./hook-indexeddb.md) — for large/asynchronous data.
- [LocalStorage](./local-storage.md) — the same storage at the module level (the global variant).
- [Persist migrations](./persist-migration.md) — `version`/`migrate`.
- [browserStorage](./browser-storage.md) — an SSR-safe wrapper for a module-level `LocalStorage`.
