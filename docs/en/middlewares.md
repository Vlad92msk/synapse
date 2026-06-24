# Middlewares

> [Back to Main](../../README.md)

Middlewares intercept storage operations (set, get, delete, clear) and can modify, filter, or group them.

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

// getDefault() returns an object with the built-in middlewares:
// - batching(options?)       — grouping of frequent writes
// - shallowCompare(options?) — filtering of identical values
// - logger(options?)         — dev log of write actions

// The order in the array = the order of processing
```

## 1. Batching Middleware

```typescript
const storage = new MemoryStorage<{ counter: number; items: string[] }>({
  name: 'batching-demo',
  initialState: { counter: 0, items: [] },
  middlewares: (getDefault) => [
    getDefault().batching({
      batchSize: 5,     // maximum operations in a single group
      batchDelay: 100,  // delay before the flush (ms)
    }),
  ],
})
await storage.initialize()

// 20 fast sets — only the last value lands in the storage
for (let i = 0; i < 20; i++) {
  storage.set('counter', i)
}
// counter = 19 (one notification instead of 20)

// Several sets on one key — the last one is kept
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

// Setting an identical object — the update will NOT happen
storage.set('user', { name: 'Alice', age: 30 })  // skipped

// Setting a different object — the update will happen
storage.set('user', { name: 'Bob', age: 25 })    // updated
```

## 3. ShallowCompare + a custom comparator

```typescript
const storage = new MemoryStorage<{ score: number }>({
  name: 'custom-cmp',
  initialState: { score: 0 },
  middlewares: (getDefault) => [
    getDefault().shallowCompare({
      // A custom comparison function
      comparator: (prev, next) => {
        if (typeof prev === 'number' && typeof next === 'number') {
          return Math.abs(prev - next) < 5  // difference < 5 = "the same"
        }
        return prev === next
      },
    }),
  ],
})
await storage.initialize()

storage.set('score', 2)   // skipped (difference < 5)
storage.set('score', 10)  // updated (difference >= 5)
```

## 4. Combining Middlewares

```typescript
const storage = new MemoryStorage<{ value: string; count: number }>({
  name: 'combined',
  initialState: { value: 'hello', count: 0 },
  middlewares: (getDefault) => [
    // Order matters: first filtering, then grouping
    getDefault().shallowCompare(),
    getDefault().batching({ batchSize: 3, batchDelay: 50 }),
  ],
})
await storage.initialize()

// shallowCompare filters out duplicates, batching groups the rest
storage.set('value', 'hello')  // skipped (shallowCompare)
storage.set('value', 'hello')  // skipped (shallowCompare)
storage.set('value', 'world')  // passes → into the group
```

## 5. BroadcastMiddleware (cross-tab synchronization)

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

// Changes will be synchronized between tabs
storage.set('message', 'Hello from tab!')

// For MemoryStorage — full data synchronization
// For LocalStorage/IndexedDB — only a subscriber notification
// (the data is already synchronized through the storage engine)
```

## 6. Logger Middleware (dev-only)

Logs only **write** actions (`set` / `update` / `delete` / `clear` / `reset` /
`init`) — reads (`get` / `keys`) don't add noise. Intentionally minimal (no i18n/colors).
Wire it up only in dev.

```typescript
const storage = new MemoryStorage<{ count: number }>({
  name: 'logged',
  initialState: { count: 0 },
  middlewares: (getDefault) =>
    import.meta.env.DEV ? [getDefault().logger()] : [],
})
await storage.initialize()

storage.set('count', 1)
// [synapse storage] set "count" (0ms)
//   action: { type: 'set', key: 'count', value: 1, ... }
//   prev:   { count: 0 }
//   next:   { count: 1 }

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
const storage = new MemoryStorage<MyState>({
  name: 'my-store',
  initialState: { ... },
  middlewares: (getDefault) => [
    getDefault().logger(),   // built-in
    myMiddleware(),          // yours
  ],
})
```

### Example A — form validation

Intercept writes to form fields, run them through validators, and **block invalid values**,
storing the error messages in a sibling `errors` key.

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

type FormState = {
  email: string
  age: number
  errors: Record<string, string | undefined>
}

// key → validator: return an error string OR null if everything is fine
const validators: Record<string, (value: any) => string | null> = {
  email: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Invalid e-mail'),
  age: (v) => (v >= 18 && v <= 120 ? null : 'Age must be 18–120'),
}

const validationMiddleware = (): SyncMiddleware => ({
  name: 'form-validation',
  reducer: (api) => (next) => (action) => {
    if (action.type !== 'set' || typeof action.key !== 'string') {
      return next(action)
    }

    const validate = validators[action.key]
    if (!validate) return next(action)

    const error = validate(action.value)

    // Write the error map directly (doSet bypasses the chain — no recursion)
    const errors = { ...(api.getState().errors ?? {}), [action.key]: error ?? undefined }
    api.storage.doSet('errors', errors)
    api.storage.notifySubscribers('errors', errors)

    // Invalid — block the write, return the current value from storage
    if (error) return api.storage.doGet(action.key)

    // Valid — pass it through
    return next(action)
  },
})

const form = new MemoryStorage<FormState>({
  name: 'signup-form',
  initialState: { email: '', age: 0, errors: {} },
  middlewares: () => [validationMiddleware()],
})
await form.initialize()

form.set('email', 'not-an-email')      // blocked, errors.email = 'Invalid e-mail'
form.set('email', 'user@example.com')  // passes, errors.email = undefined
form.set('age', 15)                    // blocked, errors.age = '...'
```

### Example B — normalizing values

A middleware can transform a value instead of blocking it — for example, trim whitespace
and lowercase an e-mail before writing.

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const normalizeMiddleware = (): SyncMiddleware => ({
  name: 'normalize',
  reducer: () => (next) => (action) => {
    if (action.type === 'set' && typeof action.value === 'string') {
      let value = action.value.trim()
      if (action.key === 'email') value = value.toLowerCase()

      // Pass the already-modified value further
      return next({ ...action, value })
    }
    return next(action)
  },
})

// storage.set('email', '  User@Example.COM  ') → stored as 'user@example.com'
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

const storage = new MemoryStorage<{ theme: string }>({
  name: 'settings',
  initialState: { theme: 'light' },
  middlewares: () => [
    auditMiddleware((key, value) => analytics.track('setting_changed', { key, value })),
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
