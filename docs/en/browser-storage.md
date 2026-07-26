# browserStorage (server-safe)

> [Back to contents](./README.md)

`browserStorage(config, { client })` (exported from `synapse-storage/core`) is a **wrapper that makes a
browser-only storage server-safe**. It returns a factory `() => ISyncStorage<T>` that you pass as-is to
the `storage` field of the synchronous C-form of [`createSynapse`](./create-synapse-basic.md):

- **on the server** (`typeof window === 'undefined'`) → builds a `MemoryStorage` from `initialState`
  (the client factory is **not** called);
- **in the browser** → calls `client(config)` and builds a real client storage (`LocalStorage`,
  etc.).

It's **not a separate storage type**, but an env switch on top of the ones you already have.

## Why

The C-form of `createSynapse` is synchronous and **runs on the server too** (the SSR shell is inferred
from the sync core, and `renderToString` builds the store from `initialState`). But browser-only
storages don't survive that: `LocalStorage` needs the global `localStorage`, which doesn't exist on the
server — construction crashes. Previously every module had to write the env branch by hand:

```typescript
// before: a manual guard in EVERY module
storage: () => (typeof window === 'undefined'
  ? new MemoryStorage<DraftState>({ name: 'draft', initialState })
  : new LocalStorage<DraftState>({ name: 'draft', initialState })),
```

`browserStorage` removes this ritual: both branches are a sync store of the same shape, `TState` is
inferred from `initialState` without manual generics, and `name`/`initialState` are written once.

## When to use

- A module wants **persistence in the browser** (`LocalStorage`, a sync storage over SharedWorker), but
  it **must render on the server** (SSR/SSG) without crashing.
- You need cross-tab sync (`syncBroadcastMiddleware`) — it's browser-only too, and goes inside `client`
  (see below).

## When you DON'T need it

- **The store is in-memory anyway** → use `MemoryStorage` directly, there's nothing to wrap.
- **No SSR** (a pure SPA, the store is built only in the browser) → you can do
  `storage: () => new LocalStorage(...)` without the wrapper; `browserStorage` here just breaks nothing,
  but doesn't buy you anything either.
- **An async storage (IndexedDB)** → it has no synchronous construction, the C-form doesn't bring it up
  synchronously; `browserStorage` is meant for sync storages.

## How it differs from the other storages

| | What it is | Server | Browser |
|---|---|---|---|
| [MemoryStorage](./memory-storage.md) | in-memory, sync | works | data lives until reload |
| [LocalStorage](./local-storage.md) | persistence via `localStorage`, sync | **crashes** (no `localStorage`) | persistent |
| [IndexedDB](./indexeddb-storage.md) | large data, **async** | no sync construction | persistent |
| **`browserStorage`** | **not a storage, an env wrapper** | → `MemoryStorage` from `initialState` | → `client(config)` (e.g. `LocalStorage`) |

The idea: `browserStorage` = "`LocalStorage` in the browser, `MemoryStorage` on the server" in one line.

## Usage

Copy-paste minimal form:

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
won't be wired up on the server, because the `client` branch isn't executed there:

```typescript
import { browserStorage, LocalStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

storage: browserStorage(
  { name: 'draft', initialState },
  {
    client: (cfg) => new LocalStorage({
      ...cfg,   // important to pass name/initialState/version further down
      middlewares: () => [syncBroadcastMiddleware({ storageType: 'localStorage', storageName: 'draft' })],
    }),
  },
),
```

## All parameters (commented)

The whole API surface at once — what you can pass and why:

```typescript
import { browserStorage, LocalStorage } from 'synapse-storage/core'

storage: browserStorage<DraftState>(
  // 1. config — a regular SyncStorageConfig: goes into BOTH branches (Memory on the server, client in the browser).
  //    name/initialState are declared here once; TState is inferred from initialState.
  {
    name: 'draft',
    initialState,
    // version / migrate and the other SyncStorageConfig fields are allowed too — see Persist migrations.
  },
  {
    // 2. client — REQUIRED. The client sync-storage factory, called ONLY in the browser.
    //    This is also where client-only middleware goes (syncBroadcastMiddleware).
    client: (cfg) => new LocalStorage(cfg),

    // 3. isServer? — override for the "server" check.
    //    Defaults to () => typeof window === 'undefined'. Rarely needed:
    //    e.g. a custom SSR environment where window is defined but localStorage must not be used.
    isServer: () => typeof window === 'undefined',
  },
)
```

## Options

| Field | Type | Description |
|---|---|---|
| `config` | `SyncStorageConfig<T>` | `name` + `initialState` (+ `version`/`migrate`). Shared across both branches. |
| `client` | `(config) => ISyncStorage<T>` | **Required.** The client-side sync storage factory. Called **only** in the browser. |
| `isServer?` | `() => boolean` | Override for the "server" check. Defaults to `typeof window === 'undefined'`. |

## See also

- [createSynapse (basic)](./create-synapse-basic.md) — the C-form the factory is passed to.
- [SSR hydration](./ssr-hydration.md) — why construction runs on the server.
- [LocalStorage](./local-storage.md) · [MemoryStorage](./memory-storage.md) — both `browserStorage` branches.
- [Persist migrations](./persist-migration.md) — `version`/`migrate` in `config`.
