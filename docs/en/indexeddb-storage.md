# IndexedDBStorage

> [Back to Main](../../README.md)

Data is stored in IndexedDB. It persists across page reloads. **Asynchronous API** — all methods return a Promise.

## Creating

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

interface TodoState {
  items: string[]
  filter: 'all' | 'active'
}

// Via new (options is a required field)
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: {},                     // can be an empty object
})

// With a custom dbName
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: { dbName: 'my_app_db' }, // defaults to 'app_storage'
})

// Or via the static .create()
const storage = IndexedDBStorage.create<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: {},
})

// Initialization (required)
await storage.initialize()
```

## Writing data (asynchronous!)

```typescript
// set() — returns a Promise
await storage.set('filter', 'active')
await storage.set('items', ['Buy milk', 'Walk dog'])

// update() — returns a Promise
await storage.update((s) => {
  s.items.push('New item')
  s.filter = 'all'
})
```

## Reading data (asynchronous!)

```typescript
// get() — returns a Promise
const items = await storage.get<string[]>('items')   // ['Buy milk']
const filter = await storage.get<string>('filter')   // 'all'

// getState() — returns a Promise
const state = await storage.getState()               // { items: [...], filter: 'all' }

// getStateSync() — synchronous read from the cache (always available!)
const state = storage.getStateSync()                 // { items: [...], filter: 'all' }
```

## Checking, removing, resetting (asynchronous!)

```typescript
// All methods return a Promise:
await storage.has('items')      // true
await storage.keys()            // ['items', 'filter']
await storage.remove('filter')  // remove a key
await storage.clear()           // clear everything (state = {})
await storage.reset()           // return to initialState
```

## Subscriptions (the same for all types!)

```typescript
// Subscriptions work identically for synchronous and asynchronous storages:
const unsub = storage.subscribe('items', (newValue) => {
  console.log('items changed:', newValue)
})

const unsub = storage.subscribe(
  (state) => state.items.length,
  (count) => console.log('items count:', count)
)

const unsub = storage.subscribeToAll((event) => {
  console.log('changed:', event)
})
```

## Differences from MemoryStorage/LocalStorage

1. The configuration requires the `options` field (even an empty object):
   `{ name, initialState, options: {} }` vs `{ name, initialState }`

2. All read/write operations return a Promise:
   `await storage.set(...)` vs `storage.set(...)`

3. `getStateSync()` — works from the cache, shared across all types

4. Subscriptions are identical for all storage types

## Persist migrations and SSR

IndexedDB is persistent, so it supports schema migration via `version` + `migrate`
(the version is stored as a reserved record in the same store and isn't visible in
`getState()`/`keys()`) — see [Persist migrations](./persist-migration.md). Server state is
seeded via [`hydrate(state)`](./ssr-hydration.md) (for IndexedDB — `await storage.hydrate(...)`).
