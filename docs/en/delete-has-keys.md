# remove / has / keys / clear / reset

> [Back to contents](./README.md) · [Working example on GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/DeleteHasKeysExample.tsx)

Operations over **keys and the state lifecycle**: check existence, list, remove a single key, or reset
the whole store. Overview:

| Method | What it does | Result |
|---|---|---|
| `has(key)` | is the key present | `boolean` |
| `keys()` | list of top-level keys | `string[]` |
| `remove(key)` | remove **one** key | the key disappears from `keys()`/`has()` |
| `clear()` | remove **all** keys | state `{}` |
| `reset()` | return to `initialState` | the original fields from the config |

The examples use the end-to-end `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`). They work
the same way for all storage types — for IndexedDB the same methods return a `Promise`.

## has(key) — check whether a key exists

**When:** you need to know whether a key exists without reading its value (for example, before `remove`).

```typescript
// ── Synchronous storage (MemoryStorage / LocalStorage) ──

todoStorage.has('todos')     // true
todoStorage.has('filter')    // true
todoStorage.has('unknown')   // false

// ── Asynchronous storage (IndexedDBStorage) ──

await todoStorage.has('todos')     // true
await todoStorage.has('unknown')   // false
```

## keys() — get all keys

**When:** to iterate over the existing top-level keys (diagnostics, dynamic traversal).

```typescript
// ── Synchronously ──
const allKeys = todoStorage.keys()
// ['todos', 'filter']

// ── Asynchronously ──
const allKeys = await todoStorage.keys()
```

## remove(key) — remove a single key

**When:** you need to remove exactly one key while keeping the rest. After removal `has(key)` returns
`false`, and `keys()` will not contain that key.

```typescript
// ── Synchronously ──
todoStorage.remove('filter')
todoStorage.has('filter')   // false
todoStorage.keys()          // ['todos']

// ── Asynchronously ──
await todoStorage.remove('filter')
```

## clear() — clear everything

**When:** you need to fully zero out the storage — the state becomes an empty object `{}`.
**When not:** you want to bring back the original fields — then use `reset()`.

```typescript
// ── Synchronously ──
todoStorage.clear()
todoStorage.getState()   // {}
todoStorage.keys()       // []

// ── Asynchronously ──
await todoStorage.clear()
```

## reset() — reset to initialState

**When:** you need to roll the store back to its original state from the config (after `clear`, on a "form reset", etc.).

```typescript
// ── Synchronously ──
todoStorage.reset()
todoStorage.getState()   // { todos: [], filter: 'all' }

// ── Asynchronously ──
await todoStorage.reset()
```

## clear() vs reset() — what's the difference

Both "zero out" the store, but differently: `clear()` **removes all keys** (empty `{}`), `reset()`
**restores `initialState`**. The choice depends on whether you need the original fields to come back.

```typescript
const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
})

todoStorage.set('filter', 'completed')

// clear() — a full wipe down to an empty object.
todoStorage.clear()
todoStorage.getState()   // {}
todoStorage.keys()       // []

// reset() — back to initialState from the config.
todoStorage.reset()
todoStorage.getState()   // { todos: [], filter: 'all' }
todoStorage.keys()       // ['todos', 'filter']
```

## See also

- [Reading data](./reading-data.md) · [Writing data](./writing-data.md)
- [Subscriptions](./subscriptions.md) — `subscribeToAll` sees `remove` / `clear` / `reset` events.
