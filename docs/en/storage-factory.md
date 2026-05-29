# StorageFactory

> [Back to Main](../../README.md)

Factory for creating storages. An alternative to direct `new MemoryStorage()`.

## Typed Methods

```typescript
import { StorageFactory } from 'synapse-storage/core'

interface UserState {
  name: string
  age: number
}

// createMemory -> MemoryStorage<T> (sync)
const memStorage = StorageFactory.createMemory<UserState>({
  name: 'factory-memory',
  initialState: { name: 'Alice', age: 25 },
})

// createLocal -> LocalStorage<T> (sync)
const localStore = StorageFactory.createLocal<UserState>({
  name: 'factory-local',
  initialState: { name: 'Bob', age: 30 },
})

// createIndexedDB -> IndexedDBStorage<T> (async)
const idbStore = StorageFactory.createIndexedDB<UserState>({
  name: 'factory-idb',
  initialState: { name: 'Charlie', age: 35 },
  options: {},
})

// Initialize each
await memStorage.initialize()
await localStore.initialize()
await idbStore.initialize()
```

## Universal create()

Choose the type via the `type` field. Return type depends on the chosen type:

```typescript
const sync = StorageFactory.create<UserState>({
  type: 'memory',                 // -> ISyncStorage<UserState>
  name: 'universal-mem',
  initialState: { name: 'A', age: 1 },
})

const sync = StorageFactory.create<UserState>({
  type: 'localStorage',           // -> ISyncStorage<UserState>
  name: 'universal-local',
  initialState: { name: 'B', age: 2 },
})

const async = StorageFactory.create<UserState>({
  type: 'indexedDB',              // -> IAsyncStorage<UserState>
  name: 'universal-idb',
  initialState: { name: 'C', age: 3 },
  options: {},
})
```
