# MemoryStorage

> [Back to Main](../../README.md)

In-memory storage. Data lives only while the page is open. Synchronous API.

## Creating

```typescript
import { MemoryStorage } from 'synapse-storage/core'

interface CounterState {
  count: number
  label: string
}

// Via new
const storage = new MemoryStorage<CounterState>({
  name: 'memory-counter',
  initialState: { count: 0, label: 'clicks' },
})

// Or via static .create()
const storage = MemoryStorage.create<CounterState>({
  name: 'memory-counter',
  initialState: { count: 0, label: 'clicks' },
})

// Initialization (required)
await storage.initialize()
```

## Writing Data

```typescript
// set() — set a value by key
storage.set('count', 5)
storage.set('label', 'taps')

// update() — change multiple fields at once (immer-like)
storage.update((s) => {
  s.count += 10
  s.label = 'updated'
})
```

## Reading Data

```typescript
// get() — get a value by key
const count = storage.get<number>('count')     // 5
const label = storage.get<string>('label')     // 'clicks'

// getState() — get the entire state
const state = storage.getState()               // { count: 5, label: 'clicks' }

// getStateSync() — same for sync storages
const state = storage.getStateSync()           // { count: 5, label: 'clicks' }
```

## Check, Delete, Reset

```typescript
// has() — check if a key exists
storage.has('count')   // true
storage.has('unknown') // false

// keys() — get the list of keys
storage.keys()         // ['count', 'label']

// remove() — delete a specific key
storage.remove('label')

// clear() — clear the entire storage (state = {})
storage.clear()

// reset() — reset to initialState
storage.reset()        // state = { count: 0, label: 'clicks' }
```

## Subscriptions

```typescript
// Subscribe to a specific key
const unsub = storage.subscribe('count', (newValue) => {
  console.log('count changed:', newValue)
})

// Subscribe via path-selector
const unsub = storage.subscribe(
  (state) => state.count,
  (newCount) => console.log('count:', newCount)
)

// Subscribe to all changes
const unsub = storage.subscribeToAll((event) => {
  console.log('changed:', event)
})

// Unsubscribe
unsub()
```

## Lifecycle

```typescript
// Initialize
await storage.initialize()

// Wait for ready
await storage.waitForReady()

// Status
storage.initStatus  // { status: 'ready' }

// Subscribe to status changes
const unsub = storage.onStatusChange((status) => {
  console.log(status) // { status: 'ready' | 'loading' | 'error' | 'idle' }
})

// Destroy
await storage.destroy()
```
