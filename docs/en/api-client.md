# ApiClient — HTTP Client with Caching

> [Back to Main](../../README.md)

Typed HTTP client. Endpoints, tag-based caching, request state subscriptions, abort.

## Imports

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { ApiClient } from 'synapse-storage/api'
```

## Creating ApiClient

```typescript
// 1. Storage for request cache
const apiCacheStorage = new MemoryStorage<Record<string, any>>({
  name: 'api-cache',
  initialState: {},
})

// 2. Create the client
const pokemonApi = new ApiClient({
  storage: apiCacheStorage,         // cache storage (required)

  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,                 // request timeout (ms)
    prepareHeaders: async (headers, context) => {
      headers.set('Accept', 'application/json')
      // headers.set('Authorization', `Bearer ${token}`)
      // context.requestParams — current request params
      // context.getFromStorage('key') — read from storage
      // context.getCookie('name') — read cookie
      return headers
    },
    // fetchFn: customFetch,        // custom fetch function
    // credentials: 'include',      // CORS credentials
  },

  cache: {
    ttl: 60000,                     // cache TTL (ms)
    cleanup: {
      enabled: true,
      interval: 120000,             // auto-cleanup interval (ms)
    },
    invalidateOnError: true,        // invalidate cache on error
  },

  endpoints: async (create) => ({
    // GET — list with query params
    getPokemonList: create<
      { limit?: number; offset?: number },  // params type
      PokemonListResponse                   // response type
    >({
      request: (params) => ({
        path: '/pokemon',
        method: 'GET',
        query: params,              // -> ?limit=5&offset=0
      }),
      cache: { ttl: 120000 },      // custom TTL for this endpoint
      tags: ['pokemon-list'],       // tags for invalidation
    }),

    // GET — single resource by ID (param in path)
    getPokemonById: create<{ id: number }, Pokemon>({
      request: ({ id }) => ({
        path: `/pokemon/${id}`,     // -> /pokemon/25
        method: 'GET',
      }),
      cache: true,                  // uses global TTL
      tags: ['pokemon'],
    }),
  }),
})

// 3. Initialization (required before use)
await apiCacheStorage.initialize()
await pokemonApi.init()
```

## request() — Executing a Request

```typescript
// pokemonApi.request(endpointName, params, options?)
// Returns Promise<QueryResult<T>>

const result = await pokemonApi.request('getPokemonList', { limit: 5 })

// QueryResult<T>:
// {
//   ok: boolean           — was the request successful
//   data?: T              — response data (typed)
//   error?: Error         — error (if ok = false)
//   status: number        — HTTP status (200, 404, ...)
//   statusText: string    — HTTP status text
//   headers: Headers      — response headers
//   fromCache?: boolean   — result from cache?
// }

if (result.ok) {
  console.log(result.data)        // PokemonListResponse (typed)
  console.log(result.fromCache)   // false (first request)
}

// Repeat request with same params — from cache
const cached = await pokemonApi.request('getPokemonList', { limit: 5 })
console.log(cached.fromCache)     // true
```

## QueryOptions — Request Options

```typescript
// Third argument of request() — options
await pokemonApi.request('getPokemonById', { id: 25 }, {
  disableCache: true,             // bypass cache
  timeout: 5000,                  // timeout for this request
  signal: abortController.signal, // abort signal
  headers: new Headers({          // additional headers
    'X-Custom': 'value',
  }),
  context: { source: 'user' },   // passed to prepareHeaders
})

// prepareHeaders receives context:
prepareHeaders: async (headers, context) => {
  if (context.context?.source === 'admin') {
    headers.set('X-Admin', 'true')
  }
  return headers
}
```

## RequestDefinition — Endpoint Request Description

```typescript
// Full structure of the object returned from request()
request: (params) => ({
  path: '/pokemon',               // path (appended to baseUrl)
  method: 'GET',                  // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body: params,                   // request body (POST/PUT/PATCH)
  query: { limit: 5 },           // query params (?limit=5)
  headers: { 'X-Custom': '1' },  // headers for this request
  responseFormat: 'json',         // 'json' | 'blob' | 'arrayBuffer' | 'text' | 'formData' | 'raw'
})

