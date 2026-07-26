<!-- source: docs/en/reading-data.md · canonical: https://synapse-homepage.web.app/docs/reading-data · part of https://synapse-homepage.web.app/llms-full.txt -->

# Reading data (get / getState / getStateSync)


All the ways to **read data once** from a storage. This is imperative reading "here and now"; to react
to changes see [Subscriptions](./subscriptions.md), for computed values see [Selectors](./selector-system.md).

The key distinction between the methods is **a single field vs the whole state** and **sync vs async**:

| Method | What it returns | Sync storage (Memory/LocalStorage) | Async storage (IndexedDB) |
|---|---|---|---|
| `get(key)` | a single top-level field | value immediately | `Promise` → needs `await` |
| `getState()` | the whole state | object immediately | `Promise` → needs `await` |
| `getStateSync()` | the whole state **from cache** | same as `getState()` | value **immediately, without await** |
| `has(key)` / `keys()` | existence / list of keys | immediately | `Promise` → needs `await` |

The examples use the end-to-end `todoStorage` — the same store created in the
[MemoryStorage](./memory-storage.md) section:

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

## get(key) — a single top-level field

**When:** you need the value of a single state key. **When not:** you need several fields at once
(use `getState()`) or a nested/computed value (use a selector).

```typescript
// ── Synchronous storage (MemoryStorage / LocalStorage) ──

const filter = todoStorage.get<Filter>('filter')   // 'all'
const todos = todoStorage.get<Todo[]>('todos')     // Todo[]
const missing = todoStorage.get<string>('xxx')     // undefined — no such key

// ── Asynchronous storage (IndexedDBStorage) ──

const filter = await todoStorage.get<Filter>('filter')
const todos = await todoStorage.get<Todo[]>('todos')
```

The type is set via the generic `get<R>(...)`; a missing key → `undefined`.

## getState() — the entire state

**When:** you need the whole state snapshot (several fields, serialization, debugging).

```typescript
// ── Synchronous storage ──

const state = todoStorage.getState()
// { todos: [...], filter: 'all' }

// ── Asynchronous storage ──

const state = await todoStorage.getState()
```

## getStateSync() — state from cache WITHOUT await

The key difference from `getState()`: it is **always synchronous**, even on an asynchronous (IndexedDB)
storage — it reads from the internal cache without touching the DB itself.

**When:** you need a snapshot of an async storage where `await` is inconvenient or forbidden — in `render`,
in a synchronous handler, in a middleware. **When not:** you need the freshest data from IndexedDB itself
rather than from the cache (then `await getState()`).

**Limitation:** works only after `initialize()` — before that the cache is empty.

```typescript
// Synchronous storage — the same as getState().
const state = todoStorage.getStateSync()

// Asynchronous storage — synchronous access to the cache without await!
const state = asyncStorage.getStateSync()
// Useful when you can't await — for example, right in render.
```

## has(key) / keys() — checking and listing

**When:** to check that a key exists before reading it, or to iterate over the existing top-level keys.

```typescript
// ── Synchronous storage ──

todoStorage.has('todos')    // true
todoStorage.has('unknown')  // false
todoStorage.keys()          // ['todos', 'filter']

// ── Asynchronous storage ──

await todoStorage.has('todos')   // true
await todoStorage.keys()         // ['todos', 'filter']
```

The same `has`/`keys` are covered in more detail (together with removal and reset) in the
[remove / has / keys / clear / reset](./delete-has-keys.md) section.

## See also

- [Writing data (set / update)](./writing-data.md) — how to change what you read.
- [Subscriptions](./subscriptions.md) — reacting to changes instead of reading once.
- [Selectors](./selector-system.md) — computed and memoized derived values.
