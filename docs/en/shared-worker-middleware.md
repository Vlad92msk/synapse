# SharedWorkerMiddleware

> [Back to Main](../../README.md)

`sharedWorkerMiddleware` / `syncSharedWorkerMiddleware` synchronize storage state between tabs
through a **SharedWorker**. It is a direct mirror of [`broadcastMiddleware`](./middlewares.md):
same role, same signature — only the transport differs. Where `broadcastMiddleware` uses a
`BroadcastChannel`, `sharedWorkerMiddleware` routes messages through a single SharedWorker shared
by every tab of the origin.

Like all middlewares, it is wired up at store creation time in the `middlewares` field.

## Which one to import

There are two factories with an identical signature:

- **`syncSharedWorkerMiddleware`** — for synchronous storages (`MemoryStorage`, `LocalStorage`).
- **`sharedWorkerMiddleware`** — for the asynchronous `IndexedDBStorage` (and `WorkerCacheStorage`).

```typescript
import { MemoryStorage, syncSharedWorkerMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'shared-worker-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [
    syncSharedWorkerMiddleware({
      storageName: 'shared-worker-demo',
      storageType: 'memory',
    }),
  ],
})
await storage.initialize()

// Changes are synchronized between tabs
storage.update((s) => { s.todos.push({ id: 't1', title: 'From another tab', done: false }) })
```

The signature is the same `{ storageType, storageName }` as `broadcastMiddleware` — swapping one
for the other is a one-line change.

## What gets synchronized

The behaviour matches `broadcastMiddleware` exactly:

- **MemoryStorage** — full data synchronization. A newly opened tab requests the current state
  from the worker (`requestSync`) and seeds itself, then stays in sync on every write.
- **LocalStorage / IndexedDB** — only a subscriber notification. The data itself is already shared
  by the browser storage engine; the middleware just tells the subscribers of other tabs to
  re-read.

## N stores over ONE SharedWorker

The key difference from `broadcastMiddleware` is transport multiplexing. Each store gets its own
logical channel named `${storageType}-${storageName}`, but **all** channels are multiplexed over a
**single** SharedWorker instance per origin. Ten stores in a tab do not spawn ten workers — they
share one, and messages are demultiplexed by channel name.

```typescript
// Both stores below travel through the SAME SharedWorker,
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

> The channel name is `${storageType}-${storageName}`. Two stores with the same
> `storageType` + `storageName` share one channel — keep the pair unique per logical store.

## Fallback and SSR

- **No SharedWorker?** The transport transparently falls back to a `BroadcastChannel`, so
  cross-tab sync keeps working in browsers/contexts without SharedWorker support.
- **SSR / no browser APIs?** The middleware is a no-op — there is no window, no other tab to sync
  with, and store creation does not throw.

## When to use which

- **`broadcastMiddleware`** — the simple default. One `BroadcastChannel` per store, no worker.
  Fine for a handful of stores.
- **`sharedWorkerMiddleware`** — when you sync **many** stores and want them multiplexed over a
  single SharedWorker instead of many independent channels, or when you already run a SharedWorker
  and want to reuse it. Cross-tab semantics are identical.

For a **live shared cache** (not just notifications) held inside the worker itself, see
[WorkerCacheStorage](./worker-cache-storage.md).

## Types

```typescript
import type { Middleware, SyncMiddleware } from 'synapse-storage/core'

// Both factories take the same props:
interface SharedWorkerMiddlewareProps {
  storageType: StorageType   // 'memory' | 'localStorage' | 'indexedDB' | string
  storageName: string        // used together with storageType as the channel key
}

// syncSharedWorkerMiddleware(props): SyncMiddleware   — Memory / LocalStorage
// sharedWorkerMiddleware(props):     Middleware       — IndexedDB (async)
```