// POST with body + cache invalidation
createPokemon: create<{ name: string; type: string }, Pokemon>({
  request: (params) => ({
    path: '/pokemon',
    method: 'POST',
    body: params,                 // serialized to JSON
  }),
  invalidatesTags: ['pokemon-list'],  // on success, resets cache
  cache: false,                       // don't cache mutations
})
```

## Caching and Tags

```typescript
// Global cache (for all endpoints)
cache: {
  ttl: 60000,                            // 60 seconds
  cleanup: { enabled: true, interval: 120000 },
  invalidateOnError: true,
}

// Per-endpoint cache (overrides global)
getPokemonById: create<...>({
  cache: { ttl: 300000 },               // 5 minutes for this endpoint
})

// Disable cache for endpoint
createPokemon: create<...>({
  cache: false,
})

// Disable cache for specific request
await pokemonApi.request('getPokemonById', { id: 1 }, {
  disableCache: true,                    // force network request
})

// --- Tags ---
// Endpoint is tagged:
getPokemonList: create<...>({
  tags: ['pokemon-list'],
})

// Mutation invalidates tags on success:
createPokemon: create<...>({
  invalidatesTags: ['pokemon-list'],     // resets cache of all endpoints
                                         // with tag 'pokemon-list'
})
```

## getEndpoints() — Direct Endpoint Access

```typescript
const endpoints = pokemonApi.getEndpoints()

// Endpoint object:
// {
//   fetchCounts: number              — number of executed requests
//   request(params, options?)        — execute request (returns RequestResponseModify)
//   subscribe(callback)              — subscribe to endpoint state
//   reset()                          — reset counter
//   meta: { name, tags, invalidatesTags, cache }
//   destroy()                        — cleanup
// }

// request() via endpoint returns RequestResponseModify:
const req = endpoints.getPokemonById.request({ id: 25 })

// RequestResponseModify:
// {
//   id: string                       — unique request ID
//   subscribe(listener)              — subscribe to request state
//   wait()                           — Promise<QueryResult>
//   waitWithCallbacks({ idle, loading, success, error })
//   abort()                          — cancel request
//   then/catch/finally               — Promise API (can await)
// }

// Subscribe to request state
req.subscribe((state) => {
  // RequestState<T>:
  // {
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   data?: Pokemon
  //   error?: Error
  //   fromCache: boolean
  //   requestParams: { id: number }
  // }
  console.log(state.status)       // 'loading' -> 'success'
  console.log(state.data)         // Pokemon | undefined
})

// Wait for result
const result = await req.wait()
console.log(result.data)          // Pokemon
```

## waitWithCallbacks() — Status Callbacks

```typescript
const endpoints = pokemonApi.getEndpoints()
const req = endpoints.getPokemonById.request({ id: 25 })

const result = await req.waitWithCallbacks({
  idle: (state) => console.log('Idle'),
  loading: (state) => console.log('Loading...'),
  success: (data, state) => console.log('Data:', data),
  error: (error, state) => console.log('Error:', error),
})

// result — same QueryResult<T>
```

## abort() — Cancel Request

```typescript
// Method 1: via endpoint
const endpoints = pokemonApi.getEndpoints()
const req = endpoints.getPokemonById.request({ id: 25 })
req.abort()  // cancels request via AbortController

// Method 2: via AbortController in options
const controller = new AbortController()
const result = pokemonApi.request('getPokemonById', { id: 25 }, {
  signal: controller.signal,
})
controller.abort()  // cancels request
```

## subscribe() — Endpoint State Subscription

```typescript
const endpoints = pokemonApi.getEndpoints()

// Subscribe to overall endpoint state (not a specific request)
const unsub = endpoints.getPokemonById.subscribe((state) => {
  // EndpointState:
  // {
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   error?: Error
  //   fetchCounts: number
  //   meta: { name, tags, invalidatesTags, cache }
  //   cacheableHeaders: string[]
  // }
  console.log('Endpoint status:', state.status, 'fetches:', state.fetchCounts)
})

// Unsubscribe
unsub()
```

## Lifecycle

```typescript
// Initialization (required)
await apiCacheStorage.initialize()  // storage first
await pokemonApi.init()             // then client

// Destroy (clears cache, subscriptions, endpoints)
await pokemonApi.destroy()
```
