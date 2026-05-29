# Synapse Storage

> **🇺🇸 English** | [📝 ChangeLog](./CHANGELOG.md)

State management toolkit + API client

[![npm version](https://badge.fury.io/js/synapse-storage.svg)](https://badge.fury.io/js/synapse-storage)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/synapse-storage)](https://bundlephobia.com/package/synapse-storage)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![RxJS Version](https://img.shields.io/badge/RxJS-%5E7.8.2-red?logo=reactivex)](https://rxjs.dev/)

## Key Features

- **Framework Agnostic** — works with any framework or standalone
- **Sync & Async Storage** — Memory/LocalStorage (fully synchronous) and IndexedDB (async) with type-safe separation
- **Selectors** — memoized computed values with dependency tracking (like Reselect)
- **Subscriptions** — subscribe to nested paths via selector functions
- **Immer-like Updates** — mutate state directly inside `update()` callbacks
- **API Client** — HTTP client with caching, tags, and invalidation (like RTK Query)
- **React Integration** — hooks built on `useSyncExternalStore` (Concurrent Mode safe)
- **RxJS Reactive** — Redux-Observable style effects, dispatchers, and watchers
- **Middleware & Plugins** — separate sync/async systems for extending storage behavior
- **Singleton Support** — shared storage instances across components with merge strategies
- **EventBus** — decoupled inter-module communication with wildcards and history
- **Cross-tab Sync** — BroadcastChannel middleware for multi-tab state synchronization

---

## Author

**Vladislav** — Senior Frontend Developer (React, TypeScript)

[GitHub](https://github.com/Vlad92msk/) | [LinkedIn](https://www.linkedin.com/in/vlad-firsov/)

---
*PS: Not recommended for production use yet as I develop this in my free time.
The library works in general, but I can provide guarantees only after full integration into my pet project - Social Network.
This won't happen before changing my current workplace and country of residence*

---

## Installation

```bash
npm install synapse-storage
```

```bash
# For reactive capabilities
npm install rxjs

# For React integration
npm install react react-dom
```

| Module | Description | Dependencies |
|--------|-------------|--------------|
| `synapse-storage/core` | Storage, selectors, middleware, plugins | — |
| `synapse-storage/react` | React hooks and context utilities | React 18+ |
| `synapse-storage/reactive` | Dispatcher, effects, watchers | RxJS 7.8.2+ |
| `synapse-storage/api` | HTTP client with caching | — |
| `synapse-storage/utils` | createSynapse, EventBus, awaiter | — |

> Import only the modules you need — each works independently.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler"
  }
}
```

---

## Quick Start

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage({
  name: 'counter',
  initialState: { count: 0, user: { name: 'Anonymous' } },
})
await storage.initialize()

// Read
storage.getState()           // { count: 0, user: { name: 'Anonymous' } }
storage.get('count')         // 0

// Write
storage.set('count', 1)

// Immer-like update (multiple mutations = one notification)
storage.update((state) => {
  state.count += 1
  state.user.name = 'Alice'
})

// Subscribe to nested path
const unsub = storage.subscribe(
  (s) => s.user.name,
  (name) => console.log('Name changed:', name)
)

// Reset to initialState
storage.reset()
```

---

## Storage Types

Synapse has two storage categories with **type-safe separation**:

### Sync Storage (MemoryStorage, LocalStorage)

All operations are synchronous — `get()`, `set()`, `update()`, `getState()` return values directly.

```typescript
import { MemoryStorage, LocalStorage } from 'synapse-storage/core'

const memory = new MemoryStorage<State>({ name: 'app', initialState })
const local = new LocalStorage<State>({ name: 'app', initialState })

await memory.initialize()
const value = memory.get('key') // T — sync
```

### Async Storage (IndexedDBStorage)

Operations return Promises — persistent browser storage.

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

const idb = new IndexedDBStorage<State>({
  name: 'app',
  initialState,
  options: { dbName: 'my_app_db' },
})

await idb.initialize()
const value = await idb.get('key') // Promise<T>
```

### getStateSync()

Available on **all** storage types — returns the cached state synchronously, even for IndexedDB:

```typescript
const state = storage.getStateSync() // always sync
```

### Static Factory Methods

Every storage class has a `.create()` static method:

```typescript
const storage = MemoryStorage.create<State>({ name: 'app', initialState })
const storage = LocalStorage.create<State>({ name: 'app', initialState })
const storage = IndexedDBStorage.create<State>({ name: 'app', initialState, options: {} })
```

### StorageFactory

Universal factory with type-safe overloads:

```typescript
import { StorageFactory } from 'synapse-storage/core'

// Typed factories
const mem = StorageFactory.createMemory<S>({ name: 'x', initialState })
const loc = StorageFactory.createLocal<S>({ name: 'x', initialState })
const idb = StorageFactory.createIndexedDB<S>({ name: 'x', initialState, options: {} })

// Universal — return type depends on `type`
const storage = StorageFactory.create<S>({
  type: 'memory',       // → ISyncStorage<S>
  name: 'x',
  initialState,
})
```

---

## Reading & Writing Data

### Reading

```typescript
storage.get('key')          // value by key
storage.getState()          // full state
storage.getStateSync()      // sync cache (all storage types)
storage.has('key')          // boolean
storage.keys()              // string[]
```

### Writing

```typescript
storage.set('key', value)              // set single key
storage.update((s) => { s.count++ })   // Immer-like mutations
storage.remove('key')                  // delete key
storage.reset()                        // restore initialState
storage.clear()                        // reset to {}
```

> For IndexedDB, all write operations return `Promise`.

---

## Subscriptions

```typescript
// Subscribe by key
const unsub = storage.subscribe('count', (newValue) => {
  console.log('count:', newValue)
})

// Subscribe by selector function (nested paths)
const unsub = storage.subscribe(
  (state) => state.user.name,
  (name) => console.log('name:', name)
)

// Subscribe to all changes
const unsub = storage.subscribeToAll((event) => {
  // event.type: 'set' | 'update' | 'remove' | 'clear' | 'reset'
  // event.key, event.changedPaths
})
```

---

## Selector System

Memoized computed values with dependency tracking:

```typescript
import { SelectorModule } from 'synapse-storage/core'

const sm = new SelectorModule(storage)

// Simple selector
const count = sm.createSelector((state) => state.count)

// With custom equality
const items = sm.createSelector(
  (state) => state.items,
  { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
)

// Dependent selector (recalculates only when deps change)
const filtered = sm.createSelector(
  [items, filter],
  (itemsVal, filterVal) => itemsVal.filter(i => i.type === filterVal)
)

// Usage
const value = filtered.select()
const unsub = filtered.subscribe({ notify: (value) => console.log(value) })
```

---

## Middleware System

Separate sync and async middleware for each storage type:

```typescript
const storage = new MemoryStorage<State>({
  name: 'store',
  initialState,
  middlewares: (getDefault) => [
    // Batch rapid writes
    getDefault().batching({ batchSize: 5, batchDelay: 100 }),

    // Skip updates if value unchanged
    getDefault().shallowCompare(),
  ],
})
```

### Cross-tab Synchronization

```typescript
import { syncBroadcastMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<State>({
  name: 'store',
  initialState,
  middlewares: () => [
    syncBroadcastMiddleware({ storageName: 'store', storageType: 'memory' }),
  ],
})
```

---

## Plugin System

Lifecycle hooks for intercepting storage operations:

```typescript
import { ISyncStoragePlugin, SyncStoragePluginModule } from 'synapse-storage/core'

class TimestampPlugin implements ISyncStoragePlugin {
  name = 'timestamp'

  async initialize() {}
  async destroy() {}

  onBeforeSet<T>(value: T, context): T { return value }
  onAfterSet<T>(key, value: T, ctx): T { return value }
  onBeforeGet(key, ctx) { return key }
  onAfterGet<T>(key, value: T | undefined, ctx) { return value }
  onBeforeDelete(key, ctx): boolean { return true } // false = block
  onAfterDelete(key, ctx) {}
  onClear(ctx) {}
}

const plugins = new SyncStoragePluginModule(undefined, undefined, 'store')
await plugins.add(new TimestampPlugin())

const storage = new MemoryStorage<State>(
  { name: 'store', initialState },
  plugins
)
```

> For IndexedDB, use `IAsyncStoragePlugin` and `AsyncStoragePluginModule`.

---

## React Integration

Hooks are built on `useSyncExternalStore` — safe in Concurrent Mode, no tearing.

### useCreateStorage

Returns a **discriminated union**: when `isReady: true`, `storage` is guaranteed non-null.

```tsx
import { useCreateStorage } from 'synapse-storage/react'

function App() {
  const { storage, isReady } = useCreateStorage<State>({
    type: 'memory',       // 'memory' | 'localStorage' → ISyncStorage
    name: 'app',          // 'indexedDB' → IAsyncStorage
    initialState: { count: 0 },
  })

  if (!isReady) return <div>Loading...</div>
  // storage is ISyncStorage<State> here (not null)
}
```

### useStorageSubscribe

```tsx
import { useStorageSubscribe } from 'synapse-storage/react'

function Counter() {
  const count = useStorageSubscribe(storage, (s) => s.count)
  const summary = useStorageSubscribe(storage, (s) => `Total: ${s.count}`)
  return <div>{count} — {summary}</div>
}
```

### useSelector

```tsx
import { useSelector } from 'synapse-storage/react'

function ItemList() {
  const items = useSelector(filteredItemsSelector)
  return <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>
}
```

### createSynapseCtx

Context-based pattern for sharing synapse across component tree:

```tsx
import { createSynapseCtx, useSelector } from 'synapse-storage/react'

const {
  contextSynapse,
  useSynapseStorage,
  useSynapseSelectors,
  useSynapseActions,
  cleanupSynapse,
} = createSynapseCtx(storePromise, {
  loadingComponent: <div>Loading...</div>,
})

const Page = contextSynapse(() => {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const count = useSelector(selectors.count)

  return <button onClick={() => actions.increment()}>Count: {count}</button>
})
```

### awaitSynapse

HOC and hook for waiting on synapse initialization:

```tsx
import { awaitSynapse } from 'synapse-storage/react'

const awaiter = awaitSynapse(storePromise, {
  loadingComponent: <div>Loading...</div>,
  errorComponent: (error) => <div>Error: {error.message}</div>,
})

// HOC
const ReadyComponent = awaiter.withSynapseReady(MyComponent)

// Hook
function Status() {
  const { isReady, isPending, isError, store } = awaiter.useSynapseReady()
  if (isPending) return <div>Loading...</div>
  if (isError) return <div>Error</div>
  return <div>Ready</div>
}

// Programmatic (also works outside React)
awaiter.isReady()            // boolean
awaiter.getStatus()          // 'pending' | 'ready' | 'error'
await awaiter.waitForReady() // Promise<Store>
awaiter.onReady((store) => { /* ... */ })
```

---

## Reactive Features (RxJS)

### Dispatcher — Actions & Watchers

```typescript
import { createDispatcher, createAction, createWatcher } from 'synapse-storage/reactive'

const dispatcher = createDispatcher(
  { storage },
  (_storage, { createAction, createWatcher }) => {
    const increment = createAction({
      type: 'increment',
      action: () => storage.update((s) => { s.count += 1 }),
    })

    const setName = createAction({
      type: 'setName',
      action: (name: string) => {
        storage.set('name', name)
        return name
      },
    })

    const watchCount = createWatcher({
      type: 'watchCount',
      selector: (state) => state.count,
      shouldTrigger: (prev, curr) => prev !== curr,
      notifyAfterSubscribe: true,
    })

    return { increment, setName, watchCount }
  }
)

// Dispatch
dispatcher.dispatch.increment()
dispatcher.dispatch.setName('Alice')

// Watch (RxJS Observable)
dispatcher.watchers.watchCount().subscribe((action) => {
  console.log('count:', action.payload)
})

// Action stream
dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})

dispatcher.destroy()
```

### Effects

```typescript
import { createEffect, ofType } from 'synapse-storage/reactive'
import { debounceTime, switchMap, tap } from 'rxjs/operators'

createEffect((action$, state$, { dispatcher }) =>
  action$.pipe(
    ofType(dispatcher.dispatch.search),
    debounceTime(400),
    switchMap((action) =>
      fetchResults(action.payload).pipe(
        tap((results) => dispatcher.dispatch.searchSuccess(results))
      )
    )
  )
)
```

---

## createSynapse

High-level utility that wires storage + selectors + dispatcher + effects together:

```typescript
import { createSynapse } from 'synapse-storage/utils'

const storePromise = createSynapse({
  storage: new MemoryStorage<State>({ name: 'app', initialState }),

  createSelectorsFn: (sm) => ({
    count: sm.createSelector((s) => s.count),
    doubled: sm.createSelector(
      [count],
      (c) => c * 2
    ),
  }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_s, { createAction, createWatcher }) => ({
      increment: createAction({
        type: 'increment',
        action: () => storage.update((s) => { s.count += 1 }),
      }),
      watchCount: createWatcher({
        type: 'watchCount',
        selector: (s) => s.count,
      }),
    })),

  effects: [
    createEffect((action$, state$, { dispatcher }) =>
      action$.pipe(/* ... */)
    ),
  ],
})

