# Middlewares

> [Back to Main](../../README.md)

Middlewares intercept storage operations (set, get, update, delete, clear) and can modify, filter, or group them. They are configured when the store is created — in the `middlewares` field.

The examples use the end-to-end domain `TodoState = { todos: Todo[]; filter: Filter }` (see the
[MemoryStorage](./memory-storage.md) section). Since middlewares are set at creation time, here we use
dedicated todo stores with the needed wiring.

## Configuration

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'my-todo',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    getDefault().batching({ batchSize: 5, batchDelay: 100 }),
    getDefault().shallowCompare(),
  ],
})
await storage.initialize()

// getDefault() returns an object with the built-in middlewares:
// - batching(options?)       — grouping of frequent writes
// - shallowCompare(options?) — filtering of identical values
// - logger(options?)         — dev log of write actions

// The order in the array = the order of processing
```

## 1. Batching Middleware

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'batching-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    getDefault().batching({
      batchSize: 5,     // maximum operations in a single group
      batchDelay: 100,  // delay before the flush (ms)
    }),
  ],
})
await storage.initialize()

// 12 fast set('filter') — only the last value reaches the subscribers
const filters = ['all', 'active', 'completed'] as const
for (let i = 0; i < 12; i++) {
  storage.set('filter', filters[i % 3])
}
// one notification instead of twelve
```

## 2. ShallowCompare Middleware

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'shallow-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),
  ],
})
await storage.initialize()

// Setting an identical value — the update will NOT happen
storage.set('filter', 'all')     // skipped (the value didn't change)

// Setting a different value — the update will happen
storage.set('filter', 'active')  // updated
```

## 3. ShallowCompare + a custom comparator

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'custom-cmp',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    getDefault().shallowCompare({
      // A custom comparison function for a value by key.
      // Here: treat the task list as "unchanged" if the length is the same.
      comparator: (prev, next) => {
        if (Array.isArray(prev) && Array.isArray(next)) {
          return prev.length === next.length
        }
        return prev === next
      },
    }),
  ],
})
await storage.initialize()
```

## 4. Combining Middlewares

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'combined',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    // Order matters: first filtering, then grouping
    getDefault().shallowCompare(),
    getDefault().batching({ batchSize: 3, batchDelay: 50 }),
  ],
})
await storage.initialize()

// shallowCompare filters out duplicates, batching groups the rest
storage.set('filter', 'all')     // skipped (shallowCompare)
storage.set('filter', 'all')     // skipped (shallowCompare)
storage.set('filter', 'active')  // passes → into the group
```

## 5. BroadcastMiddleware (cross-tab synchronization)

```typescript
import { MemoryStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'broadcast-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [
    syncBroadcastMiddleware({
      storageName: 'broadcast-demo',
      storageType: 'memory',
    }),
  ],
})
await storage.initialize()

// Changes will be synchronized between tabs
storage.update((s) => { s.todos.push({ id: 't1', title: 'From another tab', done: false }) })

// For MemoryStorage — full data synchronization
// For LocalStorage/IndexedDB — only a subscriber notification
// (the data is already synchronized through the storage engine)
```

## 6. Logger Middleware (dev-only)

Logs only **write** actions (`set` / `update` / `delete` / `clear` / `reset` /
`init`) — reads (`get` / `keys`) don't add noise. Intentionally minimal (no i18n/colors).
Wire it up only in dev.

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'logged',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) =>
    import.meta.env.DEV ? [getDefault().logger()] : [],
})
await storage.initialize()

storage.set('filter', 'active')
// [synapse storage] set "filter" (0ms)
//   action: { type: 'set', key: 'filter', value: 'active', ... }
//   prev:   { todos: [...], filter: 'all' }
//   next:   { todos: [...], filter: 'active' }

// Options:
//   collapsed?: boolean   — collapse the log group (console.groupCollapsed)
//   showState?: boolean   — print the prev/next state (default true)
getDefault().logger({ collapsed: true, showState: false })
```

They are also available as standalone functions `loggerMiddleware` (async) and
`syncLoggerMiddleware` (sync) from `synapse-storage/core` — for example, to reuse
a single instance or wrap it in your own wrapper.

> For a full-fledged dev log of the **dispatcher** (action / prev / next / diff) there is a separate
> `loggerDispatcherMiddleware`. The storage logger is about low-level storage operations.

## 7. Custom middleware

There are only three built-in middlewares (`batching`, `shallowCompare`, `logger`), but the
system is fully open: a middleware is just a **plain object** of type `SyncMiddleware`
(for Memory/LocalStorage) or `AsyncMiddleware` (for IndexedDB). No registration is needed —
just return your object in the same array as `getDefault()…`.

