# Writing data (set/update)

> [Back to Main](../../README.md)

All the ways to write data to a storage. The examples use the end-to-end `todoStorage` from the
[MemoryStorage](./memory-storage.md) section (`TodoState = { todos: Todo[]; filter: Filter }`). For
Memory and LocalStorage writes are synchronous, for IndexedDB they need `await`.

## set(key, value) — Set a value by key

```typescript
// ── Synchronous storage (MemoryStorage / LocalStorage) ──

todoStorage.set('filter', 'completed')
todoStorage.set('todos', [{ id: 't1', title: 'New', done: false }])

// ── Asynchronous storage (IndexedDBStorage) ──

await todoStorage.set('filter', 'completed')
```

## update(updater) — Change several fields at once

`update()` uses immer-style mutations. You can mutate the state directly inside the callback. All changes are applied atomically — a single notification to subscribers.

```typescript
// ── Synchronous storage ──

todoStorage.update((state) => {
  state.todos.push({ id: 't2', title: 'Buy milk', done: false })
  state.filter = 'active'
})

// Convenient for a targeted change of a nested element:
todoStorage.update((state) => {
  const target = state.todos.find((t) => t.id === 't2')
  if (target) target.done = true
})

// ── Asynchronous storage ──

await todoStorage.update((state) => {
  state.filter = 'completed'
})
```

## set() vs update() — When to use which

```typescript
// set() — a full replacement of the value at a single key.
// Suitable for changing one field or fully replacing an array/object.
todoStorage.set('filter', 'active')
todoStorage.set('todos', [])

// update() — mutating several fields at once.
// Suitable for an atomic change of multiple fields.
// A single notification to subscribers instead of several.
todoStorage.update((s) => {
  s.todos.push({ id: 't3', title: 'Task', done: false })
  s.filter = 'all'
})

// With set() each call = a separate notification:
todoStorage.set('filter', 'active')   // notification 1
todoStorage.set('todos', [])          // notification 2

// With update() — a single notification:
todoStorage.update((s) => {
  s.filter = 'active'                  // notification 1 (combined)
  s.todos = []
})
```

## reset() — Reset to initialState

```typescript
// Returns the storage to its initial state (initialState from the config).

// Synchronously
todoStorage.reset()

// Asynchronously
await todoStorage.reset()
```
