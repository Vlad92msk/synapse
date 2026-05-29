# Reading Data (get/getState)

> [Back to Main](../../README.md)

All ways to read data from storage. Sync storages (Memory, LocalStorage) and async (IndexedDB).

## get(key) — Read One Field

```typescript
// ── Sync Storage (MemoryStorage / LocalStorage) ──

const name = storage.get<string>('name')     // 'Alice'
const age = storage.get<number>('age')       // 28
const missing = storage.get<string>('xxx')   // undefined

// ── Async Storage (IndexedDBStorage) ──

const name = await storage.get<string>('name')   // 'Bob'
const age = await storage.get<number>('age')     // 35
```

## getState() — Entire State

```typescript
// ── Sync Storage ──

const state = storage.getState()
// { name: 'Alice', age: 28, role: 'admin' }

// ── Async Storage ──

const state = await storage.getState()
// { name: 'Bob', age: 35, role: 'user' }
```

## getStateSync() — Sync Read from Cache

Available on **ALL** storage types — sync and async. Reads from the internal cache, does not access IndexedDB. Works only after `initialize()`.

```typescript
// Sync Storage — same as getState()
const state = storage.getStateSync()

// Async Storage — sync access to cache!
const state = asyncStorage.getStateSync()
// Useful when you don't want await, e.g. in render
```

## has(key) / keys() — Check and Enumerate

```typescript
// ── Sync Storage ──

storage.has('name')     // true
storage.has('unknown')  // false
storage.keys()          // ['name', 'age', 'role']

// ── Async Storage ──

await storage.has('name')     // true
await storage.has('unknown')  // false
await storage.keys()          // ['name', 'age', 'role']
```
