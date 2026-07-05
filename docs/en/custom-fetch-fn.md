# Custom baseQuery.fetchFn

> [Back to Main](../../README.md)

`ApiClient` accepts a custom transport through `baseQuery.fetchFn?: typeof fetch`. It replaces **how**
the client performs a request — an axios wrapper, an auth-retry, a metrics probe, or a `postMessage`
bridge to a Web Worker for heavy parsing. This is the **transport**, not a ServiceWorker interception
(for that, see [Custom fetch-intercepting ServiceWorker](./custom-fetch-service-worker.md)).

> **The library does NOT need extending.** `fetchFn` is a built-in field of `baseQuery`. You never
> touch the library source — you pass your own function and the client uses it verbatim.

## When it makes sense

- **Auth-retry** — attach an `Authorization` header and do a single silent `refresh → retry` when the
  server answers `401`, so the rest of the app never sees the expiry.
- **Metrics / tracing** — time every request, inject a trace id, report failures.
- **axios (or any client)** — reuse an existing axios instance, interceptors and all, by adapting its
  response back into a standard `Response`.
- **Worker transport** — offload `fetch` + heavy parsing to a `Worker` via `postMessage` and return a
  ready `Response`, keeping the main thread free.

## Configuration

```typescript
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'

// A custom fetchFn matches the `typeof fetch` signature exactly.
const customFetch: typeof fetch = async (input, init) => {
  // ...do whatever the transport needs, then return a Response
  return fetch(input, init)
}

const client = new ApiClient({
  storage: new MemoryStorage({ name: 'api-cache', initialState: {} }),
  baseQuery: {
    baseUrl: 'https://api.example.com',
    fetchFn: customFetch, // ← replaces the transport; everything else is unchanged
  },
  cache: { ttl: 60_000 },
  endpoints: async (create) => ({
    getNotes: create({ request: () => ({ path: '/notes', method: 'GET' }), tags: ['notes'] }),
  }),
})
```

`fetchFn` must satisfy `typeof fetch`: `(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>`.
The client calls it with the fully-built URL and `RequestInit` (method, headers, serialized body,
`signal`, `credentials`), and reads the returned `Response` exactly as it would a native one.

## Auth-retry example

A `fetchFn` that adds a bearer token and does exactly one silent refresh-then-retry on `401`:

```typescript
let sessionToken = getToken()

const customFetch: typeof fetch = async (input, init) => {
  const send = (token: string) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  }

  let res = await send(sessionToken)
  if (res.status === 401) {
    // The ApiClient above never sees the 401 — it only gets the retried result.
    sessionToken = await refreshToken()
    res = await send(sessionToken)
  }
  return res
}
```

The `401` handling lives entirely in the transport. The `ApiClient` — its endpoints, cache and tags —
is oblivious to the retry: it hands off a request and gets back a successful `Response`.

## Cache and tags work on top

The custom transport sits **below** the cache/tags layer, so caching, TTL, tags and tag-invalidation
keep working with no changes:

```typescript
endpoints: async (create) => ({
  // GET — cached and tagged
  getNotes: create({ request: () => ({ path: '/notes', method: 'GET' }), cache: true, tags: ['notes'] }),
  // POST — invalidates the tag on success
  addNote: create({
    request: (body) => ({ path: '/notes', method: 'POST', body }),
    cache: false,
    invalidatesTags: ['notes'],
  }),
})

await client.request('getNotes', {})   // → runs through customFetch
await client.request('getNotes', {})   // → served from cache, customFetch is NOT called
await client.request('addNote', { title: 'x' }) // → invalidates 'notes'
await client.request('getNotes', {})   // → refetches through customFetch again
```

> **The cache short-circuits above the transport.** A cache hit never reaches `fetchFn` — there is no
> transport call at all. `fetchFn` only runs on a cache miss or an invalidated tag.

## No library extension needed

Both fetch-control axes are available without patching `synapse-storage`:

- **Transport swap** (this page) → `baseQuery.fetchFn`, built in.
- **Transparent `fetch` interception** → your own [ServiceWorker](./custom-fetch-service-worker.md),
  which lives below the client and is unrelated to its storage.

## When to use

- Need to change **how** a request is sent (auth, retries, metrics, axios, worker) → `fetchFn`.
- Need to intercept `fetch` transparently for precache / offline / URL strategies → a
  [custom ServiceWorker](./custom-fetch-service-worker.md), not `fetchFn`.
- Need a live cross-tab response cache → [`WorkerCacheStorage`](./worker-cache-storage.md), a storage
  backend, unrelated to the transport.
