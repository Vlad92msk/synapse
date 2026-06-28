# useApiMutation — React hook for mutations

> [Back to Main](../../README.md)

A React hook over an `ApiClient` endpoint for **writes** (POST/PUT/DELETE/PATCH). Unlike
[useApiQuery](./api-use-query.md), the request does **not** start automatically — you trigger it with
`mutate`/`mutateAsync`. Mutations aren't cached (by REST method), and their `invalidatesTags` invalidate
the cache — active `useApiQuery` hooks of neighbouring endpoints refetch on their own via the
[invalidation bus](./api-client.md#cache-invalidation-bus-endpointoncacheinvalidate).

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

`options` is `QueryOptions` (`signal`, `headers`, `timeout`, `retry`, …).

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
