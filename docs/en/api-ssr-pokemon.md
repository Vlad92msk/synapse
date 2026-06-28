# Pokémon SSR — server render + client pagination

> [Back to Main](../../README.md)

A practical recipe: fetch the **first page on the server**, ship the cache to the client, render it with no
loading flash, and let **pagination continue on the client** from there. Built on the same Pokémon API as
the [ApiClient](./api-client.md) and [useApiQuery](./api-use-query.md) pages.

The `ApiClient` is server-safe: the network layer uses the global `fetch` (configurable via `fetchFn`),
and every `window`/`document`/`localStorage` access is guarded by `typeof ... !== 'undefined'`. On the
server use `MemoryStorage`; on the client any storage works (a sync one — `Memory`/`LocalStorage` — gives
the instant first render).

## The idea

The cache key is **endpoint name + params**, so each page (`offset`) is its own cache entry:

- `offset: 0` was fetched on the server → it's in the cache → the first client render is instant;
- `offset: 12` was not → cache miss → a normal network request **on the client**;
- back to `offset: 0` (while the TTL holds) → instant from cache again.

## Shared API factory

Use a **factory** (a fresh instance per server request — don't share one client across requests). The
`storage` is itself a factory so each `init()` gets a clean store.

```typescript
// pokemon.api.ts
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'

interface PokemonListApiResponse {
  count: number
  next: string | null
  results: Array<{ name: string; url: string }>
}

export function createPokemonApi() {
  return new ApiClient({
    storage: () => new MemoryStorage<Record<string, any>>({ name: 'pokemon-api-cache', initialState: {} }),
    baseQuery: { baseUrl: 'https://pokeapi.co/api/v2', timeout: 10000 },
    cache: { ttl: 120000 },
    endpoints: async (create) => ({
      getList: create<{ limit: number; offset: number }, PokemonListApiResponse>({
        request: (params) => ({ path: '/pokemon', method: 'GET', query: params }),
        tags: ['pokemon-list'],
      }),
    }),
  })
}

export type PokemonApiEndpoints = ReturnType<ReturnType<typeof createPokemonApi>['getEndpoints']>
```

## Server: warm the cache and dehydrate

```tsx
// server.tsx
import { renderToString } from 'react-dom/server'
import { createPokemonApi } from './pokemon.api'
import { App } from './App'

const PAGE_SIZE = 12

export async function renderApp() {
  const api = createPokemonApi() // per-request instance
  await api.init()

  // Warm the cache with the first page
  await api.request('getList', { limit: PAGE_SIZE, offset: 0 })

  // Render: useApiQuery reads the cache synchronously → data lands in the HTML
  const html = renderToString(<App endpoints={api.getEndpoints()} />)

  // Snapshot the cache for the client
  const state = await api.dehydrate()
  await api.destroy()

  return { html, state }
}

// In your HTML template, inline the snapshot:
//   <script>window.__POKEMON_API_STATE__ = ${JSON.stringify(state)}</script>
```

## Client: hydrate and render

```tsx
// client.tsx
import { hydrateRoot } from 'react-dom/client'
import { createPokemonApi } from './pokemon.api'
import { App } from './App'

async function bootstrap() {
  const api = createPokemonApi()
  await api.hydrate(window.__POKEMON_API_STATE__) // BEFORE init → seeds the cache
  await api.init()

  hydrateRoot(document.getElementById('root')!, <App endpoints={api.getEndpoints()} />)
}

bootstrap()
```

## The component: first page from cache, pagination on the client

```tsx
// App.tsx
import { useState } from 'react'
import { useApiQuery } from 'synapse-storage/react'
import type { PokemonApiEndpoints } from './pokemon.api'

const PAGE_SIZE = 12

export function App({ endpoints }: { endpoints: PokemonApiEndpoints }) {
  const [offset, setOffset] = useState(0)

  // offset=0 → instant from the hydrated cache (no loading flash).
  // offset=12 → cache miss → network request on the client.
  const { data, isLoading, fromCache } = useApiQuery(endpoints.getList, { limit: PAGE_SIZE, offset })

  const items = data?.results ?? []
  const hasMore = !!data?.next

  return (
    <div>
      <ul>{items.map((p) => <li key={p.name}>{p.name}</li>)}</ul>

      {isLoading && <span>Loading…</span>}
      {fromCache && <small>from cache</small>}

      <button disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>Prev</button>
      <button disabled={!hasMore} onClick={() => setOffset((o) => o + PAGE_SIZE)}>Next</button>
    </div>
  )
}
```

The first page renders identically on the server and on the client's first paint (so React hydration
matches — no mismatch warning). Clicking **Next** changes `offset`, which is a new cache key → the client
fetches the next page; **Prev** returns to a page that's still cached → instant.

## Prewarming several pages

Warm more than one page on the server — they all land in the snapshot:

```typescript
await Promise.all([
  api.request('getList', { limit: PAGE_SIZE, offset: 0 }),
  api.request('getList', { limit: PAGE_SIZE, offset: PAGE_SIZE }),
])
```

Now `offset: 0` **and** `offset: 12` are instant on the client.

## Gotchas

- **No loading flash needs a sync store on the client.** `useApiQuery`'s instant first render uses
  [`getCachedSync()`](./api-client.md#synchronous-cache-read-endpointgetcachedsync), which only works on
  `MemoryStorage`/`LocalStorage`. With `IndexedDB` the data still comes from the cache, but after one
  async tick (a brief `loading`).
- **Cache-key stability server ↔ client.** The key includes `cacheableHeaderKeys`. If a cache-affecting
  header (e.g. auth) differs between server and client, the keys diverge and hydration "misses". Exclude
  such headers for SSR endpoints via `excludeCacheableHeaderKeys`.
- **One instance per request on the server.** Never share a single client across requests — use the
  factory so each request gets its own cache.

## Next.js (App Router)

Same flow: on the server (a Server Component or route handler) create the api with `MemoryStorage`, call
`request()` to warm it, then `dehydrate()`. Pass the snapshot into a Client Component that calls
`hydrate()` **before** `init()` and renders the hooks. (`dehydrate`/`hydrate` have no React dependency, so
they're safe to call from `'server only'` code — mirrors `dehydrateModule` for synapse modules.)

## See also

- [ApiClient](./api-client.md) — `dehydrate()`/`hydrate()`, `getCachedSync()`, caching and tags.
- [useApiQuery](./api-use-query.md) — the hook used here.
- [useApiMutation](./api-use-mutation.md) — writes + cache invalidation.
