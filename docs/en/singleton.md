# Singleton Pattern

> [Back to Main](../../README.md)

Reuse storage instances by name. Useful for shared state and when storage is created in multiple places (React components, modules).

## Enabling Singleton

```typescript
import { MemoryStorage } from 'synapse-storage/core'

// First instance — creates the storage
const storage1 = new MemoryStorage<{ count: number }>({
  name: 'my-store',
  singleton: { enabled: true },
  initialState: { count: 0 },
})
await storage1.initialize()
storage1.set('count', 42)

// Second instance with the SAME name — gets the same object
const storage2 = new MemoryStorage<{ count: number }>({
  name: 'my-store',
  singleton: { enabled: true },
  initialState: { count: 999 },  // ignored (FIRST_WINS by default)
})
await storage2.initialize()

storage2.get('count')     // 42 (same instance!)
storage1 === storage2     // true

// Works with MemoryStorage, LocalStorage, IndexedDB
// Default singleton key: `${storageType}_${name}` (memory_my-store)
```

## Merge Strategies (mergeStrategy)

```typescript
import { MemoryStorage, ConfigMergeStrategy } from 'synapse-storage/core'

const storage = new MemoryStorage({
  name: 'my-store',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.FIRST_WINS,  // default
  },
  initialState: { ... },
})

// All strategies:

// FIRST_WINS (default)
// First initialState wins, subsequent ones are ignored

// DEEP_MERGE
// Recursively merges initialState:
// s1: { theme: 'dark', lang: 'en' }
// s2: { theme: 'light', extra: true }
// → { theme: 'dark', lang: 'en', extra: true }

// OVERRIDE
// Last configuration overwrites (except name)

// WARN_AND_USE_FIRST
// Like FIRST_WINS, but with console.warn on conflicts

// STRICT
// Throws Error if initialState differs
```

## Custom Key (singleton.key)

```typescript
// Default key: `${storageType}_${name}`
// Two storages with the same name but different key — different instances

const cache = new MemoryStorage<{ data: string }>({
  name: 'user-data',
  singleton: { enabled: true, key: 'user-cache' },
  initialState: { data: 'cached' },
})

const settings = new MemoryStorage<{ data: string }>({
  name: 'user-data',  // same name!
  singleton: { enabled: true, key: 'user-settings' },  // different key
  initialState: { data: 'settings' },
})

cache === settings  // false (different keys → different instances)
```

## Singleton in React

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// Two components create storage with the same name — one instance

const sharedStorage = new MemoryStorage<{ message: string; likes: number }>({
  name: 'shared-store',
  singleton: { enabled: true },
  initialState: { message: 'Hello!', likes: 0 },
})
sharedStorage.initialize()

function ComponentA() {
  const message = useStorageSubscribe(sharedStorage, (s) => s.message)
  return <div>{message} <button onClick={() => sharedStorage.set('message', 'Updated!')}>Update</button></div>
}

function ComponentB() {
  // Creates a "new" storage — but gets the same singleton
  const sameStorage = new MemoryStorage<{ message: string; likes: number }>({
    name: 'shared-store',
    singleton: { enabled: true },
    initialState: { message: 'different', likes: 0 },
  })
  const message = useStorageSubscribe(sameStorage, (s) => s.message)
  // message here = same as in ComponentA
  return <div>{message}</div>
}
```

## Full SingletonOptions Configuration

```typescript
interface SingletonOptions {
  enabled: boolean                // enable singleton
  mergeStrategy?: ConfigMergeStrategy  // merge strategy (default: FIRST_WINS)
  warnOnConflict?: boolean        // console warning (default: true)
  key?: string                    // custom key (default: `${type}_${name}`)
}

// ConfigMergeStrategy enum:
enum ConfigMergeStrategy {
  STRICT = 'strict',
  FIRST_WINS = 'first_wins',
  DEEP_MERGE = 'deep_merge',
  OVERRIDE = 'override',
  WARN_AND_USE_FIRST = 'warn_and_use_first',
}
```
