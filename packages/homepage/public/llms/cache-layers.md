<!-- source: docs/en/cache-layers.md · canonical: https://synapse-homepage.web.app/docs/cache-layers · part of https://synapse-homepage.web.app/llms-full.txt -->

# Caching layers


A request in a synapse app can be answered from **three independent layers**, stacked on top of each
other. They are not competing strategies — each layer solves a different problem, knows different
things, and you enable them independently. This page explains the stack once, so the individual docs
([ApiClient](./api-client.md), [WorkerCacheStorage](./worker-cache-storage.md), the
[ServiceWorker](./custom-fetch-service-worker.md) and [fetchFn](./custom-fetch-fn.md) recipes) can
stay focused on their own layer.

```
your component / effect
        │
        ▼
┌───────────────────────────────────────────────┐
│ 1. APPLICATION CACHE — ApiClient + storage    │  knows YOUR domain: endpoints, tags, ttl
│    (Memory / LocalStorage / IndexedDB /       │  hit ⇒ no fetch() at all, no Network row
│     WorkerCacheStorage)                       │
└───────────────────────────────────────────────┘
        │ cache miss → client calls fetch()
        ▼
┌───────────────────────────────────────────────┐
│ 2. TRANSPORT — baseQuery.fetchFn              │  HOW the request is performed
│    (auth-retry, metrics, axios, worker)       │  not a cache — the seam between layers
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│ 3. NETWORK LAYER — your ServiceWorker         │  knows URLs and HTTP: offline, precache,
│    + Cache API (below it: browser HTTP cache) │  strategies; Network row "(ServiceWorker)"
└───────────────────────────────────────────────┘
        │
        ▼
      network
```

## The request path

What actually happens when a hook or an endpoint fires a query:

1. **`ApiClient` checks its own cache** in `storage` (by cache key, ttl, tags). On a valid hit the
   response is served from the storage — `fetch()` is **never called**, layers 2–3 never see the
   request, and DevTools → Network shows **no row at all**.
2. On a miss the client performs the request through the **transport** — the built-in `fetch`, or
   your `baseQuery.fetchFn` if you provided one.
3. That `fetch()` call is what a **ServiceWorker** can intercept: it answers from its Cache API,
   goes to the network, or synthesizes an offline fallback. Below it sits the regular browser HTTP
   cache.
4. The response travels back up: the SW returns it to `fetch`, the client stores it in its
   application cache (if caching is enabled for that endpoint) and resolves your query.

Two consequences worth internalizing:

- The layers **shadow** each other top-down: a layer-1 hit means the lower layers do nothing.
- Invalidation lives **per layer**: `invalidatesTags` cleans layer 1 only; an SW cache honors its
  own strategy (stale-while-revalidate etc.) and knows nothing about your tags.

## Layer 1 — application cache (storage)

This is `ApiClient`'s own cache, kept in whatever storage you give it. It stores **parsed data** and
understands **your API's semantics**, which is why it can do things no lower layer can:

- **Tag invalidation** — a mutation with `invalidatesTags: ['notes']` drops every cached query
  tagged `notes` and auto-refetches the active ones. An SW can't do this: it sees opaque URL→bytes.
- **Reactivity** — hooks re-render from cache updates and subscriptions.
- **Sync fast-path** — on sync storages (`MemoryStorage`, `LocalStorage`) a cached result is
  readable synchronously on the very first render (no loading flash), important for SSR hydration.
- **Caching is opt-in and GET-only** — with no `cache` config nothing is cached; mutations are never
  cached.

The storage you pick decides the cache's *scope and lifetime*:

| Storage | Scope | Survives reload | Sync fast-path |
|---|---|---|---|
| `MemoryStorage` | one tab | no | yes |
| `LocalStorage` | per tab, data shared via disk | yes | yes |
| `IndexedDBStorage` | per tab, data shared via disk | yes | no |
| `WorkerCacheStorage` | **live, all tabs at once** | while any tab lives | no |

`WorkerCacheStorage` is still layer 1 — it just moves the cache's `Map` into a SharedWorker so all
tabs share one live cache (one tab fetches, every tab hits cache).

## Layer 2 — transport (baseQuery.fetchFn)

Not a cache — the **seam** between the layers: it replaces *how* the client performs a request once
layer 1 missed. Auth-retry, metrics/tracing, an axios instance, a `postMessage` bridge to a Worker.
Layer 1 keeps working unchanged on top of it, and whatever the transport ultimately `fetch`es is
still interceptable by layer 3. See the [Custom `baseQuery.fetchFn`](./custom-fetch-fn.md) recipe.

## Layer 3 — network (your ServiceWorker + Cache API)

An app-owned `sw.js` registered next to (not inside) the library. It intercepts the platform
`fetch` and implements **network policy**: precache of the shell, offline fallbacks, per-URL
strategies (cache-first / network-first / stale-while-revalidate). It knows URLs and HTTP — not your
endpoints or tags — and also covers requests your code didn't make (images, fonts). Because it sits
below `fetch`, every request it serves still shows in Network, tagged `(ServiceWorker)`. See the
[Custom fetch-intercepting ServiceWorker](./custom-fetch-service-worker.md) recipe.

Below the SW there is a fourth, free layer you don't manage: the browser HTTP cache
(`Cache-Control` headers → `(from disk cache)` rows).

## Other libraries do the same

This split is the standard architecture of the web, not a synapse invention. TanStack Query, SWR,
RTK Query and Apollo all keep their own application-level cache and none of them delegates it to a
ServiceWorker; Workbox exists precisely as the layer-3 tool, and a typical PWA runs an app cache
**plus** Workbox side by side. The browser adds the HTTP cache underneath all of them. Layered
caching with different knowledge at each layer is the norm.

## Choosing a setup

- **Data-driven SPA (default)** — layer 1 only: `cache` config + tags on the `ApiClient`. No SW.
- **The same, shared across tabs** — layer 1 with `WorkerCacheStorage` as the client's storage.
- **PWA / offline** — layer 1 for data semantics **plus** your own SW (layer 3) for offline and
  precache. The layers don't conflict: a layer-1 hit just never reaches the SW.
- **"Cache only in the ServiceWorker"** — perfectly valid: leave `ApiClient` caching off (it's
  opt-in) and let your SW own caching. You keep endpoint typing and request state, but give up
  tag invalidation, auto-refetch after mutations and the sync fast-path — every hit is a full
  `fetch` round-trip through the SW.
- **Auth / metrics / custom transport** — layer 2 (`fetchFn`), orthogonal to all of the above.

## DevTools Network cheat-sheet

The Network tab tells you which layer answered:

| What you see | Who answered |
|---|---|
| no row at all | layer 1 — application cache (incl. `WorkerCacheStorage`) |
| row tagged `(ServiceWorker)` | layer 3 — your SW (from its Cache API or network) |
| row `(from disk cache)` / `(memory cache)` | browser HTTP cache |
| plain row with timing | real network |
