<!-- source: docs/en/singleton.md · canonical: https://synapse-homepage.web.app/docs/singleton · part of https://synapse-homepage.web.app/llms-full.txt -->

# Singleton Pattern


`singleton` is a storage config field (`BaseStorageConfig.singleton`). With `enabled: true`, two
`new MemoryStorage({ name: 'x', singleton: { enabled: true } })` with the **same key** return the **same
instance** — the second constructor doesn't create a new storage, it hands back the existing one.

The examples use the end-to-end domain `TodoState = { todos: Todo[]; filter: Filter }` (see the
[MemoryStorage](./memory-storage.md) section).

## Why

A storage is often created in several places: different React components, different modules, hot-reload in
dev. Without a singleton, each `new` is a separate store with its own state, and they drift apart. A
singleton gives a **shared instance by name/key**: no matter who "creates" the store, everyone works with
the same data and the same subscriptions — with no manual passing of a reference through props/context.

## When to use

- One logical storage is **instantiated from several points** (components, modules) and should be shared.
- You need to survive **hot-reload** in dev without spawning copies of the store.
- Different parts of the app want the same state, but passing a reference around is inconvenient.

## When it's NOT needed

- The store is created **in one place** and imported from there — then it's already a de-facto singleton,
  the field isn't needed.
- You need **isolated** instances of the same type (e.g. a store per entity/tab) — there a singleton would,
  on the contrary, glue them together. If the name matches but the instances must differ — separate them
  via `key` (see below).
- Inside a `createSynapse` module: the handle itself is already a lazy singleton, duplicating it at the
  storage level is usually pointless.

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

## Options

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | — | Enable the singleton. Without it the field has no effect. |
| `mergeStrategy?` | `ConfigMergeStrategy` | `FIRST_WINS` | How to merge the configs of the first and subsequent instances (see above). |
| `warnOnConflict?` | `boolean` | `true` | `console.warn` when the configs of instances diverge. |
| `key?` | `string` | `` `${type}_${name}` `` | Custom registry key. Different keys → different instances (even with the same `name`). |

## See also

- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) · [IndexedDB](./indexeddb-storage.md) — where the `singleton` field lives.
- [createSynapse (basic)](./create-synapse-basic.md) — a module's handle is itself a lazy singleton.
