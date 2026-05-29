# IndexedDBStorage

> [Back to Main](../../README.md)

Data is stored in IndexedDB. Survives page reloads. **Asynchronous API** — all methods return Promises.

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

// With custom dbName
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: { dbName: 'my_app_db' }, // default is 'app_storage'
})

// Or via static .create()
const storage = IndexedDBStorage.create<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: {},
})

// Initialization (required)
await storage.initialize()
```

## Writing Data (async!)

```typescript
// set() — returns Promise
await storage.set('filter', 'active')
await storage.set('items', ['Buy milk', 'Walk dog'])

// update() — returns Promise
await storage.update((s) => {
  s.items.push('New item')
  s.filter = 'all'
})
```

## Reading Data (async!)

```typescript
// get() — returns Promise
const items = await storage.get<string[]>('items')   // ['Buy milk']
const filter = await storage.get<string>('filter')   // 'all'

// getState() — returns Promise
const state = await storage.getState()               // { items: [...], filter: 'all' }

// getStateSync() — sync read from cache (always available!)
const state = storage.getStateSync()                 // { items: [...], filter: 'all' }
```

## Check, Delete, Reset (async!)

```typescript
// All methods return Promises:
await storage.has('items')      // true
await storage.keys()            // ['items', 'filter']
await storage.remove('filter')  // delete a key
await storage.clear()           // clear everything (state = {})
await storage.reset()           // return to initialState
```

## Subscriptions (same for all types!)

```typescript
// Subscriptions work identically for sync and async storages:
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

1. Config requires the `options` field (even an empty object):
   `{ name, initialState, options: {} }` vs `{ name, initialState }`

2. All read/write operations return Promises:
   `await storage.set(...)` vs `storage.set(...)`

3. `getStateSync()` — works from cache, common to all types

4. Subscriptions are identical for all storage types
