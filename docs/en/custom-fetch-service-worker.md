# Custom fetch-intercepting ServiceWorker

> [Back to Main](../../README.md)

An **app-owned ServiceWorker** (Workbox-style) that transparently intercepts `fetch` and applies
network strategies per URL: precache, offline routing, cache-first / network-first /
stale-while-revalidate. It sits **below** `ApiClient`, which never knows it exists — and its
`baseQuery.fetchFn` is **not** touched.

## When you need it

Reach for your own SW when you need real control over the **network layer**, not just an in-tab
cache:

- **Precache** the app shell / static assets so the app boots with no network.
- **Offline routing** — serve a cached response (or a synthesized fallback) when the network is gone.
- **Per-URL strategies** — cache-first for immutable assets, network-first for fresh data,
  stale-while-revalidate for the rest.

If instead you only need a **live cross-tab cache**, that is [`WorkerCacheStorage`](./worker-cache-storage.md).
If you need to change **how** a request is performed (auth-retry, metrics, axios, worker transport),
that is a [custom `baseQuery.fetchFn`](./custom-fetch-fn.md).

## How it works

The SW is a separate script registered by the app. Once it controls the page, the browser routes
**every** `fetch` (including the ones `ApiClient` makes internally) through the SW's `fetch` handler.
Because interception happens **below** `fetch`, the request still reaches the network layer — so it
still shows up in DevTools → Network, tagged `(ServiceWorker)`.

`ApiClient` stays completely ordinary: plain storage, plain `baseQuery`, no custom `fetchFn`. The SW
and the client are two independent layers.

## Registering the ServiceWorker

```typescript
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'

// A totally normal client — it does NOT know a ServiceWorker exists.
const apiClient = new ApiClient({
  storage: new MemoryStorage({ name: 'api-cache', initialState: {} }),
  baseQuery: { baseUrl: 'https://pokeapi.co/api/v2', timeout: 10000 },
  endpoints: async (create) => ({
    getPokemon: create({
      request: ({ id }) => ({ path: `/pokemon/${id}`, method: 'GET' }),
      cache: true,
    }),
  }),
})

// Register the app-owned SW separately. This is the ONLY wiring it needs.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/custom-sw.js')
}
```

## The ServiceWorker script

The SW is a hand-written static asset (served from `public/custom-sw.js`) that you author and own —
synapse does not generate it for you. Precache on install, stale-while-revalidate per URL, offline fallback:

```javascript
const CACHE = 'custom-fetch-demo-v1'
const PRECACHE_URLS = ['/', '/index.html']
const SWR_HOST = 'pokeapi.co'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE_URLS).catch(() => undefined)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.hostname === SWR_HOST) event.respondWith(staleWhileRevalidate(event.request))
})

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone())
      return res
    })
    .catch(() => null)
  if (cached) return cached // serve stale, revalidate in background
  return (await network) ?? offlineFallback(request)
}
```

> **Tip.** `skipWaiting()` + `clients.claim()` let the SW start controlling open tabs immediately.
> Without them, a freshly registered SW only controls the page after the next reload.

## How it differs from WorkerCacheStorage

They solve **different** problems and act at **different** layers:

- [`WorkerCacheStorage`](./worker-cache-storage.md) is a **storage backend** for `ApiClient`. On a
  cache hit the client short-circuits **above** `fetch` — the request never happens, so there is
  **no** Network row at all. It is a live cross-tab cache, not an offline layer.
- The custom SW is a **network interceptor**. It sits **below** `fetch`, so the request still shows
  up in Network (tagged `(ServiceWorker)`), and it can serve responses fully offline.

> **Warning.** The SW is unrelated to `ApiClient.storage`. The storage is the client's in-tab
> cache/tag layer; the SW is a platform-level network interceptor. Configuring one does not affect
> the other.

## Network behavior

Where a response comes from is directly observable in DevTools → Network:

| Source                                   | Network row                 |
| ---------------------------------------- | --------------------------- |
| `WorkerCacheStorage` cache hit           | **no row** (fetch skipped)  |
| App-owned SW cache / offline hit         | row tagged `(ServiceWorker)`|
| Browser HTTP cache (`Cache-Control`)     | row tagged `(from disk cache)` |
| Cold network fetch                       | normal row                  |

## When to use

- **Offline / network control** (precache, offline routing, per-URL strategies) → your own SW, as
  here. No library changes.
- **Live cross-tab cache** (shared state held in a worker) → [`WorkerCacheStorage`](./worker-cache-storage.md).
- **Replace the transport** (auth-retry, metrics, axios, worker) → [custom `baseQuery.fetchFn`](./custom-fetch-fn.md).
