# Singleton Pattern

> [Back to Main](../../README.md)

Reusing storage instances by name. Useful for shared state and when a storage is created in several places (React components, modules).

The examples use the end-to-end domain `TodoState = { todos: Todo[]; filter: Filter }` (see the
[MemoryStorage](./memory-storage.md) section).

## Enabling Singleton

```typescript
import { MemoryStorage } from 'synapse-storage/core'

// First instance — creates the storage
const storage1 = new MemoryStorage<TodoState>({
  name: 'my-todo',
  singleton: { enabled: true },
  initialState: { todos: [], filter: 'completed' },
})
await storage1.initialize()

// Second instance with the SAME name — gets the same object
const storage2 = new MemoryStorage<TodoState>({
  name: 'my-todo',
  singleton: { enabled: true },
  initialState: { todos: [], filter: 'all' },  // ignored (FIRST_WINS by default)
})
await storage2.initialize()

storage2.get('filter')    // 'completed' (the same instance!)
storage1 === storage2     // true

// Works with MemoryStorage, LocalStorage, IndexedDB
// Default singleton key: `${storageType}_${name}` (memory_my-todo)
```

## Merge strategies (mergeStrategy)

```typescript
import { MemoryStorage, ConfigMergeStrategy } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'my-todo',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.FIRST_WINS,  // default
  },
  initialState: { todos: [], filter: 'all' },
})

// All strategies:

// FIRST_WINS (default)
// The first initialState wins, subsequent ones are ignored

// DEEP_MERGE
// Recursive merge of initialState:
// s1: { todos: [], filter: 'all' }
// s2: { filter: 'active' }
// → { todos: [], filter: 'all' }   (the first one's fields take priority)

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

const active = new MemoryStorage<TodoState>({
  name: 'todo-board',
  singleton: { enabled: true, key: 'board-active' },
  initialState: { todos: [], filter: 'active' },
})

const archive = new MemoryStorage<TodoState>({
  name: 'todo-board',  // the same name!
  singleton: { enabled: true, key: 'board-archive' },  // a different key
  initialState: { todos: [], filter: 'completed' },
})

active === archive  // false (different keys → different instances)
```

## Singleton in React

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// Two components create a storage with the same name — a single instance

const sharedStorage = new MemoryStorage<TodoState>({
  name: 'shared-todo',
  singleton: { enabled: true },
  initialState: { todos: [], filter: 'all' },
})
sharedStorage.initialize()

function ComponentA() {
  const count = useStorageSubscribe(sharedStorage, (s) => s.todos.length)
  return <div>tasks: {count} <button onClick={() => sharedStorage.update((s) => { s.todos.push(createTodo('From A')) })}>Add</button></div>
}

function ComponentB() {
  // Creates a "new" storage — but gets the same singleton
  const sameStorage = new MemoryStorage<TodoState>({
    name: 'shared-todo',
    singleton: { enabled: true },
    initialState: { todos: [], filter: 'all' },
  })
  const count = useStorageSubscribe(sameStorage, (s) => s.todos.length)
  // count here = the same as in ComponentA
  return <div>tasks: {count}</div>
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
