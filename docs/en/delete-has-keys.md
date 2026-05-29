# remove / has / keys / clear / reset

> [Back to Main](../../README.md)

Operations for checking existence, deleting keys, and resetting storage. Work identically for all storage types.

## has(key) — Check if a Key Exists

```typescript
// ── Sync Storage (MemoryStorage / LocalStorage) ──

storage.has('name')      // true
storage.has('age')       // true
storage.has('unknown')   // false

// ── Async Storage (IndexedDBStorage) ──

await storage.has('name')      // true
await storage.has('unknown')   // false
```

## keys() — Get All Keys

```typescript
// ── Sync ──
const allKeys = storage.keys()
// ['name', 'age', 'role', 'active']

// ── Async ──
const allKeys = await storage.keys()
```

## remove(key) — Delete a Specific Key

```typescript
// Removes a key from the storage.
// After removal, has(key) returns false, keys() won't contain this key.

// ── Sync ──
storage.remove('role')
storage.has('role')   // false
storage.keys()        // ['name', 'age', 'active']

// ── Async ──
await storage.remove('role')
```

## clear() — Clear the Storage

```typescript
// Removes ALL keys. State becomes an empty object {}.

// ── Sync ──
storage.clear()
storage.getState()   // {}
storage.keys()       // []

// ── Async ──
await storage.clear()
```

## reset() — Reset to initialState

```typescript
// Returns state to its initial value (initialState from config).

// ── Sync ──
storage.reset()
storage.getState()   // { name: 'Alice', age: 28, role: 'admin', active: true }

// ── Async ──
await storage.reset()
```

## clear() vs reset() — The Difference

```typescript
const storage = new MemoryStorage({
  name: 'example',
  initialState: { count: 0, label: 'hello' },
})

storage.set('count', 99)
storage.set('label', 'world')

// clear() — full cleanup
storage.clear()
storage.getState()   // {}
storage.keys()       // []

// reset() — return to initialState
storage.reset()
storage.getState()   // { count: 0, label: 'hello' }
storage.keys()       // ['count', 'label']
```
