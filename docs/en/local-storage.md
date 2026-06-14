# LocalStorage

> [Back to Main](../../README.md)

Data is stored in the browser's `localStorage`. It persists across page reloads. Synchronous API (identical to MemoryStorage).

## Creating

```typescript
import { LocalStorage } from 'synapse-storage/core'

interface ThemeState {
  theme: 'light' | 'dark'
  fontSize: number
}

// Via new
const storage = new LocalStorage<ThemeState>({
  name: 'theme-settings',           // the key in localStorage
  initialState: { theme: 'light', fontSize: 14 },
})

// Or via the static .create()
const storage = LocalStorage.create<ThemeState>({
  name: 'theme-settings',
  initialState: { theme: 'light', fontSize: 14 },
})

// Initialization — loads data from localStorage if present
await storage.initialize()
```

## Writing data

```typescript
// set() — set a value by key
storage.set('theme', 'dark')
storage.set('fontSize', 16)

// update() — change several fields at once
storage.update((s) => {
  s.theme = 'dark'
  s.fontSize = 18
})
```

## Reading data

```typescript
// All methods are identical to MemoryStorage:
const theme = storage.get<string>('theme')     // 'dark'
const state = storage.getState()               // { theme: 'dark', fontSize: 16 }
const state = storage.getStateSync()           // the same
```

## Checking, removing, resetting

```typescript
// All methods are identical to MemoryStorage:
storage.has('theme')     // true
storage.keys()           // ['theme', 'fontSize']
storage.remove('theme')  // remove a key
storage.clear()          // clear everything (state = {})
storage.reset()          // return to initialState
```

## Subscriptions

```typescript
// Identical to MemoryStorage:
const unsub = storage.subscribe('theme', (newValue) => {
  console.log('theme changed:', newValue)
})

const unsub = storage.subscribe(
  (state) => state.fontSize,
  (newSize) => console.log('fontSize:', newSize)
)

const unsub = storage.subscribeToAll((event) => {
  console.log('changed:', event)
})
```

## Differences from MemoryStorage

The API is fully identical to MemoryStorage. The only difference is that data is saved in the browser's localStorage:

- On `initialize()` data is loaded from localStorage
- On `set/update/clear/reset` data is automatically synchronized
- The key in localStorage equals the `name` field in the configuration

## destroy() and clearOnDestroy

By default `destroy()` does **not** wipe the data in localStorage — the state survives
storage destruction (the same as persistent IndexedDB). The behavior is controlled by the
`clearOnDestroy?: boolean` config flag (`SyncStorageConfig`): default `false` for
`localStorage` and `true` for `memory` (ephemeral). To make `destroy()` clear localStorage,
pass `{ clearOnDestroy: true }`.

## Persist migrations and SSR

Since the data is persistent, when the shape of `initialState` changes between releases you
can migrate it via `version` + `migrate` — see [Persist migrations](./persist-migration.md).
Server state can be seeded via [`hydrate(state)`](./ssr-hydration.md).
