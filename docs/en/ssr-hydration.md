# SSR hydration (hydrate)

> [Back to Main](../../README.md)

`storage.hydrate(state)` replaces the storage state with a ready-made snapshot. The main
scenario is **SSR**: the server serializes the state, the client initializes the storage
with it to avoid flicker and an extra data request.

- **Sync storages** (`MemoryStorage`, `LocalStorage`): `hydrate(state): void`
- **Async storages** (`IndexedDB`): `hydrate(state): Promise<void>`

## Hydration before initialize()

Called **before** `initialize()`, `hydrate` seeds the storage so that initialization does not
overwrite it with its `initialState` — the server state wins.

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<AppState>({
  name: 'app',
  initialState: { user: null, items: [] },   // default for a "clean" client
})

// On the client: data came from the server (window.__INITIAL_STATE__)
storage.hydrate(window.__INITIAL_STATE__)

await storage.initialize()   // initialState will NOT overwrite the hydrated state
```

## Hydration after initialize()

Called **after** `initialize()`, `hydrate` replaces the state and notifies subscribers
(selectors, React hooks update reactively).

```typescript
await storage.initialize()

// later, e.g. when navigating between pages in an SPA with server data
storage.hydrate(nextPageState)
// subscribers receive the new state
```

## With persist migrations

If [`version`](./persist-migration.md) is set, `hydrate` records the current schema version:
the server snapshot is considered already current, and migration is not run on it.

## React / createSynapse

`hydrate` is available on `synapse.storage` after the module is assembled:

```typescript
const synapse = await appSynapse.ready()
synapse.storage.hydrate(serverState)
```

For Next.js it is convenient to hydrate in the provider on the first render — before
components subscribe to selectors.

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
- [createSynapseCtx](./synapse-ctx.md)
