# ApiClient — HTTP Client with Caching

> [Back to Main](../../README.md)

A typed HTTP client: endpoints, tag-based caching, request-state subscriptions, abort.

This page is built around the **real `pokemon.api.ts` file** from the
[`pokemon-advanced`](./pokemon-advanced.md) example. The same `pokemonApiClient` is later used in the
effects (see [Effects](./create-synapse-effects.md)) — it's the first brick of the data layer.

## Imports

```typescript
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'
```

## Creating the ApiClient (`pokemon.api.ts`)

`pokemon.api.ts` is a **single responsibility of the module**: configuring the client, describing the
endpoints, and mapping the raw response into domain types. Nothing extra.

```typescript
// ─── Raw API response types ─────────────────────────────────────────────────
// They describe the shape PokeAPI returns — which we hide behind mappers.

interface PokemonListApiResponse {
  count: number
  next: string | null
  results: Array<{ name: string; url: string }>
}

interface PokemonApiResponse {
  id: number
  name: string
  types: Array<{ type: { name: string } }>
  stats: Array<{ stat: { name: string }; base_stat: number }>
  abilities: Array<{ ability: { name: string } }>
  sprites: { front_default: string }
  height: number
  weight: number
}

// ─── ApiClient ──────────────────────────────────────────────────────────────

export const pokemonApiClient = new ApiClient({
  // The request-cache storage (required).
  storage: new MemoryStorage<Record<string, any>>({
    name: 'pokemon-advanced-api-cache',
    initialState: {},
  }),

  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,                       // request timeout (ms)
  },

  cache: {
    ttl: 60000,                           // global cache time-to-live (ms)
    invalidateOnError: true,              // invalidate cache on error
  },

  endpoints: async (create) => ({
    // GET — a list with query params
    getList: create<{ limit: number; offset: number }, PokemonListApiResponse>({
      request: (params) => ({
        path: '/pokemon',
        method: 'GET',
        query: params,                    // -> ?limit=12&offset=0
      }),
      cache: { ttl: 120000 },             // its own TTL for this endpoint
      tags: ['pokemon-list'],             // tags for invalidation
    }),

    // GET — a single resource by ID (param in the path)
    getDetails: create<{ id: number }, PokemonApiResponse>({
      request: ({ id }) => ({
        path: `/pokemon/${id}`,           // -> /pokemon/25
        method: 'GET',
      }),
      cache: true,                        // uses the global TTL
      tags: ['pokemon-details'],
    }),
  }),
})

// Client initialization (see "Lifecycle" below).
export const initPokemonApi = () => pokemonApiClient.init()

// The endpoints-set type — passed into the effects as a service.
export type PokemonApiEndpoints = ReturnType<typeof pokemonApiClient.getEndpoints>
```

## Response mappers

Endpoints return the **raw** API response. Mappers turn it into domain types (`PokemonBrief` /
`PokemonDetails` from [`pokemon.types.ts`](./pokemon-advanced.md)) so the rest of the data layer works
only with a clean domain shape.

```typescript
import type { PokemonBrief, PokemonDetails } from './pokemon.types'

export function mapListResponse(data: PokemonListApiResponse): { list: PokemonBrief[]; hasMore: boolean } {
  const list: PokemonBrief[] = data.results.map((p) => {
    // PokeAPI doesn't return an id in the list — we pull it from the url.
    const id = parseInt(p.url.split('/').filter(Boolean).pop()!)
    return {
      id,
      name: p.name,
      sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
    }
  })
  return { list, hasMore: !!data.next }
}

export function mapDetailsResponse(data: PokemonApiResponse): PokemonDetails {
  return {
    id: data.id,
    name: data.name,
    types: data.types.map((t) => t.type.name),
    stats: data.stats.map((s) => ({ name: s.stat.name, value: s.base_stat })),
    abilities: data.abilities.map((a) => a.ability.name),
    sprite: data.sprites.front_default,
    height: data.height,
    weight: data.weight,
  }
}
```

> **Why the mappers live here, not in the effects:** the API response shape is a transport detail.
> Keeping mappers next to the endpoints localizes the knowledge of PokeAPI in one file; effects and
> selectors only ever see the domain types.

## request() — performing a request

```typescript
// pokemonApiClient.request(endpointName, params, options?)
// Returns Promise<QueryResult<T>>

const result = await pokemonApiClient.request('getList', { limit: 12, offset: 0 })

// QueryResult<T>:
// {
//   ok: boolean           — whether the request succeeded
//   data?: T              — the response data (typed)
//   error?: Error         — the error (if ok = false)
//   status: number        — HTTP status (200, 404, ...)
//   statusText: string    — HTTP status text
//   headers: Headers      — response headers
//   fromCache?: boolean   — was the result from cache?
// }

if (result.ok) {
  console.log(result.data)        // PokemonListApiResponse (typed)
  console.log(result.fromCache)   // false (first request)
}

// A repeat request with the same params — from cache
const cached = await pokemonApiClient.request('getList', { limit: 12, offset: 0 })
console.log(cached.fromCache)     // true
```

## QueryOptions — request options

```typescript
// The third argument of request() — options
await pokemonApiClient.request('getDetails', { id: 25 }, {
  disableCache: true,             // bypass the cache
  timeout: 5000,                  // timeout for this request
  signal: abortController.signal, // abort signal
  headers: new Headers({          // extra headers
    'X-Custom': 'value',
  }),
  context: { source: 'user' },   // passed into prepareHeaders
})

// prepareHeaders receives the context:
baseQuery: {
  baseUrl: 'https://pokeapi.co/api/v2',
  prepareHeaders: async (headers, context) => {
    headers.set('Accept', 'application/json')
    if (context.context?.source === 'admin') headers.set('X-Admin', 'true')
    // context.requestParams        — the current request's params
    // context.getFromStorage('key') — read from storage
    // context.getCookie('name')     — read a cookie
    return headers
  },
}
```

