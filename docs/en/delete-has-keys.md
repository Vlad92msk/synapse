# remove / has / keys / clear / reset

> [Back to Main](../../README.md)

Operations for checking existence, removing keys, and resetting the storage. They work the same way for all storage types.

## has(key) — Check whether a key exists

```typescript
// ── Synchronous storage (MemoryStorage / LocalStorage) ──

storage.has('name')      // true
storage.has('age')       // true
storage.has('unknown')   // false

// ── Asynchronous storage (IndexedDBStorage) ──

await storage.has('name')      // true
await storage.has('unknown')   // false
```

## keys() — Get all keys

```typescript
// ── Synchronously ──
const allKeys = storage.keys()
// ['name', 'age', 'role', 'active']

// ── Asynchronously ──
const allKeys = await storage.keys()
```

## remove(key) — Remove a specific key

```typescript
// Removes a key from the storage.
// After removal has(key) returns false, and keys() does not contain that key.

// ── Synchronously ──
storage.remove('role')
storage.has('role')   // false
storage.keys()        // ['name', 'age', 'active']

// ── Asynchronously ──
await storage.remove('role')
```

## clear() — Clear the storage

```typescript
// Removes ALL keys. The state becomes an empty object {}.

// ── Synchronously ──
storage.clear()
storage.getState()   // {}
storage.keys()       // []

// ── Asynchronously ──
await storage.clear()
```

## reset() — Reset to initialState

```typescript
// Returns the state to its initial value (initialState from the config).

// ── Synchronously ──
storage.reset()
storage.getState()   // { name: 'Alice', age: 28, role: 'admin', active: true }

// ── Asynchronously ──
await storage.reset()
```

## clear() vs reset() — What's the difference

```typescript
const storage = new MemoryStorage({
  name: 'example',
  initialState: { count: 0, label: 'hello' },
})

storage.set('count', 99)
storage.set('label', 'world')

// clear() — a full wipe
storage.clear()
storage.getState()   // {}
storage.keys()       // []

// reset() — back to initialState
storage.reset()
storage.getState()   // { count: 0, label: 'hello' }
storage.keys()       // ['count', 'label']
```
