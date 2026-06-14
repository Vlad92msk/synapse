# Reading data (get/getState)

> [Back to Main](../../README.md)

All the ways to read data from a storage. Synchronous storages (Memory, LocalStorage) and asynchronous ones (IndexedDB).

## get(key) — Reading a single field

```typescript
// ── Synchronous storage (MemoryStorage / LocalStorage) ──

const name = storage.get<string>('name')     // 'Alice'
const age = storage.get<number>('age')       // 28
const missing = storage.get<string>('xxx')   // undefined

// ── Asynchronous storage (IndexedDBStorage) ──

const name = await storage.get<string>('name')   // 'Bob'
const age = await storage.get<number>('age')     // 35
```

## getState() — The entire state

```typescript
// ── Synchronous storage ──

const state = storage.getState()
// { name: 'Alice', age: 28, role: 'admin' }

// ── Asynchronous storage ──

const state = await storage.getState()
// { name: 'Bob', age: 35, role: 'user' }
```

## getStateSync() — Synchronous read from cache

Available on **ALL** storage types — synchronous and asynchronous. Reads from the internal cache, does not touch IndexedDB. Works only after `initialize()`.

```typescript
// Synchronous storage — the same as getState()
const state = storage.getStateSync()

// Asynchronous storage — synchronous access to the cache!
const state = asyncStorage.getStateSync()
// Useful when you don't want to await, e.g. in render
```

## has(key) / keys() — Checking and listing

```typescript
// ── Synchronous storage ──

storage.has('name')     // true
storage.has('unknown')  // false
storage.keys()          // ['name', 'age', 'role']

// ── Asynchronous storage ──

await storage.has('name')     // true
await storage.has('unknown')  // false
await storage.keys()          // ['name', 'age', 'role']
```
