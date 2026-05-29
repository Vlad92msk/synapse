# LocalStorage

> [Back to Main](../../README.md)

Data is stored in the browser's `localStorage`. Survives page reloads. Synchronous API (identical to MemoryStorage).

## Creating

```typescript
import { LocalStorage } from 'synapse-storage/core'

interface ThemeState {
  theme: 'light' | 'dark'
  fontSize: number
}

// Via new
const storage = new LocalStorage<ThemeState>({
  name: 'theme-settings',           // key in localStorage
  initialState: { theme: 'light', fontSize: 14 },
})

// Or via static .create()
const storage = LocalStorage.create<ThemeState>({
  name: 'theme-settings',
  initialState: { theme: 'light', fontSize: 14 },
})

// Initialization — loads data from localStorage if available
await storage.initialize()
```

## Writing Data

```typescript
// set() — set a value by key
storage.set('theme', 'dark')
storage.set('fontSize', 16)

// update() — change multiple fields at once
storage.update((s) => {
  s.theme = 'dark'
  s.fontSize = 18
})
```

## Reading Data

```typescript
// All methods are identical to MemoryStorage:
const theme = storage.get<string>('theme')     // 'dark'
const state = storage.getState()               // { theme: 'dark', fontSize: 16 }
const state = storage.getStateSync()           // same
```

## Check, Delete, Reset

```typescript
// All methods are identical to MemoryStorage:
storage.has('theme')     // true
storage.keys()           // ['theme', 'fontSize']
storage.remove('theme')  // delete a key
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

The API is fully identical to MemoryStorage. The only difference is that data is persisted in the browser's localStorage:

- On `initialize()`, data is loaded from localStorage
- On `set/update/clear/reset`, data is automatically synchronized
- The localStorage key equals the `name` field in the config
