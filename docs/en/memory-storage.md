# MemoryStorage

> [Back to contents](./README.md) · [Working example on GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/MemoryStorageExample.tsx)

**TL;DR:** in-memory storage with a synchronous API. Data lives while the page is open; after a reload — a clean `initialState`. The default baseline choice.

## Why

The simplest store with no persistence: state is kept in memory, all reads/writes are synchronous (no `await`). It also works on the server — an "empty" store is raised synchronously from `initialState`, so SSR/SSG doesn't break.

Every example in the State Manager section is built on a single end-to-end domain — a todo-list. It is the canonical store that is reused later in the "Working with data" and "Patterns" sections.

## When to use

- Ephemeral UI state: filters, forms, modal state, selected items.
- State that **must not** survive a page reload.
- The default baseline choice — when persistence isn't needed.

## When not to use

- Data must survive a reload → [LocalStorage](./local-storage.md) (small things) or [IndexedDB](./indexeddb-storage.md) (large volumes).
- Large/binary data → [IndexedDB](./indexeddb-storage.md).
- You need cross-tab sync on top of persistence → see [browserStorage](./browser-storage.md) + `syncBroadcastMiddleware`.

## How it differs from the neighboring storages

| | API | Server | After a reload |
|---|---|---|---|
| **MemoryStorage** | sync | works (empty from `initialState`) | data is lost |
| [LocalStorage](./local-storage.md) | sync | breaks without `localStorage` (needs [browserStorage](./browser-storage.md)) | preserved (~5 MB) |
| [IndexedDB](./indexeddb-storage.md) | **async** | no sync construction | preserved (large volumes) |

## Domain

```typescript
export interface Todo {
  id: string
  title: string
  done: boolean
}

export type Filter = 'all' | 'active' | 'completed'

export interface TodoState {
  todos: Todo[]
  filter: Filter
}

export const initialTodoState: TodoState = {
  todos: [
    { id: 't1', title: 'Learn Synapse', done: true },
    { id: 't2', title: 'Build a todo app', done: false },
  ],
  filter: 'all',
}
```

## Usage

Copy-paste minimal form:

```typescript
import { MemoryStorage } from 'synapse-storage/core'

// Via new
export const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: initialTodoState,
})

// Or via the static .create() — a full equivalent of new
const todoStorage = MemoryStorage.create<TodoState>({
  name: 'todo',
  initialState: initialTodoState,
})

// Initialization is required before use
await todoStorage.initialize()
```

## All parameters (commented)

`MemoryStorage` accepts `SyncStorageConfig<T>`. `TState` is inferred from `initialState` — the explicit generic is only needed if you want to pin the type down.

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  // name — required. The store identifier (in logs, the singleton key, events).
  name: 'todo',

  // initialState — the initial state. TState is inferred from it and an "empty" store is built
  //   on the server. For memory it is used as is on every start.
  initialState: initialTodoState,

  // version / migrate — IGNORED for memory (nothing to persist). Relevant for
  //   LocalStorage/IndexedDB — see Persist migrations.

  // clearOnDestroy? — whether to clear the data on destroy(). For memory it defaults to true
  //   (an ephemeral storage). Usually no need to change.
  clearOnDestroy: true,

  // middlewares? — the sync-middleware pipeline. The getDefault argument gives the built-ins:
  //   batching / shallowCompare / logger. You can also add your own (e.g. syncBroadcastMiddleware).
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),           // don't notify subscribers if the value hasn't changed
    getDefault().logger({ collapsed: true }), // dev logger for write actions
  ],

  // singleton? — return ONE instance for the same name/key instead of a new store.
  singleton: {
    enabled: true,                    // enable singleton (defaults to false)
    // mergeStrategy — how to resolve a config conflict between instances with the same name
    //   (FIRST_WINS by default; STRICT / DEEP_MERGE / OVERRIDE).
    // warnOnConflict — warn in the console about config mismatches (defaults to true).
    // key — a custom identification key (defaults to `${type}_${name}`).
  },
})
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | **Required.** The store identifier. |
| `initialState?` | `T` | The initial state; `TState` is inferred from it. |
| `middlewares?` | `(getDefault) => SyncMiddleware[]` | The sync-middleware pipeline. |
| `singleton?` | `SingletonOptions` | One instance per `name`/`key`. |
| `clearOnDestroy?` | `boolean` | Clear data on `destroy()` (memory: `true`). |
| `version?` / `migrate?` | `number` / `MigrateFn` | Ignored for memory. |

## Working with data

Reading, writing, subscriptions, and selectors are the same for all synchronous storages and are covered in the "Working with data" section:

- [Reading data](./reading-data.md) — `get`, `getState`, `getStateSync`
- [Writing data](./writing-data.md) — `set`, `update`, `reset`
- [remove / has / keys / clear / reset](./delete-has-keys.md)
- [Subscriptions](./subscriptions.md) and [Selectors](./selector-system.md)

## Lifecycle

```typescript
await todoStorage.initialize()    // initialization
await todoStorage.waitForReady()  // waiting for readiness
todoStorage.initStatus            // { status: 'ready' }

// Subscribing to status changes
const unsub = todoStorage.onStatusChange((status) => {
  console.log(status) // { status: 'ready' | 'loading' | 'error' | 'idle' }
})

await todoStorage.destroy()       // destruction (for memory, clears the data)
```

## See also

- [LocalStorage](./local-storage.md) · [IndexedDB](./indexeddb-storage.md) — the persistent variants.
- [Static .create()](./static-create.md) · [StorageFactory](./storage-factory.md) — ways to create.
- [browserStorage](./browser-storage.md) — memory on the server, LocalStorage in the browser in one line.
