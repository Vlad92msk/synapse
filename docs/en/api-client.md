# ApiClient — HTTP Client with Caching

> [Back to Main](../../README.md)

A typed HTTP client. Endpoints, tag-based caching, request-state subscriptions, abort.

## Imports

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { ApiClient } from 'synapse-storage/api'
```

## Creating an ApiClient

```typescript
// 1. A storage for the request cache
const apiCacheStorage = new MemoryStorage<Record<string, any>>({
  name: 'api-cache',
  initialState: {},
})

// 2. Creating the client
const pokemonApi = new ApiClient({
  storage: apiCacheStorage,         // the cache storage (required)

  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,                 // request timeout (ms)
    prepareHeaders: async (headers, context) => {
      headers.set('Accept', 'application/json')
      // headers.set('Authorization', `Bearer ${token}`)
      // context.requestParams — the current request's parameters
      // context.getFromStorage('key') — read from the storage
      // context.getCookie('name') — read a cookie
      return headers
    },
    // fetchFn: customFetch,        // a custom fetch function
    // credentials: 'include',      // CORS credentials
  },

  cache: {
    ttl: 60000,                     // cache time-to-live (ms)
    cleanup: {
      enabled: true,
      interval: 120000,             // auto-cleanup interval (ms)
    },
    invalidateOnError: true,        // invalidate the cache on error
  },

  endpoints: async (create) => ({
    // GET — a list with query parameters
    getPokemonList: create<
      { limit?: number; offset?: number },  // the parameters type
      PokemonListResponse                   // the response type
    >({
      request: (params) => ({
        path: '/pokemon',
        method: 'GET',
        query: params,              // -> ?limit=5&offset=0
      }),
      cache: { ttl: 120000 },      // a custom TTL for this endpoint
      tags: ['pokemon-list'],       // tags for invalidation
    }),

    // GET — a single resource by ID (a parameter in the path)
    getPokemonById: create<{ id: number }, Pokemon>({
      request: ({ id }) => ({
        path: `/pokemon/${id}`,     // -> /pokemon/25
        method: 'GET',
      }),
      cache: true,                  // uses the global TTL
      tags: ['pokemon'],
    }),
  }),
})

// 3. Initialization (required before use)
await apiCacheStorage.initialize()
await pokemonApi.init()
```

## request() — Performing a request

```typescript
// pokemonApi.request(endpointName, params, options?)
// Returns Promise<QueryResult<T>>

const result = await pokemonApi.request('getPokemonList', { limit: 5 })

// QueryResult<T>:
// {
//   ok: boolean           — whether the request succeeded
//   data?: T              — the response data (typed)
//   error?: Error         — the error (if ok = false)
//   status: number        — the HTTP status (200, 404, ...)
//   statusText: string    — the HTTP status text
//   headers: Headers      — the response headers
//   fromCache?: boolean   — a result from the cache?
// }

if (result.ok) {
  console.log(result.data)        // PokemonListResponse (typed)
  console.log(result.fromCache)   // false (the first request)
}

// A repeated request with the same parameters — from the cache
const cached = await pokemonApi.request('getPokemonList', { limit: 5 })
console.log(cached.fromCache)     // true
```

## QueryOptions — Request options

```typescript
// The third argument of request() — options
await pokemonApi.request('getPokemonById', { id: 25 }, {
  disableCache: true,             // bypass the cache
  timeout: 5000,                  // a timeout for this request
  signal: abortController.signal, // an abort signal
  headers: new Headers({          // additional headers
    'X-Custom': 'value',
  }),
  context: { source: 'user' },   // passed to prepareHeaders
})

// prepareHeaders receives the context:
prepareHeaders: async (headers, context) => {
  if (context.context?.source === 'admin') {
    headers.set('X-Admin', 'true')
  }
  return headers
}
```

## RequestDefinition — An endpoint's request description

```typescript
// The full structure of the object returned from request()
request: (params) => ({
  path: '/pokemon',               // the path (appended to baseUrl)
  method: 'GET',                  // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body: params,                   // the request body (POST/PUT/PATCH)
  query: { limit: 5 },           // query parameters (?limit=5)
  headers: { 'X-Custom': '1' },  // headers for this request
  responseFormat: 'json',         // 'json' | 'blob' | 'arrayBuffer' | 'text' | 'formData' | 'raw'
})