### Anatomy

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const myMiddleware = (): SyncMiddleware => ({
  name: 'my-middleware',           // name (for debugging)

  setup: (api) => {},              // optional: called once when wired up
  cleanup: () => {},               // optional: called on destroy()

  // The core — Redux-style triple currying: (api) => (next) => (action)
  reducer: (api) => (next) => (action) => {
    // action — what is happening with the storage:
    //   { type: 'set' | 'get' | 'update' | 'delete' | 'clear' | 'reset' | ...,
    //     key?, value?, metadata? }

    // next(action)        — pass control further down the chain (run the operation)
    // NOT calling next()  — block the operation (the write won't happen)
    // next({ ...action, value: X }) — change the value before writing

    return next(action)
  },
})
```

`api` gives you access to the storage from inside a middleware:

```typescript
api.getState()                       // the whole current state
api.storage.doGet(key)               // read a value (bypassing the chain)
api.storage.doSet(key, value)        // write (bypassing the chain — no recursion)
api.storage.notifySubscribers(key, value)  // notify subscribers manually
api.dispatch(action)                 // run a new action through the whole chain
```

> The chain is wrapped in `try/catch`: if a middleware throws, the error is swallowed by
> the error handler and won't "bubble up" to the caller of `storage.set(...)`.
> So to "reject" something, don't throw — **simply don't call `next`**.

Wiring it up — next to the built-in ones:

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'my-todo',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    getDefault().logger(),   // built-in
    myMiddleware(),          // yours
  ],
})
```

### Example A — write validation

Intercept `set('filter', …)` and **block unknown values**: if the value isn't in the allowed set,
the operation never reaches the storage (we return the current value).

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const ALLOWED_FILTERS = ['all', 'active', 'completed']

const validateFilterMiddleware = (): SyncMiddleware => ({
  name: 'validate-filter',
  reducer: (api) => (next) => (action) => {
    if (action.type === 'set' && action.key === 'filter' && !ALLOWED_FILTERS.includes(action.value)) {
      // Invalid — block the write, return the current value from storage
      return api.storage.doGet('filter')
    }
    return next(action)
  },
})

const storage = new MemoryStorage<TodoState>({
  name: 'todo-validated',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [validateFilterMiddleware()],
})
await storage.initialize()

storage.set('filter', 'archived' as any)  // blocked → filter stays 'all'
storage.set('filter', 'active')           // passes
```

### Example B — normalizing values

A middleware can transform a value instead of blocking it — for example, trim whitespace
from task titles.

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const trimTitlesMiddleware = (): SyncMiddleware => ({
  name: 'trim-titles',
  reducer: () => (next) => (action) => {
    if (action.type === 'set' && action.key === 'todos' && Array.isArray(action.value)) {
      const value = action.value.map((t) => ({ ...t, title: t.title.trim() }))
      return next({ ...action, value })
    }
    return next(action)
  },
})

// storage.set('todos', [{ id, title: '  Buy milk  ', done: false }])
// → stored with title 'Buy milk'
```

### Example C — audit / analytics of changes

An "observer" middleware: it changes nothing, it only reacts to write actions
(handy for logging to your own analytics, sending metrics, etc.).

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const auditMiddleware = (onChange: (key: string, value: any) => void): SyncMiddleware => ({
  name: 'audit',
  reducer: () => (next) => (action) => {
    const result = next(action)  // run the operation first

    if (action.type === 'set' && typeof action.key === 'string') {
      onChange(action.key, action.value)
    }
    return result
  },
})

const storage = new MemoryStorage<TodoState>({
  name: 'todo-audited',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [
    auditMiddleware((key, value) => analytics.track('todo_changed', { key, value })),
  ],
})
```

> For an **asynchronous** storage (IndexedDB) everything is the same, only the type is
> `AsyncMiddleware`, and `reducer`/`api.storage.*` return a `Promise` (use `async/await`
> and `return await next(action)`).

## Types

```typescript
import type {
  SyncMiddleware,         // Middleware for synchronous storages (Memory, LocalStorage)
  AsyncMiddleware,        // Middleware for asynchronous storages (IndexedDB)
  SyncMiddlewareAPI,      // The API available inside a middleware (getState, dispatch)
  AsyncMiddlewareAPI,
  StorageAction,          // { type: 'set'|'get'|'delete'|'clear', key?, value? }
  SyncStorageConfig,      // Config with middlewares?: ConfigureSyncMiddlewares
  AsyncStorageConfig,     // Config with middlewares?: ConfigureAsyncMiddlewares
  BatchingMiddlewareOptions,     // { batchSize?, batchDelay? }
  ShallowCompareMiddlewareOptions, // { comparator?, segments? }
} from 'synapse-storage/core'

// Middleware configuration — a callback with getDefault
type ConfigureSyncMiddlewares = (
  getDefault: () => SyncDefaultMiddlewares
) => SyncMiddleware[]

interface SyncDefaultMiddlewares {
  batching(options?: BatchingMiddlewareOptions): SyncMiddleware
  shallowCompare(options?: ShallowCompareMiddlewareOptions): SyncMiddleware
  logger(options?: LoggerMiddlewareOptions): SyncMiddleware
}

// A similar AsyncDefaultMiddlewares for IndexedDB

// Standalone factories:
//   loggerMiddleware(options?): AsyncMiddleware
//   syncLoggerMiddleware(options?): SyncMiddleware
// LoggerMiddlewareOptions = { collapsed?: boolean; showState?: boolean }
```
