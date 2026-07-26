# browserStorage (server-safe)

> [Back to contents](./README.md)

`browserStorage(config, { client })` (exported from `synapse-storage/core`) is a **server-safe storage
factory** for the synchronous C-form of [`createSynapse`](./create-synapse-basic.md). It returns a
factory `() => ISyncStorage<T>` that you pass to the `storage` field as-is:

- **on the server** (`typeof window === 'undefined'`) → builds a `MemoryStorage` from `initialState`
  (the client factory is **not** called);
- **in the browser** → calls `client(config)` and builds a client-specific storage (`LocalStorage`,
  etc.).

## Why

C-form construction is synchronous and **runs on the server too** (the SSR shell is inferred from the
sync core). But browser-only storages don't survive that: `LocalStorage` needs `localStorage`, which
doesn't exist on the server. Previously every module had to write the branch by hand:

```typescript
// before: a manual guard in every module
storage: () => (typeof window === 'undefined'
  ? new MemoryStorage<DraftState>({ name: 'draft', initialState })
  : new LocalStorage<DraftState>({ name: 'draft', initialState })),
```

`browserStorage` removes this ritual: both branches are a sync store of the same shape, and `TState`
is inferred from `initialState` without manual generics.

## Usage

```typescript
import { browserStorage, LocalStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

export const draftSynapse = createSynapse({
  // browserStorage(...) ITSELF returns a factory () => ISyncStorage — pass it as-is
  storage: browserStorage(
    { name: 'draft', initialState },
    { client: (cfg) => new LocalStorage(cfg) },
  ),
  dispatcher: (s) => new DraftDispatcher(s),
})
```

On the server `draftSynapse` comes up empty from `initialState` (MemoryStorage); in the browser it
comes up from `localStorage` (LocalStorage). The SSR shell is inferred automatically and
`renderToString` doesn't crash.

## Client-only middleware

Add client specifics (e.g. cross-tab sync via `syncBroadcastMiddleware`) **inside `client`** — it
won't be wired up on the server:

```typescript
import { browserStorage, LocalStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

storage: browserStorage(
  { name: 'draft', initialState },
  {
    client: (cfg) => new LocalStorage({
      ...cfg,
      middlewares: () => [syncBroadcastMiddleware({ storageType: 'localStorage', storageName: 'draft' })],
    }),
  },
),
```

## Options

| Field | Type | Description |
|---|---|---|
| `client` | `(config) => ISyncStorage<T>` | The client-side sync storage factory. Called **only** in the browser. |
| `isServer?` | `() => boolean` | Override for the "server" check. Defaults to `typeof window === 'undefined'`. |

## See also

- [createSynapse (basic)](./create-synapse-basic.md) — the C-form the factory is passed to.
- [SSR hydration](./ssr-hydration.md) — why construction runs on the server.
- [LocalStorage](./local-storage.md) · [MemoryStorage](./memory-storage.md) — both `browserStorage` branches.
