# SSR hydration (hydrate)

> [Back to Main](../../README.md)

`storage.hydrate(state)` replaces the storage state with a ready snapshot. The main scenario is
**SSR**: the server serializes state (for example, the first page of pokemon), the client
initializes the storage with it to avoid flicker and an extra data request.

- **Sync storages** (`MemoryStorage`, `LocalStorage`): `hydrate(state): void`
- **Async storages** (`IndexedDBStorage`): `hydrate(state): Promise<void>`

## Server → client flow

The same logic as a real Next.js `page.tsx`: on the server you fetch the first page and build a
serializable snapshot, on the client you seed the store with it before the first render.

```typescript
// ── SERVER (Next.js Server Component / page.tsx) ──────────────────────────
// Fetch the first page of pokemon and build a store snapshot.
async function fetchFirstPokemonOnServer(): Promise<{ pokemonList: PokemonBrief[] }> {
  const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=12&offset=0')
  const data = await res.json()
  const pokemonList = data.results.map((p) => {
    const id = Number(p.url.split('/').filter(Boolean).pop())
    return { id, name: p.name, sprite: `.../sprites/pokemon/${id}.png` }
  })
  return { pokemonList } // passed as a prop to the client component
}
```

## Hydration before initialize()

Called **before** `initialize()`, `hydrate` seeds the storage so that initialization does not
overwrite it with `initialState` — the server state wins.

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<{ pokemonList: PokemonBrief[] }>({
  name: 'pokemon-ssr',
  initialState: { pokemonList: [] },   // default for a "clean" client
})

// On the client: the snapshot arrived from the server as a prop
storage.hydrate(serverState)

await storage.initialize()   // initialState will NOT overwrite the hydrated state
```

The first client render already shows the pokemon list — no flicker and no second fetch.

## Hydration after initialize()

Called **after** `initialize()`, `hydrate` replaces the state and notifies subscribers
(selectors and React hooks update reactively).

```typescript
await storage.initialize()

// later, e.g. when navigating between pages in an SPA with server data
storage.hydrate(nextPageState)
// subscribers receive the new state
```

## With persist migrations

If a [`version`](./persist-migration.md) is set, `hydrate` pins the current schema version: the
server snapshot is considered already up to date, so no migration runs on it.

## React / createSynapse

`hydrate` is available on `synapse.storage` after the module is assembled:

```typescript
const synapse = await pokemonSynapse.ready()
synapse.storage.hydrate(serverState)
```

It is usually more convenient to work at the module level:
[`createSynapseCtx({ ssr: true })`](./synapse-ctx.md) builds the snapshot via `dehydrate` and
synchronously seeds the store on the client through the `dehydratedState` prop — solving the same
task for the whole module rather than a bare storage.

## Types

```typescript
interface ISyncStorage<T> {
  hydrate(state: T): void
  // ...
}

interface IAsyncStorage<T> {
  hydrate(state: T): Promise<void>
  // ...
}
```

## See also

- [Persist migrations](./persist-migration.md)
- [createSynapseCtx](./synapse-ctx.md) · [Pokemon (full example)](./pokemon-advanced.md)
