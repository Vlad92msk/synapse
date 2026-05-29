# Middlewares

> [Back to Main](../../README.md)

Middlewares intercept storage operations (set, get, delete, clear) and can modify, filter, or batch them.

## Configuration

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<MyState>({
  name: 'my-store',
  initialState: { ... },
  middlewares: (getDefault) => [
    getDefault().batching({ batchSize: 5, batchDelay: 100 }),
    getDefault().shallowCompare(),
  ],
})
await storage.initialize()

// getDefault() returns an object with built-in middlewares:
// - batching(options?)       — batch rapid writes
// - shallowCompare(options?) — filter identical values

// Array order = processing order
```

## 1. Batching Middleware

```typescript
const storage = new MemoryStorage<{ counter: number; items: string[] }>({
  name: 'batching-demo',
  initialState: { counter: 0, items: [] },
  middlewares: (getDefault) => [
    getDefault().batching({
      batchSize: 5,     // max operations in one batch
      batchDelay: 100,  // delay before flush (ms)
    }),
  ],
})
await storage.initialize()

// 20 rapid sets — only the last value reaches storage
for (let i = 0; i < 20; i++) {
  storage.set('counter', i)
}
// counter = 19 (not 20 notifications, but one)

// Multiple sets on one key — last one is saved
storage.set('items', ['a'])
storage.set('items', ['a', 'b'])
storage.set('items', ['a', 'b', 'c'])
// items = ['a', 'b', 'c']
```

## 2. ShallowCompare Middleware

```typescript
const storage = new MemoryStorage<{ user: { name: string; age: number } }>({
  name: 'shallow-demo',
  initialState: { user: { name: 'Alice', age: 30 } },
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),
  ],
})
await storage.initialize()

// Setting identical object — update will NOT happen
storage.set('user', { name: 'Alice', age: 30 })  // skip

// Setting different object — update will happen
storage.set('user', { name: 'Bob', age: 25 })    // update
```

## 3. ShallowCompare + Custom Comparator

```typescript
const storage = new MemoryStorage<{ score: number }>({
  name: 'custom-cmp',
  initialState: { score: 0 },
  middlewares: (getDefault) => [
    getDefault().shallowCompare({
      // Custom comparison function
      comparator: (prev, next) => {
        if (typeof prev === 'number' && typeof next === 'number') {
          return Math.abs(prev - next) < 5  // diff < 5 = "same"
        }
        return prev === next
      },
    }),
  ],
})
await storage.initialize()

storage.set('score', 2)   // skip (diff < 5)
storage.set('score', 10)  // update (diff >= 5)
```

## 4. Combining Middlewares

```typescript
const storage = new MemoryStorage<{ value: string; count: number }>({
  name: 'combined',
  initialState: { value: 'hello', count: 0 },
  middlewares: (getDefault) => [
    // Order matters: first filtering, then batching
    getDefault().shallowCompare(),
    getDefault().batching({ batchSize: 3, batchDelay: 50 }),
  ],
})
await storage.initialize()

// shallowCompare filters duplicates, batching groups the rest
storage.set('value', 'hello')  // skip (shallowCompare)
storage.set('value', 'hello')  // skip (shallowCompare)
storage.set('value', 'world')  // passes → into batch
```

## 5. BroadcastMiddleware (cross-tab sync)

```typescript
import { MemoryStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<{ message: string }>({
  name: 'broadcast-demo',
  initialState: { message: 'No messages' },
  middlewares: () => [
    syncBroadcastMiddleware({
      storageName: 'broadcast-demo',
      storageType: 'memory',
    }),
  ],
})
await storage.initialize()

// Changes will sync between tabs
storage.set('message', 'Hello from tab!')

// For MemoryStorage — full data sync
// For LocalStorage/IndexedDB — only subscriber notification
// (data is already synced via storage engine)
```

## Types

```typescript
import type {
  SyncMiddleware,         // Middleware for sync storages (Memory, LocalStorage)
  AsyncMiddleware,        // Middleware for async storages (IndexedDB)
  SyncMiddlewareAPI,      // API available inside middleware (getState, dispatch)
  AsyncMiddlewareAPI,
  StorageAction,          // { type: 'set'|'get'|'delete'|'clear', key?, value? }
  SyncStorageConfig,      // Config with middlewares?: ConfigureSyncMiddlewares
  AsyncStorageConfig,     // Config with middlewares?: ConfigureAsyncMiddlewares
  BatchingMiddlewareOptions,     // { batchSize?, batchDelay? }
  ShallowCompareMiddlewareOptions, // { comparator?, segments? }
} from 'synapse-storage/core'

// Middleware configuration — callback with getDefault
type ConfigureSyncMiddlewares = (
  getDefault: () => SyncDefaultMiddlewares
) => SyncMiddleware[]

interface SyncDefaultMiddlewares {
  batching(options?: BatchingMiddlewareOptions): SyncMiddleware
  shallowCompare(options?: ShallowCompareMiddlewareOptions): SyncMiddleware
}

// Analogous AsyncDefaultMiddlewares for IndexedDB
```
