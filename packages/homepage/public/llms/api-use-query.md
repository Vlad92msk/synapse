<!-- source: docs/en/api-use-query.md · canonical: https://synapse-homepage.web.app/docs/api-use-query · part of https://synapse-homepage.web.app/llms-full.txt -->

# useApiQuery — React hook for GET requests


**TL;DR:** `useApiQuery(endpoint, params, options?)` is a React Query–style GET hook. It starts on mount,
re-runs when `params` change, and returns `{ data, isLoading, isError, error, refetch, fromCache }`.

A React Query–style hook over an `ApiClient` endpoint for **reading** data (GET). It is a thin layer on
top of `endpoint.request(params).subscribe(...)` — deduplication, the tag cache, retry and abort already
live in the endpoint (see [ApiClient](./api-client.md)). The hook adds the React part: subscription,
a stable params key, `enabled`/`refetch`, an SSR fast-path (no loading flash) and auto-refetch on cache
invalidation.

The `ApiClient` is standalone (it depends neither on RxJS/`reactive` nor on `createSynapse`), so you can
use just `synapse-storage/api` + `synapse-storage/core` + these hooks — without the whole state-manager.

## When to use / when you don't need it

- **Use it** when a component reads data (GET) and you want loading/error states, caching, auto-refetch
  after mutations, and an instant first render under SSR — all out of the box.
- **Don't** use it for writes (POST/PUT/DELETE/PATCH) — that's [useApiMutation](./api-use-mutation.md).
- **Don't** use it outside React: if the data is fetched by an effect/service, work with the native
  `endpoint.request(...)` directly (see [ApiClient](./api-client.md)).

## Import

```typescript
import { useApiQuery } from 'synapse-storage/react'
```

## Usage

The hook takes an **endpoint** (from `getEndpoints()`), so `params`/`data` types are inferred from it.

```typescript
const endpoints = pokemonApiClient.getEndpoints()

function PokemonCard({ id }: { id: number }) {
  // GET: starts on mount, re-runs when params change
  const { data, isLoading, isError, error, refetch, fromCache } = useApiQuery(endpoints.getDetails, { id })

  if (isLoading) return <Spinner />
  if (isError) return <Error message={error?.message} />

  return (
    <div>
      <h3>{data?.name}</h3>
      {fromCache && <small>from cache</small>}
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

## Return value

`useApiQuery(endpoint, params, options?)` returns:

| Field | Type | Description |
|-------|------|-------------|
| `data` | `TData \| undefined` | Response data (or cached data) |
| `error` | `Error \| undefined` | Request error |
| `status` | `'idle' \| 'loading' \| 'success' \| 'error'` | Current status |
| `isLoading` | `boolean` | `status === 'loading'` |
| `isError` | `boolean` | `status === 'error'` |
| `isSuccess` | `boolean` | `status === 'success'` |
| `fromCache` | `boolean` | Data came from cache rather than the network |
| `refetch` | `() => void` | Force a re-request |

## Options (commented)

The third argument is `UseApiQueryOptions`: two hook-specific fields plus the endpoint's entire `QueryOptions`.

```typescript
useApiQuery(endpoints.getDetails, { id }, {
  // --- hook fields ---
  enabled: id != null,       // false → the request is not performed (lazy). Wait until params are ready
  refetchOnInvalidate: true, // auto-refetch an active query when a mutation invalidates its tags

  // --- forwarded QueryOptions (same as for endpoint.request(...)) ---
  disableCache: false,       // true → bypass the app cache, always a network request
  timeout: 5000,             // timeout for this request (ms), overrides baseQuery.timeout
  signal: controller.signal, // external AbortSignal (the hook already aborts the request on unmount)
  headers: new Headers(),    // extra request headers
  context: { source: 'ui' }, // passed into baseQuery.prepareHeaders
  retry: { count: 2 },       // retry policy for this request (overrides the endpoint/global one)
})
```

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled?` | `boolean` | `true` | `false` — the request is not performed (lazy) until `params` are ready. |
| `refetchOnInvalidate?` | `boolean` | `true` | Auto-refetch when a mutation invalidates the endpoint's tags. |
| `disableCache?` | `boolean` | — | Bypass the app cache (a forced network request). |
| `timeout?` | `number` | — | Request timeout (ms), overrides `baseQuery.timeout`. |
| `signal?` | `AbortSignal` | — | External abort signal. |
| `headers?` | `Headers` | — | Extra request headers. |
| `retry?` | `RetryConfig` | — | Retries for this request (see [ApiClient](./api-client.md)). |

```typescript
// enabled: won't fire until `id` is defined
const { data } = useApiQuery(endpoints.getDetails, { id: id! }, { enabled: id != null })
```

## SSR: no loading flash after hydration

The lazy initial state reads the cache **synchronously** via
[`endpoint.getCachedSync()`](./api-client.md#synchronous-cache-read-endpointgetcachedsync). On the server
`useEffect` doesn't run, so the very first (and only) render returns the seeded/cached data; on the client
the first render after [hydration](./api-client.md#ssr-dehydrate--hydrate) shows the server data
immediately instead of flashing `loading`.

This works only for synchronous storages (`MemoryStorage`/`LocalStorage`) and endpoints without
cache-affecting headers. Otherwise the hook falls back to the regular async path.

## Auto-refetch on cache invalidation

When a mutation succeeds with `invalidatesTags`, the matching cache entries are removed and an
invalidation event is emitted. An active `useApiQuery` whose endpoint `tags` intersect the invalidated
tags **re-runs automatically** (parity with React Query — the query "comes alive" instead of waiting for
the TTL). Under the hood this uses
[`endpoint.onCacheInvalidate()`](./api-client.md#cache-invalidation-bus-endpointoncacheinvalidate). Turn
it off with `refetchOnInvalidate: false`.

```typescript
// getList endpoint: tags: ['PokemonList']
const list = useApiQuery(endpoints.getList, { limit: 12 })

// elsewhere — a mutation with invalidatesTags: ['PokemonList']
// → `list` refetches on its own
```

## Notes

- **Stable params key.** Params are serialized with sorted keys, so a fresh `{ id: 1 }` object on every
  render does **not** cause an infinite re-request.
- **StrictMode-safe.** The effect aborts the in-flight request on cleanup.
- **`params` identity doesn't matter.** You can pass an inline object literal — only the serialized key
  drives re-fetching.

## See also

- [ApiClient](./api-client.md) — the native client, endpoints, caching and SSR.
- [useApiMutation](./api-use-mutation.md) — the companion hook for writes.
