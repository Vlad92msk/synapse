<!-- source: docs/en/writing-data.md · canonical: https://synapse-homepage.web.app/docs/writing-data · part of https://synapse-homepage.web.app/llms-full.txt -->

# Writing data (set / update)


All the ways to **write** data to a storage. The two main methods differ in scope:

| Method | What it does | Subscriber notifications | When to use |
|---|---|---|---|
| `set(key, value)` | replaces **one field** entirely | one per call | change/replace a single field precisely |
| `update(updater)` | Immer-like mutation of **several fields** atomically | **one** for the whole callback | change several fields / precisely edit a nested one |
| `reset()` | reverts to `initialState` | one | roll the store back to its original state |

The examples use the end-to-end `todoStorage` from the [MemoryStorage](./memory-storage.md) section
(`TodoState = { todos: Todo[]; filter: Filter }`). For Memory and LocalStorage writes are synchronous,
for IndexedDB they need `await`.

## set(key, value) — replace one field

**When:** you need to set/replace the value of a single top-level key. **When not:** you change several
fields at once (then `update` is one notification instead of several) or you edit a deeply nested element
(in `update` that's done by mutation without manual copying).

```typescript
// ── Synchronous storage (MemoryStorage / LocalStorage) ──

todoStorage.set('filter', 'completed')
todoStorage.set('todos', [{ id: 't1', title: 'New', done: false }])

// ── Asynchronous storage (IndexedDBStorage) ──

await todoStorage.set('filter', 'completed')
```

`set` is a **full replacement** of the value at a key: the old value is discarded entirely.

## update(updater) — change several fields at once

`update()` uses Immer-style mutations: inside the callback you can change the state directly (`push`,
assignment, editing nested objects) — the library assembles the immutable result itself. All changes are
applied **atomically — one notification to subscribers** for the whole callback.

**When:** change several fields at once or precisely edit a nested element. **When not:** you change
exactly one field entirely — `set` is shorter.

```typescript
// ── Synchronous storage ──

todoStorage.update((state) => {
  state.todos.push({ id: 't2', title: 'Buy milk', done: false })
  state.filter = 'active'
})

// A targeted change of a nested element — without manually copying the array:
todoStorage.update((state) => {
  const target = state.todos.find((t) => t.id === 't2')
  if (target) target.done = true
})

// ── Asynchronous storage ──

await todoStorage.update((state) => {
  state.filter = 'completed'
})
```

## set() vs update() — which to choose

The main practical criterion is the **number of subscriber notifications**. Several `set` calls in a row
= several re-renders/subscription triggers; a single `update` = one.

```typescript
// set() — a full replacement of one field.
todoStorage.set('filter', 'active')
todoStorage.set('todos', [])

// update() — several fields atomically, one notification.
todoStorage.update((s) => {
  s.todos.push({ id: 't3', title: 'Task', done: false })
  s.filter = 'all'
})

// Two set() = two notifications:
todoStorage.set('filter', 'active')   // notification 1
todoStorage.set('todos', [])          // notification 2

// The same result via update() = one notification:
todoStorage.update((s) => {
  s.filter = 'active'                  // }
  s.todos = []                         // } one combined notification
})
```

## reset() — reset to initialState

Reverts the storage to `initialState` from the config. Unlike `clear()` (which fully clears the state
down to `{}`) — it restores the original fields. More on the difference — in
[remove / has / keys / clear / reset](./delete-has-keys.md).

```typescript
// Synchronously
todoStorage.reset()

// Asynchronously
await todoStorage.reset()
```

## See also

- [Reading data](./reading-data.md) — read what you wrote.
- [remove / has / keys / clear / reset](./delete-has-keys.md) — removing keys, `clear` vs `reset`.
- [Subscriptions](./subscriptions.md) — how writes reach subscribers.
