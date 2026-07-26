<!-- source: docs/en/api-use-mutation.md · canonical: https://synapse-homepage.web.app/docs/api-use-mutation · part of https://synapse-homepage.web.app/llms-full.txt -->

# useApiMutation — React hook for mutations


**TL;DR:** `useApiMutation(endpoint, options?)` — a write hook (POST/PUT/DELETE/PATCH). It doesn't start
on its own; you run it via `mutate` (fire-and-forget) or `mutateAsync` (await + rethrows the error). On
success the endpoint's `invalidatesTags` auto-refetch the related `useApiQuery`.

A React hook over an `ApiClient` endpoint for **writes** (POST/PUT/DELETE/PATCH). Unlike
[useApiQuery](./api-use-query.md), the request does **not** start automatically — you trigger it with
`mutate`/`mutateAsync`. Mutations aren't cached (by REST method), and their `invalidatesTags` invalidate
the cache — active `useApiQuery` hooks of neighbouring endpoints refetch on their own via the
[invalidation bus](./api-client.md#cache-invalidation-bus-endpointoncacheinvalidate).

## When to use it / when you don't need it

- **Use it** for any write from a React component, when you want `isLoading`/`isError` states for a
  button and automatic invalidation of related queries after success.
- **Not needed** for reads (GET) — that's [useApiQuery](./api-use-query.md).
- **Not needed** outside React or in effects — call `endpoint.request(...)` directly
  (see [ApiClient](./api-client.md)).

## Import

```typescript
import { useApiMutation } from 'synapse-storage/react'
```

## Usage

```typescript
const endpoints = pokemonApiClient.getEndpoints()

function CreatePokemon() {
  const { mutate, isLoading, isError, error } = useApiMutation(endpoints.createPokemon)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutate({ name: 'Pikachu' }) // fire-and-forget
      }}
    >
      <button disabled={isLoading}>Create</button>
      {isError && <Error message={error?.message} />}
    </form>
  )
}
```

## Return value

`useApiMutation(endpoint, options?)` returns:

| Field | Type | Description |
|-------|------|-------------|
| `mutate` | `(params) => void` | Run the mutation; errors are **not** thrown (read `error`/`isError`) |
| `mutateAsync` | `(params) => Promise<QueryResult>` | Run and await; **rejects** on error |
| `data` | `TData \| undefined` | Data of a successful response |
| `error` | `Error \| undefined` | Mutation error |
| `status` | `'idle' \| 'loading' \| 'success' \| 'error'` | Current status |
| `isLoading` | `boolean` | `status === 'loading'` |
| `isError` | `boolean` | `status === 'error'` |
| `isSuccess` | `boolean` | `status === 'success'` |
| `reset` | `() => void` | Reset state back to `idle` |

`options` is the endpoint's `QueryOptions` (a mutation has no `enabled`/`refetchOnInvalidate`, since it's triggered manually):

```typescript
useApiMutation(endpoints.createPokemon, {
  timeout: 8000,             // mutation timeout (ms)
  signal: controller.signal, // external cancellation (the hook already cancels on unmount)
  headers: new Headers(),    // extra headers
  context: { source: 'ui' }, // passed into baseQuery.prepareHeaders
  retry: { count: 1 },       // retries for this mutation
  // disableCache is irrelevant here: mutations are never cached anyway
})
```

## mutate vs mutateAsync

- **`mutate(params)`** — fire-and-forget. The rejection is swallowed (state already reflects the error),
  so you don't need a `.catch`. Best for simple form submits.
- **`mutateAsync(params)`** — returns the promise and **rethrows** on error, so you can `await` and branch
  in flow:

  ```typescript
  const { mutateAsync } = useApiMutation(endpoints.createPokemon)

  async function onSubmit(values) {
    try {
      const res = await mutateAsync(values)
      navigate(`/pokemon/${res.data!.id}`)
    } catch (err) {
      toast.error(String(err))
    }
  }
  ```

## Invalidating related queries

Give the mutation endpoint `invalidatesTags`; any `useApiQuery` whose endpoint `tags` intersect will
refetch automatically. No manual cache wiring required.

```typescript
// endpoint config
createPokemon: create({
  request: (body) => ({ path: '/pokemon', method: 'POST', body }),
  invalidatesTags: ['PokemonList'],
})

// getList endpoint has tags: ['PokemonList']
// → after a successful createPokemon, an active useApiQuery(getList) refetches
```

## Notes

- **StrictMode-safe.** On unmount the in-flight request is aborted and state updates are skipped.
- Mutations are never written to the cache (only GET is cached), so there's no `fromCache` here.

## See also

- [useApiQuery](./api-use-query.md) — the companion hook for reads.
- [ApiClient](./api-client.md) — caching, tags and the invalidation bus.