// POST with a body + cache invalidation
createPokemon: create<{ name: string; type: string }, Pokemon>({
  request: (params) => ({
    path: '/pokemon',
    method: 'POST',
    body: params,                 // serialized to JSON
  }),
  invalidatesTags: ['pokemon-list'],  // resets the cache on success
  cache: false,                       // don't cache mutations
})
```

## Caching and tags

```typescript
// Global cache (for all endpoints)
cache: {
  ttl: 60000,                            // 60 seconds
  cleanup: { enabled: true, interval: 120000 },
  invalidateOnError: true,
}

// Cache for a specific endpoint (overrides the global one)
getPokemonById: create<...>({
  cache: { ttl: 300000 },               // 5 minutes for this endpoint
})

// Disable the cache for an endpoint
createPokemon: create<...>({
  cache: false,
})

// Disable the cache for a specific request
await pokemonApi.request('getPokemonById', { id: 1 }, {
  disableCache: true,                    // a forced network request
})

// --- Tags ---
// An endpoint is marked with a tag:
getPokemonList: create<...>({
  tags: ['pokemon-list'],
})

// A mutation invalidates tags on success:
createPokemon: create<...>({
  invalidatesTags: ['pokemon-list'],     // resets the cache of all endpoints
                                         // with the 'pokemon-list' tag
})
```

## getEndpoints() — Direct access to endpoints

```typescript
const endpoints = pokemonApi.getEndpoints()

// The endpoint object:
// {
//   fetchCounts: number              — the number of executed requests
//   request(params, options?)        — perform a request (returns RequestResponseModify)
//   subscribe(callback)              — subscribe to the endpoint's state
//   reset()                          — reset the counter
//   meta: { name, tags, invalidatesTags, cache }
//   destroy()                        — cleanup
// }

// request() through the endpoint returns RequestResponseModify:
const req = endpoints.getPokemonById.request({ id: 25 })

// RequestResponseModify:
// {
//   id: string                       — the request's unique ID
//   subscribe(listener)              — subscribe to the request's state
//   wait()                           — Promise<QueryResult>
//   waitWithCallbacks({ idle, loading, success, error })
//   abort()                          — abort the request
//   then/catch/finally               — Promise API (can be awaited)
// }

// Subscribing to the request's state
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

// Waiting for the result
const result = await req.wait()
console.log(result.data)          // Pokemon
```

## waitWithCallbacks() — Callbacks by status

```typescript
const endpoints = pokemonApi.getEndpoints()
const req = endpoints.getPokemonById.request({ id: 25 })

const result = await req.waitWithCallbacks({
  idle: (state) => console.log('Waiting'),
  loading: (state) => console.log('Loading...'),
  success: (data, state) => console.log('Data:', data),
  error: (error, state) => console.log('Error:', error),
})

// result — the same QueryResult<T>
```

## abort() — Aborting a request

```typescript
// Option 1: through the endpoint
const endpoints = pokemonApi.getEndpoints()
const req = endpoints.getPokemonById.request({ id: 25 })
req.abort()  // aborts the request via AbortController

// Option 2: through an AbortController in the options
const controller = new AbortController()
const result = pokemonApi.request('getPokemonById', { id: 25 }, {
  signal: controller.signal,
})
controller.abort()  // aborts the request
```

## subscribe() — Subscribing to an endpoint's state

```typescript
const endpoints = pokemonApi.getEndpoints()

// Subscribing to the endpoint's overall state (not a specific request)
const unsub = endpoints.getPokemonById.subscribe((state) => {
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
// Initialization (required)
await apiCacheStorage.initialize()  // the storage first
await pokemonApi.init()             // then the client

// Destruction (clears the cache, subscriptions, endpoints)
await pokemonApi.destroy()
```
