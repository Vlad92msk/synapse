# Singleton Pattern

> [Back to Main](../../README.md)

Reusing storage instances by name. Useful for shared state and when a storage is created in several places (React components, modules).

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

storage2.get('count')     // 42 (the same instance!)
storage1 === storage2     // true

// Works with MemoryStorage, LocalStorage, IndexedDB
// Default singleton key: `${storageType}_${name}` (memory_my-store)
```

## Merge strategies (mergeStrategy)

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
// The first initialState wins, subsequent ones are ignored

// DEEP_MERGE
// Recursive merge of initialState:
// s1: { theme: 'dark', lang: 'en' }
// s2: { theme: 'light', extra: true }
// → { theme: 'dark', lang: 'en', extra: true }

// OVERRIDE
// The last configuration overrides (except name)

// WARN_AND_USE_FIRST
// Like FIRST_WINS, but with a console.warn on conflicts

// STRICT
// Throws an Error if initialState differs
```

## Custom key (singleton.key)

```typescript
// Default key: `${storageType}_${name}`
// Two storages with the same name but a different key — different instances

const cache = new MemoryStorage<{ data: string }>({
  name: 'user-data',
  singleton: { enabled: true, key: 'user-cache' },
  initialState: { data: 'cached' },
})

const settings = new MemoryStorage<{ data: string }>({
  name: 'user-data',  // the same name!
  singleton: { enabled: true, key: 'user-settings' },  // a different key
  initialState: { data: 'settings' },
})

cache === settings  // false (different keys → different instances)
```

## Singleton in React

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// Two components create a storage with the same name — a single instance

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
  // message here = the same as in ComponentA
  return <div>{message}</div>
}
```

## Full SingletonOptions configuration

```typescript
interface SingletonOptions {
  enabled: boolean                // enable singleton
  mergeStrategy?: ConfigMergeStrategy  // merge strategy (default: FIRST_WINS)
  warnOnConflict?: boolean        // console warning (default: true)
  key?: string                    // custom key (default: `${type}_${name}`)
}

// The ConfigMergeStrategy enum:
enum ConfigMergeStrategy {
  STRICT = 'strict',
  FIRST_WINS = 'first_wins',
  DEEP_MERGE = 'deep_merge',
  OVERRIDE = 'override',
  WARN_AND_USE_FIRST = 'warn_and_use_first',
}
```
