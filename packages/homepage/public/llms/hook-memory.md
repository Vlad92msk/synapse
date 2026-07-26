<!-- source: docs/en/hook-memory.md · canonical: https://synapse-homepage.web.app/docs/hook-memory · part of https://synapse-homepage.web.app/llms-full.txt -->

# useCreateStorage (memory)


**TL;DR.** `useCreateStorage({ type: 'memory', name, initialState })` — a React hook that
**creates a storage right inside a component** and destroys it on unmount. The store's lifecycle =
the component's lifecycle; there's no need to keep the store at the module level and manually call
`initialize()`/`destroy()`.

This is the memory variant (ephemeral, in-memory). The same hook with a different `type` gives
persistence: [`localStorage`](./hook-local-storage.md) and [`indexedDB`](./hook-indexeddb.md).

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)).

## Why

A plain [`MemoryStorage`](./memory-storage.md) lives at the module level — one instance for the
whole application, surviving any remounts. But sometimes a store is needed **only inside a specific
screen** and should disappear together with it (so you don't accumulate the state of closed
components and don't share it between instances). Doing this by hand — holding the store in
`useState`, calling `initialize()` in `useEffect`, `destroy()` in cleanup, watching out for the
StrictMode double-effect — is noisy and easy to get wrong. `useCreateStorage` encapsulates this
entire lifecycle.

## When to use

- The store is needed **only inside a component/screen** and should disappear together with it.
- You don't want manual `initialize()` / `destroy()` in `useEffect`.
- You need several **independent** instances of the same store (one per mounted component).

## When NOT to use

- The store must be **global** and survive unmount → create it at the module level
  ([MemoryStorage](./memory-storage.md)) or via [createSynapse](./create-synapse-basic.md).
- You need **selectors / dispatcher / effects** (a full-fledged module) → that's [createSynapse](./create-synapse-basic.md)
  + [createSynapseCtx](./synapse-ctx.md) or [awaitSynapse](./await-synapse.md), not a bare storage hook.
- The state must **survive a reload** → the [localStorage](./hook-local-storage.md) /
  [indexedDB](./hook-indexeddb.md) variant.

## Usage

Copy-paste minimal form:

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<TodoState>({
    type: 'memory',
    name: 'todo-hook-memory',
    initialState: initialTodoState,
  })

  // storage: ISyncStorage<TodoState> | null (non-null only when isReady)
  if (isLoading) return <div>Loading…</div>
  if (hasError) return <div>Error: {status.error?.message}</div>
  if (!isReady) return <div>Initializing…</div>

  // After isReady the storage is guaranteed to be non-null
  storage.set('filter', 'active')
}
```

### Reading state — useStorageSubscribe

```typescript
// Subscribe to the whole state or to individual fields (re-renders only when the result changes)
const state = useStorageSubscribe(storage, (s) => s)
const filter = useStorageSubscribe(storage, (s) => s.filter)
const activeCount = useStorageSubscribe(storage, (s) => s.todos.filter((t) => !t.done).length)
```

`useStorageSubscribe` accepts `storage | null`, so you can call it **before** readiness — it returns
`undefined`. More details in [Subscriptions](./subscriptions.md).

## All parameters (commented)

The whole surface of the hook at once — the config (argument 1) and the lifecycle options (argument 2):

```typescript
const result = useCreateStorage<TodoState>(
  // ── Argument 1: storage config (UniversalStorageConfig) ──────────────────
  {
    type: 'memory',            // 'memory' | 'localStorage' | 'indexedDB' — the type selects the hook variant
    name: 'todo-hook-memory',  // unique storage name
    initialState: initialTodoState, // initial state; TState is inferred from it
    // version / migrate — persist migrations; for 'memory' they are ignored (nothing to persist).
    // middlewares — the store's middleware configurator (see Middlewares).
  },
  // ── Argument 2: lifecycle options (optional) ─────────────────────
  {
    autoInitialize: true,      // auto-initialize() on mount. Defaults to true.
                               //   false → initialize manually by calling result.initialize().
    destroyOnUnmount: true,    // destroy() on unmount. Default: true for memory/local,
                               //   false for indexedDB (a persistent storage is not wiped).
  },
)

// Returned object (discriminated union on isReady):
// storage:    ISyncStorage<TodoState> | null — non-null only when isReady === true
// isReady:    boolean — the storage is created and initialized
// isLoading:  boolean — initialization is in progress
// hasError:   boolean — initialization failed
// status:     { status, error? } — raw status (status.error?.message)
// initialize: () => Promise<void> — manual start (when autoInitialize: false)
// destroy:    () => Promise<void> — manual destruction
```

## Lifecycle options

| Field | Type | Default | Description |
|---|---|---|---|
| `autoInitialize` | `boolean` | `true` | Automatically call `initialize()` on mount. |
| `destroyOnUnmount` | `boolean` | `true` (memory/local), `false` (idb) | Destroy the storage on unmount. |

## See also

- [MemoryStorage](./memory-storage.md) — the same storage at the module level (the global variant).
- [useCreateStorage (localStorage)](./hook-local-storage.md) · [(indexedDB)](./hook-indexeddb.md) — the same hook with persistence.
- [Subscriptions](./subscriptions.md) — `useStorageSubscribe` and reactive reads.
- [createSynapse](./create-synapse-basic.md) — when you need a full-fledged module (selectors/dispatcher/effects).
