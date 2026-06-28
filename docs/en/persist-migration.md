# Persist migrations (version + migrate)

> [Back to Main](../../README.md)

When the shape of `initialState` changes between releases, a persistent storage
(`LocalStorage` / `IndexedDBStorage`) still holds **old-schema** data. The `version` and
`migrate` config options transform it to the current schema on initialization — without manual
version checks and without losing user data.

For `MemoryStorage` these options are ignored (nothing to persist). Without `version` behavior
is unchanged — migration is off.

## How it works

A real case: in v1 favorite pokemon were stored **by name**, in v2 — **by id**. `migrate`
converts the saved names to ids once, on initialization.

```typescript
import { LocalStorage } from 'synapse-storage/core'

interface PokemonPrefs {
  favorites: number[]   // v2: ids (used to be names)
}

const NAME_TO_ID: Record<string, number> = { pikachu: 25, charizard: 6, bulbasaur: 1 }

const storage = new LocalStorage<PokemonPrefs>({
  name: 'pokemon-prefs',
  version: 2,                              // current schema version
  initialState: { favorites: [] },
  migrate: (oldState, oldVersion) => {
    // v1 → v2: names → ids
    if (oldVersion < 2) {
      return { favorites: (oldState.favorites ?? []).map((n: string) => NAME_TO_ID[n]).filter(Boolean) }
    }
    return oldState
  },
})

await storage.initialize()
```

On `initialize()`:

1. Storage is empty → `initialState` is written and the current `version` is pinned.
2. Data exists, saved version **equals** current → data is used as is.
3. Data exists, saved version **below** current → `migrate(oldState, oldVersion)` is called, the
   result is written, the version is updated.
4. Saved version **above** current (an older build is open) → data is left untouched
   (+ a dev warning).

The version is stored **next to** the data, not polluting the state itself:

- **LocalStorage** — a separate sidecar key `${name}::__synapse_version__`.
- **IndexedDB** — a reserved `__synapse_version__` record in the same store. It is excluded from
  `getState()` / `keys()` and survives `clear()` / a full state overwrite.

## Bumping the version without migrate

If you bump `version` but don't provide `migrate`, the old-schema data stays as is and the
version is updated. In dev mode a warning is printed — usually this is a mistake (a forgotten
migration).

```typescript
const storage = new LocalStorage<PokemonPrefs>({
  name: 'pokemon-prefs',
  version: 3,                 // bumped
  initialState: { favorites: [] },
  // migrate not provided → old data stays, version becomes 3 (+ dev warn)
})
```

## migrate runs once

After a successful migration the new version is written, so on subsequent runs with the same
`version` the `migrate` function is no longer called. Migration is idempotent per version.

## SSR / hydration

If the storage is hydrated with a server snapshot via [`hydrate(state)`](./ssr-hydration.md), the
snapshot is considered to already match the current schema — the current `version` is pinned and
no migration runs on it.

## Types

```typescript
import type { MigrateFn } from 'synapse-storage/core'

// (persistedState, persistedVersion) => normalized state of the current schema
type MigrateFn<T> = (persistedState: any, persistedVersion: number) => T

interface BaseStorageConfig<T> {
  name: string
  initialState?: T
  version?: number
  migrate?: MigrateFn<T>
  // ...
}
```

## See also

- [LocalStorage](./local-storage.md) · [IndexedDB Storage](./indexeddb-storage.md)
- [SSR hydration](./ssr-hydration.md)