## RequestDefinition — describing an endpoint's request

```typescript
// The full structure of the object returned from request()
request: (params) => ({
  path: '/pokemon',               // path (appended to baseUrl)
  method: 'GET',                  // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body: params,                   // request body (POST/PUT/PATCH)
  query: { limit: 12 },          // query params (?limit=12)
  headers: { 'X-Custom': '1' },  // headers for this request
  responseFormat: 'json',         // 'json' | 'blob' | 'arrayBuffer' | 'text' | 'formData' | 'raw'
})

// A mutation example (POST with body + cache invalidation):
createPokemon: create<{ name: string; type: string }, PokemonApiResponse>({
  request: (params) => ({
    path: '/pokemon',
    method: 'POST',
    body: params,                 // serialized to JSON
  }),
  invalidatesTags: ['pokemon-list'],  // on success, drops the list cache
  cache: false,                       // don't cache mutations
})
```

## Caching and tags

```typescript
// Global cache (for all endpoints)
cache: {
  ttl: 60000,                            // 60 seconds
  invalidateOnError: true,
}

// Cache for a specific endpoint (overrides the global one)
getList: create<...>({
  cache: { ttl: 120000 },               // 2 minutes for the list
})

// Disable cache for an endpoint
createPokemon: create<...>({
  cache: false,
})

// Disable cache for a specific request
await pokemonApiClient.request('getDetails', { id: 1 }, {
  disableCache: true,                    // forced network request
})

// --- Tags ---
// An endpoint is tagged:
getList: create<...>({
  tags: ['pokemon-list'],
})

// A mutation invalidates tags on success:
createPokemon: create<...>({
  invalidatesTags: ['pokemon-list'],     // drops the cache of all endpoints
                                         // tagged 'pokemon-list'
})
```

## getEndpoints() — direct access to the endpoints

This is the form the data layer hands to the effects: `pokemonApiClient.getEndpoints()` returns an
object with typed endpoints (`getList`, `getDetails`), and the `PokemonApiEndpoints` type is passed
into `PokemonEffects` through the constructor.

```typescript
const endpoints = pokemonApiClient.getEndpoints()

// The endpoint object:
// {
//   fetchCounts: number              — number of performed requests
//   request(params, options?)        — perform a request (returns RequestResponseModify)
//   subscribe(callback)              — subscribe to the endpoint state
//   reset()                          — reset the counter
//   meta: { name, tags, invalidatesTags, cache }
//   destroy()                        — cleanup
// }

// request() through an endpoint returns RequestResponseModify:
const req = endpoints.getDetails.request({ id: 25 })

// RequestResponseModify:
// {
//   id: string                       — the unique request ID
//   subscribe(listener)              — subscribe to the request state
//   wait()                           — Promise<QueryResult>
//   waitWithCallbacks({ idle, loading, success, error })
//   abort()                          — abort the request
//   then/catch/finally               — Promise API (awaitable)
// }

// Subscribe to the request state
req.subscribe((state) => {
  // RequestState<T>:
  // {
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   data?: PokemonApiResponse
  //   error?: Error
  //   fromCache: boolean
  //   requestParams: { id: number }
  // }
  console.log(state.status)       // 'loading' -> 'success'
  console.log(state.data)         // PokemonApiResponse | undefined
})

// Wait for the result
const result = await req.wait()
console.log(result.data)          // PokemonApiResponse
```

> In the effects this same endpoint is wrapped in `fromRequest(this.api.getDetails.request(...))` — an
> RxJS wrapper over `RequestResponseModify`. More in [Effects](./create-synapse-effects.md).

## waitWithCallbacks() — callbacks per status

```typescript
const endpoints = pokemonApiClient.getEndpoints()
const req = endpoints.getDetails.request({ id: 25 })

const result = await req.waitWithCallbacks({
  idle: (state) => console.log('Idle'),
  loading: (state) => console.log('Loading...'),
  success: (data, state) => console.log('Data:', data),
  error: (error, state) => console.log('Error:', error),
})

// result — the same QueryResult<T>
```

## abort() — aborting a request

```typescript
// Way 1: through the endpoint
const endpoints = pokemonApiClient.getEndpoints()
const req = endpoints.getDetails.request({ id: 25 })
req.abort()  // aborts the request via AbortController

// Way 2: through an AbortController in the options
const controller = new AbortController()
const result = pokemonApiClient.request('getDetails', { id: 25 }, {
  signal: controller.signal,
})
controller.abort()  // aborts the request
```

## subscribe() — subscribing to the endpoint state

```typescript
const endpoints = pokemonApiClient.getEndpoints()

// Subscribe to the overall endpoint state (not a specific request)
const unsub = endpoints.getDetails.subscribe((state) => {
  // EndpointState:
  // {
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   error?: Error
  //   fetchCounts: number
  //   meta: { name, tags, invalidatesTags, cache }
  //   cacheableHeaders: string[]
  // }
  console.log('Endpoint status:', state.status, 'requests:', state.fetchCounts)
})

// Unsubscribe
unsub()
```

## Lifecycle

```typescript
// Initialization (required before use).
// In the module it's hidden inside initPokemonApi() and called from the createSynapse async factory:
await initPokemonApi()              // = pokemonApiClient.init()

// Destruction (clears the cache, subscriptions, endpoints)
await pokemonApiClient.destroy()
```

> **Where this comes together:** `pokemonApiClient` is created in `pokemon.api.ts`, initialized in the
> factory's async prologue (`pokemon.synapse.ts`), and its endpoints are passed into `PokemonEffects`.
> The full assembly is on the [Pokemon example](./pokemon-advanced.md) page.
