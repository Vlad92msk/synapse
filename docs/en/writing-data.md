# Writing Data (set/update)

> [Back to Main](../../README.md)

All ways to write data to storage. Work identically for Memory and LocalStorage (sync), for IndexedDB — with `await`.

## set(key, value) — Set a Value by Key

```typescript
// ── Sync Storage (MemoryStorage / LocalStorage) ──

storage.set('name', 'Bob')
storage.set('age', 30)
storage.set('tags', ['admin', 'editor'])
storage.set('settings', { theme: 'dark', notifications: false })

// ── Async Storage (IndexedDBStorage) ──

await storage.set('name', 'Bob')
await storage.set('age', 30)
```

## update(updater) — Change Multiple Fields at Once

`update()` uses immer-like mutations. You can mutate state directly inside the callback. All changes are applied atomically — one notification to subscribers.

```typescript
// ── Sync Storage ──

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

// ── Async Storage ──

await storage.update((state) => {
  state.name = 'Charlie'
  state.age += 5
})
```

## set() vs update() — When to Use What

```typescript
// set() — replace a value entirely by a single key.
// Good for changing one field or replacing an object entirely.
storage.set('name', 'Bob')
storage.set('settings', { theme: 'dark', notifications: false })

// update() — mutate multiple fields at once.
// Good for changing several fields atomically.
// One notification to subscribers instead of multiple.
storage.update((s) => {
  s.name = 'Bob'
  s.age = 30
  s.settings.theme = 'dark'
})

// With set(), each call = separate notification:
storage.set('name', 'Bob')     // notification 1
storage.set('age', 30)         // notification 2

// With update() — one notification:
storage.update((s) => {
  s.name = 'Bob'               // notification 1 (combined)
  s.age = 30
})
```

## reset() — Reset to initialState

```typescript
// Returns the storage to its initial state (initialState from config).

// Sync
storage.reset()

// Async
await storage.reset()
```
