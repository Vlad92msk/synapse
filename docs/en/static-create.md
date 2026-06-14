# Static .create()

> [Back to Main](../../README.md)

Every storage class has a static `.create()` method — an alternative to `new`.

## Usage

```typescript
import { MemoryStorage, LocalStorage, IndexedDBStorage } from 'synapse-storage/core'

interface AppState {
  value: number
}

// MemoryStorage.create() — equivalent to new MemoryStorage()
const memStorage = MemoryStorage.create<AppState>({
  name: 'static-memory',
  initialState: { value: 100 },
})

// LocalStorage.create() — equivalent to new LocalStorage()
const localStore = LocalStorage.create<AppState>({
  name: 'static-local',
  initialState: { value: 200 },
})

// IndexedDBStorage.create() — equivalent to new IndexedDBStorage()
const idbStore = IndexedDBStorage.create<AppState>({
  name: 'static-idb',
  initialState: { value: 300 },
  options: {},                    // required for IndexedDB
})

// Initialization
await Promise.all([
  memStorage.initialize(),
  localStore.initialize(),
  idbStore.initialize(),
])
```