const store = await storePromise

store.storage     // ISyncStorage<State>
store.selectors   // { count, doubled }
store.actions     // { increment, ... }
store.dispatcher  // Dispatcher
store.state$      // Observable<State> (when effects are used)
store.destroy()   // cleanup everything
```

### Dependencies

```typescript
const authStore = createSynapse({ /* ... */ })

const settingsStore = createSynapse({
  dependencies: [authStore],
  dependencyTimeout: 5000,

  createStorageFn: async () => {
    const auth = await authStore
    const userId = auth.storage.getStateSync().userId
    const storage = new MemoryStorage({ name: 'settings', initialState: { userId } })
    await storage.initialize()
    return storage
  },
})
```

---

## API Client

HTTP client with typed endpoints, caching, and tag-based invalidation:

```typescript
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'

const cacheStorage = new MemoryStorage<Record<string, any>>({
  name: 'api-cache',
  initialState: {},
})

const api = new ApiClient({
  storage: cacheStorage,
  baseQuery: {
    baseUrl: 'https://api.example.com',
    timeout: 10000,
    prepareHeaders: async (headers, context) => {
      headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  },
  cache: {
    ttl: 60000,
    cleanup: { enabled: true, interval: 120000 },
    invalidateOnError: true,
  },
  endpoints: async (create) => ({
    getUsers: create<{ limit?: number }, UsersResponse>({
      request: (params) => ({
        path: '/users',
        method: 'GET',
        query: params,
      }),
      cache: { ttl: 120000 },
      tags: ['users'],
    }),
    createUser: create<CreateUserInput, User>({
      request: (params) => ({
        path: '/users',
        method: 'POST',
        body: params,
      }),
      invalidatesTags: ['users'],
      cache: false,
    }),
  }),
})

await cacheStorage.initialize()
await api.init()

// Simple request
const result = await api.request('getUsers', { limit: 10 })
if (result.ok) console.log(result.data, result.fromCache)

// Endpoint-level subscription
const endpoints = api.getEndpoints()
const req = endpoints.getUsers.request({ limit: 10 })

req.subscribe((state) => {
  // state.status: 'idle' | 'loading' | 'success' | 'error'
  // state.data, state.error, state.fromCache
})

const result = await req.wait()
req.abort()
```

---

## EventBus

Decoupled communication between modules:

```typescript
import { createEventBus } from 'synapse-storage/utils'

const eventBus = await createEventBus({
  name: 'app-events',
  autoCleanup: true,
  maxEvents: 1000,
})

// Publish
await eventBus.actions.publish({
  event: 'USER_UPDATED',
  data: { userId: 123 },
  metadata: { priority: 'high', ttl: 60000 },
})

// Subscribe (supports wildcards)
const { unsubscribe } = await eventBus.actions.subscribe({
  eventPattern: 'USER_*',
  handler: (data, event) => console.log(event.event, data),
})

// History
const history = await eventBus.actions.getEventHistory({
  eventType: 'USER_UPDATED',
  limit: 10,
})

await eventBus.destroy()
```

---

## Singleton Pattern

Share storage instances across components:

```typescript
import { MemoryStorage, ConfigMergeStrategy } from 'synapse-storage/core'

// Component A
const storage1 = new MemoryStorage({
  name: 'shared',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.FIRST_WINS,
  },
  initialState: { count: 0 },
})

// Component B — gets the same instance
const storage2 = new MemoryStorage({
  name: 'shared',
  singleton: { enabled: true },
  initialState: { count: 99 }, // ignored (FIRST_WINS)
})

storage1 === storage2 // true
```

Merge strategies: `FIRST_WINS`, `DEEP_MERGE`, `OVERRIDE`, `WARN_AND_USE_FIRST`, `STRICT` (throws).

---

## Storage Lifecycle

```typescript
await storage.initialize()
await storage.waitForReady()

storage.initStatus // { status: 'ready' | 'loading' | 'error' | 'idle' }

const unsub = storage.onStatusChange((status) => console.log(status))

await storage.destroy()
```

---

## Examples

- [GitHub Examples](https://github.com/Vlad92msk/synapse-examples)
- [YouTube](https://www.youtube.com/channel/UCGENI_i4qmBkPp93P2HvvGw)

---

## License

MIT
