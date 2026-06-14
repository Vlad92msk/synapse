# Writing data (set/update)

> [Back to Main](../../README.md)

All the ways to write data to a storage. They work the same way for Memory and LocalStorage (synchronously), and for IndexedDB — with `await`.

## set(key, value) — Set a value by key

```typescript
// ── Synchronous storage (MemoryStorage / LocalStorage) ──

storage.set('name', 'Bob')
storage.set('age', 30)
storage.set('tags', ['admin', 'editor'])
storage.set('settings', { theme: 'dark', notifications: false })

// ── Asynchronous storage (IndexedDBStorage) ──

await storage.set('name', 'Bob')
await storage.set('age', 30)
```

## update(updater) — Change several fields at once

`update()` uses immer-style mutations. You can mutate the state directly inside the callback. All changes are applied atomically — a single notification to subscribers.

```typescript
// ── Synchronous storage ──

storage.update((state) => {
  state.name = 'Charlie'
  state.age += 5
  state.tags.push('moderator')
  state.settings.theme = 'dark'
})

// Convenient for nested objects:
storage.update((state) => {
  state.settings.notifications = false
})

// ── Asynchronous storage ──

await storage.update((state) => {
  state.name = 'Charlie'
  state.age += 5
})
```

## set() vs update() — When to use which

```typescript
// set() — a full replacement of the value at a single key.
// Suitable for changing one field or fully replacing an object.
storage.set('name', 'Bob')
storage.set('settings', { theme: 'dark', notifications: false })

// update() — mutating several fields at once.
// Suitable for an atomic change of multiple fields.
// A single notification to subscribers instead of several.
storage.update((s) => {
  s.name = 'Bob'
  s.age = 30
  s.settings.theme = 'dark'
})

// With set() each call = a separate notification:
storage.set('name', 'Bob')     // notification 1
storage.set('age', 30)         // notification 2

// With update() — a single notification:
storage.update((s) => {
  s.name = 'Bob'               // notification 1 (combined)
  s.age = 30
})
```

## reset() — Reset to initialState

```typescript
// Returns the storage to its initial state (initialState from the config).

// Synchronously
storage.reset()

// Asynchronously
await storage.reset()
```
