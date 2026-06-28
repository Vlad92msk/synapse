# remove / has / keys / clear / reset

> [Back to Main](../../README.md)

Operations for checking existence, removing keys, and resetting the storage. The examples use the
end-to-end `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`). They work the same way for
all storage types — for IndexedDB the same methods return a `Promise`.

## has(key) — Check whether a key exists

```typescript
// ── Synchronous storage (MemoryStorage / LocalStorage) ──

todoStorage.has('todos')     // true
todoStorage.has('filter')    // true
todoStorage.has('unknown')   // false

// ── Asynchronous storage (IndexedDBStorage) ──

await todoStorage.has('todos')     // true
await todoStorage.has('unknown')   // false
```

## keys() — Get all keys

```typescript
// ── Synchronously ──
const allKeys = todoStorage.keys()
// ['todos', 'filter']

// ── Asynchronously ──
const allKeys = await todoStorage.keys()
```

## remove(key) — Remove a specific key

```typescript
// Removes a key from the storage.
// After removal has(key) returns false, and keys() does not contain that key.

// ── Synchronously ──
todoStorage.remove('filter')
todoStorage.has('filter')   // false
todoStorage.keys()          // ['todos']

// ── Asynchronously ──
await todoStorage.remove('filter')
```

## clear() — Clear the storage

```typescript
// Removes ALL keys. The state becomes an empty object {}.

// ── Synchronously ──
todoStorage.clear()
todoStorage.getState()   // {}
todoStorage.keys()       // []

// ── Asynchronously ──
await todoStorage.clear()
```

## reset() — Reset to initialState

```typescript
// Returns the state to its initial value (initialState from the config).

// ── Synchronously ──
todoStorage.reset()
todoStorage.getState()   // { todos: [...], filter: 'all' }

// ── Asynchronously ──
await todoStorage.reset()
```

## clear() vs reset() — What's the difference

```typescript
const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
})

todoStorage.set('filter', 'completed')

// clear() — a full wipe
todoStorage.clear()
todoStorage.getState()   // {}
todoStorage.keys()       // []

// reset() — back to initialState
todoStorage.reset()
todoStorage.getState()   // { todos: [], filter: 'all' }
todoStorage.keys()       // ['todos', 'filter']
```
