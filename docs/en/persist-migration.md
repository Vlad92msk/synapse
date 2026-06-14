# Persist migrations (version + migrate)

> [Back to Main](../../README.md)

When the shape of `initialState` changes between releases, a persistent storage
(`LocalStorage` / `IndexedDB`) still holds data in the **old schema**. The `version` and
`migrate` config options let you transform it into the current schema on initialization —
without manual version checks and without losing user data.

For `MemoryStorage` the options are ignored (there's nothing to persist). Without `version`
the behavior is unchanged — migration is disabled.

## How it works

```typescript
import { LocalStorage } from 'synapse-storage/core'

interface Settings {
  theme: 'light' | 'dark'
  locale: string
}

const storage = new LocalStorage<Settings>({
  name: 'settings',
  version: 2,                            // current schema version
  initialState: { theme: 'light', locale: 'en' },
  migrate: (oldState, oldVersion) => {
    // oldVersion < 1 — the very first schema (we stored { dark: boolean })
    if (oldVersion < 1) {
      return { theme: oldState.dark ? 'dark' : 'light', locale: 'en' }
    }
    // 1 → 2: added locale
    return { ...oldState, locale: oldState.locale ?? 'en' }
  },
})

await storage.initialize()
```

On `initialize()`:

1. Storage is empty → `initialState` is written and the current `version` is recorded.
2. There is data, the saved version **equals** the current one → data is used as is.
3. There is data, the saved version is **lower** than the current one →
   `migrate(oldState, oldVersion)` is called, its result is written, the version is updated.
4. The saved version is **higher** than the current one (an old build was opened) → data is
   left untouched (+ a dev warning).

The version is stored **alongside** the data, without polluting the state itself:

- **LocalStorage** — a separate sidecar key `${name}::__synapse_version__`.
- **IndexedDB** — a reserved `__synapse_version__` record in the same store. It is excluded
  from `getState()` / `keys()` and survives `clear()` / a full state overwrite.

## Bumping the version without migrate

If you bump `version` but don't provide `migrate`, the old-schema data stays as is, and the
version is updated. In dev mode a warning is printed — usually this is a mistake (you forgot
to write the migration).

```typescript
const storage = new LocalStorage<Settings>({
  name: 'settings',
  version: 3,                 // bumped
  initialState: { theme: 'light', locale: 'en' },
  // migrate not provided → old data stays, version becomes 3 (+ dev warn)
})
```

## migrate is called once

After a successful migration the new version is written, so on subsequent runs with the same
`version` the `migrate` function is no longer called. Migration is idempotent per version.

## SSR / hydration

If the storage is hydrated with a server snapshot via
[`hydrate(state)`](./ssr-hydration.md), the snapshot is considered to already be in the
current schema — the current `version` is recorded, and migration is not run on it.

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
