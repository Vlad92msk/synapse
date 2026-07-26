# SharedWorkerMiddleware

> [Back to contents](./README.md)

`syncSharedWorkerMiddleware` / `sharedWorkerMiddleware` — **cross-tab state synchronization through a
single shared SharedWorker**. A direct mirror of [`broadcastMiddleware`](./middlewares.md): same role,
same signature `({ storageType, storageName })`, same cross-tab result — only the transport differs.
Where the broadcast variant raises one `BroadcastChannel` per store, the shared-worker variant
multiplexes **all** stores over **one** SharedWorker per origin.

It is wired up like any middleware — in the `middlewares` field at store creation time.

## Why

`broadcastMiddleware` creates a separate `BroadcastChannel` per store. When you sync many stores,
that's many independent channels. The SharedWorker transport collapses them into **one** worker per
tab: ten stores share a single worker, and messages are demultiplexed by the logical channel name
`${storageType}-${storageName}`. Bonus — if a SharedWorker is already up for other tasks, you can
reuse it instead of a parallel stack of `BroadcastChannel`s.

The sync semantics are **identical** to the broadcast variant — migrating is a one-line swap.

## When to use

- You sync **many** stores between tabs and want them multiplexed over a single SharedWorker rather
  than spawning separate channels.
- The app **already has** a SharedWorker and you want to reuse it as the transport.

## When NOT needed

- **Few stores (one or two).** Use [`broadcastMiddleware`](./middlewares.md) — simpler, no worker,
  same result.
- **You need a live shared cache inside the worker** (not just notifications, but data living in the
  worker itself) → that's [WorkerCacheStorage](./worker-cache-storage.md), a different tool.
- **No cross-tab scenario at all** — the middleware isn't needed.

## Two factories — which to take

The signature is identical for both; the difference is a synchronous storage vs an asynchronous one:

| Factory | Type | For |
|---|---|---|
| **`syncSharedWorkerMiddleware`** | `SyncMiddleware` | synchronous storages: `MemoryStorage`, `LocalStorage` |
| **`sharedWorkerMiddleware`** | `Middleware` (async) | the asynchronous `IndexedDBStorage` (and `WorkerCacheStorage`) |

## Usage

The minimal copy-paste form (`MemoryStorage`):

```typescript
import { MemoryStorage, syncSharedWorkerMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'shared-worker-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [
    syncSharedWorkerMiddleware({
      storageType: 'memory',
      storageName: 'shared-worker-demo',
    }),
  ],
})
await storage.initialize()

// Changes are synchronized between tabs through a single SharedWorker.
storage.update((s) => { s.todos.push({ id: 't1', title: 'From another tab', done: false }) })
```

Swapping `broadcastMiddleware` → `syncSharedWorkerMiddleware` (or back) is a one-line change — the
props are the same.

## N stores over ONE SharedWorker

The key difference from the broadcast variant is transport multiplexing. Each store gets its own
logical channel `${storageType}-${storageName}`, but **all** channels travel over a **single**
SharedWorker per origin:

```typescript
// Both stores travel through the SAME SharedWorker,
// isolated by their channel: 'memory-todos' vs 'memory-settings'.
const todos = new MemoryStorage<TodoState>({
  name: 'todos',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [syncSharedWorkerMiddleware({ storageType: 'memory', storageName: 'todos' })],
})

const settings = new MemoryStorage<SettingsState>({
  name: 'settings',
  initialState: { theme: 'light' },
  middlewares: () => [syncSharedWorkerMiddleware({ storageType: 'memory', storageName: 'settings' })],
})
```

> The channel name is `${storageType}-${storageName}`. Two stores with the same pair share one
> channel — keep it unique per logical store.

## What exactly gets synchronized

The behaviour matches `broadcastMiddleware` exactly and depends on the storage type:

- **MemoryStorage** — full data synchronization. A newly opened tab requests the current state from
  the worker (`requestSync`), seeds itself, and stays in sync on every write.
- **LocalStorage / IndexedDB** — only a subscriber notification. The data itself is already shared by
  the browser storage engine; the middleware just tells the subscribers of other tabs to re-read.

## Fallback and SSR

- **No SharedWorker?** The transport **transparently** falls back to a `BroadcastChannel` — cross-tab
  sync keeps working in contexts without SharedWorker support. No code change needed.
- **SSR / no browser APIs?** The middleware is a **no-op**: there is no window and no other tabs, and
  store creation does not throw.

## All parameters (commented)

The whole API surface at once — the props are the same for both factories:

```typescript
import { syncSharedWorkerMiddleware } from 'synapse-storage/core'

syncSharedWorkerMiddleware({
  // storageType — the storage type. Affects the sync strategy:
  //   'memory'     → full data synchronization (requestSync + writes);
  //   'localStorage' / 'indexedDB' → subscriber notification only (the browser syncs the data).
  //   Together with storageName it forms the channel key `${storageType}-${storageName}`.
  storageType: 'memory',   // 'memory' | 'localStorage' | 'indexedDB' | 'worker'

  // storageName — the logical channel name. Keep the pair (storageType + storageName)
  //   unique per store, otherwise two stores will share one channel.
  storageName: 'todos',
})
```

## Options

| Field | Type | Description |
|---|---|---|
| `storageType` | `StorageType` (`'memory' \| 'localStorage' \| 'indexedDB' \| 'worker'`) | Storage type; sets the sync strategy. Part of the channel key. |
| `storageName` | `string` | Logical channel name. Together with `storageType` forms the key `${storageType}-${storageName}`. |

## Types

```typescript
import type { Middleware, SyncMiddleware } from 'synapse-storage/core'

// Both factories take the same props:
interface SharedStateMiddlewareProps {
  storageType: StorageType   // 'memory' | 'localStorage' | 'indexedDB' | 'worker'
  storageName: string        // used together with storageType as the channel key
}

// syncSharedWorkerMiddleware(props): SyncMiddleware   — Memory / LocalStorage
// sharedWorkerMiddleware(props):     Middleware       — IndexedDB (async)
```

## See also

- [Middlewares](./middlewares.md) — `broadcastMiddleware` / `syncBroadcastMiddleware`, the same API without a worker.
- [WorkerCacheStorage](./worker-cache-storage.md) — a live shared cache **inside** the worker, not just notifications.
- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) — synchronous storages for `syncSharedWorkerMiddleware`.
- [IndexedDB](./indexeddb-storage.md) — the async storage for `sharedWorkerMiddleware`.
