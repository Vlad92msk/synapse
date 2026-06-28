# Reading data (get/getState)

> [Back to Main](../../README.md)

All the ways to read data from a storage. The examples use the end-to-end `todoStorage` — the same
store created in the [MemoryStorage](./memory-storage.md) section:

```typescript
import { MemoryStorage } from 'synapse-storage/core'

interface Todo { id: string; title: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'
interface TodoState { todos: Todo[]; filter: Filter }

const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
})
await todoStorage.initialize()
```

Synchronous storages (Memory, LocalStorage) return values immediately, while the asynchronous one
(IndexedDB) returns a `Promise`, so it needs `await`.

## get(key) — Reading a single field

```typescript
// ── Synchronous storage (MemoryStorage / LocalStorage) ──

const filter = todoStorage.get<Filter>('filter')   // 'all'
const todos = todoStorage.get<Todo[]>('todos')     // Todo[]
const missing = todoStorage.get<string>('xxx')     // undefined

// ── Asynchronous storage (IndexedDBStorage) ──

const filter = await todoStorage.get<Filter>('filter')
const todos = await todoStorage.get<Todo[]>('todos')
```

## getState() — The entire state

```typescript
// ── Synchronous storage ──

const state = todoStorage.getState()
// { todos: [...], filter: 'all' }

// ── Asynchronous storage ──

const state = await todoStorage.getState()
```

## getStateSync() — Synchronous read from cache

Available on **ALL** storage types — synchronous and asynchronous. Reads from the internal cache, does not touch IndexedDB. Works only after `initialize()`.

```typescript
// Synchronous storage — the same as getState()
const state = todoStorage.getStateSync()

// Asynchronous storage — synchronous access to the cache!
const state = asyncStorage.getStateSync()
// Useful when you don't want to await, e.g. in render
```

## has(key) / keys() — Checking and listing

```typescript
// ── Synchronous storage ──

todoStorage.has('todos')    // true
todoStorage.has('unknown')  // false
todoStorage.keys()          // ['todos', 'filter']

// ── Asynchronous storage ──

await todoStorage.has('todos')   // true
await todoStorage.keys()         // ['todos', 'filter']
```
