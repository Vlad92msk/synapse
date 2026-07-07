<!-- source: docs/en/worker-cache-storage.md · canonical: https://synapse-homepage.web.app/docs/worker-cache · part of https://synapse-homepage.web.app/llms-full.txt -->

# WorkerCacheStorage


`WorkerCacheStorage` is an **asynchronous** storage (`extends AsyncBaseStorage`, `type: 'worker'`)
whose data lives inside a **SharedWorker** instead of the tab. It mirrors the key/path semantics of
[MemoryStorage](./memory-storage.md) key-for-key — the difference is **where** the `Map` lives: in a
**live** in-memory cache inside a SharedWorker, shared across every tab of the origin. Think
"MemoryStorage that other tabs can see too".

## Creating

```typescript
import { WorkerCacheStorage } from 'synapse-storage/core'

// Live cross-tab cache held inside a SharedWorker
const storage = new WorkerCacheStorage<TodoState>({
  name: 'todo-worker',
  initialState: initialTodoState,
  options: {}, // channelName defaults to config.name
})
await storage.initialize()

// Or via the static .create()
const storage = WorkerCacheStorage.create<TodoState>({
  name: 'todo-worker',
  initialState: initialTodoState,
})
```

The API is identical to any other async storage — `await set/get/update/delete`, `getStateSync()`,
subscriptions. See [Reading](./reading-data.md), [Writing](./writing-data.md),
[remove/has/keys](./delete-has-keys.md), [Subscriptions](./subscriptions.md).

Stores that share the same `channelName` (defaults to `name`) share the same cache — that is how
two tabs, or an [API `QueryStorage`](./api-client.md) and its consumer, land on the same data.

## Live cross-tab cache

```typescript
const storage = new WorkerCacheStorage<TodoState>({
  name: 'live-cache',
  initialState: initialTodoState,
  options: { channelName: 'live-cache' },
})
await storage.initialize()

// Written in one tab, immediately visible to another tab reading the same channelName.
await storage.set('filter', 'active')
```

- Capabilities: `{ shared: true }`.
- The cache is **live**: it holds the current state and is shared between tabs, exactly like a
  MemoryStorage that lives in the SharedWorker. A tab that joins late always receives a fresh
  snapshot from the worker.
- If SharedWorker is unavailable (SSR / tests), the transport falls back to an in-process `Map` —
  the round-trip is identical, but **without** cross-tab sharing (only a real SharedWorker gives
  that).

> **Need offline or fetch control?** `WorkerCacheStorage` is a **live cross-tab cache**, not an
> offline layer — it never touches the network and does not survive a fully closed session. For
> real offline / network control, use a separate recipe instead of this storage:
>
> - [Custom fetch-intercepting ServiceWorker](./custom-fetch-service-worker.md) — your own `sw.js`
>   transparently intercepts `fetch` (precache, offline routing, cache-first / network-first /
>   stale-while-revalidate). It lives **below** `ApiClient` and is unrelated to its storage.
> - [Custom `baseQuery.fetchFn`](./custom-fetch-fn.md) — replace **how** the client performs a
>   request (auth-retry, metrics, axios, or a Web Worker transport) while the cache/tags layer keeps
>   working on top unchanged.

## Tag invalidation (API cache)

When `WorkerCacheStorage` backs an API [`QueryStorage`](./api-client.md), the tag index is **not**
part of the shared payload — it is **rebuilt on connect** via `rebuildTagIndex`. A second consumer
attaching to the same `channelName` scans the existing entries and reconstructs its tag → keys map,
so tag-based invalidation keeps working across tabs / instances without shipping the index through
the port.

## Pitfalls and limitations

1. **This is a live cache, not persistence.** The state lives in the SharedWorker's memory. It is
   shared across open tabs and survives a tab reload while the worker stays alive, but it is **not**
   an offline / session-surviving store. For that, see the recipes linked above.
2. **Values must be structured-clone-able.** Everything that crosses the worker port is subject to
   the structured-clone algorithm — functions, `Symbol`, `Blob`/`Response`/`Headers` and cyclic
   structures cannot cross the port. Store plain, clone-compatible data only.
3. **The tag index is rebuilt, not transferred.** As above, `rebuildTagIndex` reconstructs the API
   tag index on connect rather than sending it through the port — expect a rebuild pass when a new
   consumer attaches.
4. **SharedWorker fallback is silent-but-degraded.** Without SharedWorker support the transport uses
   an in-process `Map`: the API is identical but there is no cross-tab sharing.
5. **A broken custom `workerUrl` does not auto-fall-back.** `new SharedWorker(url)` succeeds even if
   the script 404s or has the wrong MIME type — the failure surfaces asynchronously, after the
   transport already committed to worker mode. There is no mid-flight fallback: operations then reject
   by timeout. The channel logs an actionable warning; make sure a custom `workerUrl` is served
   same-origin as `application/javascript`. Omit `workerUrl` to use the safe inline blob.
6. **Large initial `getAll` may hit the RPC timeout.** Each store RPC has a `requestTimeoutMs` budget
   (default 1000ms). Priming a very large cache on a slow device can exceed it and fail `initialize()`
   — raise `options.requestTimeoutMs` in that case.

## When to use

- **Live cross-tab cache** (shared state across tabs held in a worker) → `WorkerCacheStorage`.
- **Offline / network control** (data available without a network, fetch interception) → not this
  storage; see [custom fetch-intercepting ServiceWorker](./custom-fetch-service-worker.md) or a
  [custom `fetchFn`](./custom-fetch-fn.md).
- Just cross-tab **notifications** on an existing store → you don't need this at all; use
  [`sharedWorkerMiddleware`](./shared-worker-middleware.md) / `broadcastMiddleware`.

## Types

```typescript
import { WorkerCacheStorage } from 'synapse-storage/core'
import type { WorkerStorageConfig, WorkerStorageOptions } from 'synapse-storage/core'

interface WorkerStorageOptions {
  channelName?: string       // default: config.name — same channelName ⇒ shared cache
  workerUrl?: string | URL   // custom SharedWorker script (else inline blob)
  requestTimeoutMs?: number  // per-RPC timeout, default 1000 — raise for large initial getAll
}

// WorkerStorageConfig<T> extends AsyncStorageConfig<T> with options?: WorkerStorageOptions
```
