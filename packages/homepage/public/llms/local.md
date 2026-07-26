<!-- source: docs/en/local-storage.md · canonical: https://synapse-homepage.web.app/docs/local · part of https://synapse-homepage.web.app/llms-full.txt -->

# LocalStorage


**TL;DR:** a synchronous storage on top of `localStorage`. Data survives reloads, the API is identical to [MemoryStorage](./memory-storage.md). For small settings that should be persisted.

## Why

Persistence without asynchrony: the state is automatically written to the browser's `localStorage` and picked up on the next load. The key in `localStorage` equals the `name` field. You can read/write synchronously, without `await`.

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)), but now the tasks are persisted across reloads.

## When to use

- Small user settings that should survive a reload: theme, selected filter, form draft.
- You want a synchronous API and simplicity — without async `await`.

## When NOT to use

- **Large volumes**, arrays of thousands of items, binary data → `localStorage` is limited (~5 MB) and serializes everything into a string. Take [IndexedDB](./indexeddb-storage.md).
- Data must **not** survive the session → [MemoryStorage](./memory-storage.md).
- The store is built **on the server** (SSR/SSG) → a plain `new LocalStorage()` will crash there (no `localStorage`). Wrap it in [browserStorage](./browser-storage.md): on the server it brings up `MemoryStorage`, in the browser — `LocalStorage`.

## How it differs from neighboring storages

| | API | Limit | Server |
|---|---|---|---|
| [MemoryStorage](./memory-storage.md) | sync | RAM | works, but data is not persisted |
| **LocalStorage** | sync | ~5 MB, strings only | **crashes** without `localStorage` → needs [browserStorage](./browser-storage.md) |
| [IndexedDB](./indexeddb-storage.md) | **async** | large/binary data | no sync construction |

## Usage

Copy-paste minimal form:

```typescript
import { LocalStorage } from 'synapse-storage/core'

// Via new
const storage = new LocalStorage<TodoState>({
  name: 'todo-local', // the key in localStorage
  initialState: initialTodoState,
})

// Or via the static .create() — equivalent to new
const storage = LocalStorage.create<TodoState>({
  name: 'todo-local',
  initialState: initialTodoState,
})

// initialize() loads saved data from localStorage, if any
await storage.initialize()
```

## All parameters (commented)

`LocalStorage` accepts the same `SyncStorageConfig<T>` as `MemoryStorage`, but here `version`/`migrate` actually work (the data is persistent).

```typescript
import { LocalStorage } from 'synapse-storage/core'

const storage = new LocalStorage<TodoState>({
  // name — required. Also serves as the KEY in localStorage.
  name: 'todo-local',

  // initialState — the default on first run (when localStorage is still empty).
  //   If data is already saved — initialize() picks it up instead of initialState.
  initialState: initialTodoState,

  // version? — the version of the persistent state schema. Set it when the shape of initialState
  //   changes between releases and localStorage may hold data of an older schema.
  version: 2,

  // migrate? — transforms saved state of an older version to the current schema.
  //   Called on initialize(), only if version is set and the saved version is lower.
  migrate: (persisted, fromVersion) =>
    fromVersion < 2 ? normalizeOld(persisted) : persisted,

  // clearOnDestroy? — whether to wipe the data in localStorage on destroy().
  //   For localStorage it defaults to FALSE (persistent: survives destroy, like IndexedDB).
  clearOnDestroy: false,

  // middlewares? — the sync middleware pipeline (getDefault provides batching/shallowCompare/logger).
  middlewares: (getDefault) => [getDefault().shallowCompare()],

  // singleton? — one instance per name/key (enabled/mergeStrategy/warnOnConflict/key).
  singleton: { enabled: true },
})
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | **Required.** Identifier + key in `localStorage`. |
| `initialState?` | `T` | The default on first run. |
| `version?` | `number` | Schema version for migrations. |
| `migrate?` | `MigrateFn<T>` | Transform an old schema to the current one. |
| `clearOnDestroy?` | `boolean` | Clear `localStorage` on `destroy()` (defaults to `false`). |
| `middlewares?` | `(getDefault) => SyncMiddleware[]` | The middleware pipeline. |
| `singleton?` | `SingletonOptions` | One instance per `name`/`key`. |

## destroy() and clearOnDestroy

By default `destroy()` does **not** wipe the data in localStorage — the state survives storage destruction (persistent IndexedDB behaves the same way). The behavior is controlled by the `clearOnDestroy?: boolean` config flag (`SyncStorageConfig`): default `false` for `localStorage` and `true` for `memory` (ephemeral). To make `destroy()` clear localStorage, pass `{ clearOnDestroy: true }`.

## Working with data

The write/read/subscription API is identical to MemoryStorage — see the "Working with data" section ([Reading](./reading-data.md), [Writing](./writing-data.md), [Subscriptions](./subscriptions.md)). The only difference is that data is automatically synchronized into localStorage; the key in localStorage equals the `name` field.

## Persist migrations and SSR

Since the data is persistent, when the shape of `initialState` changes between releases you can migrate it via `version` + `migrate` — see [Persist migrations](./persist-migration.md). Server state can be seeded via [`hydrate(state)`](./ssr-hydration.md), and the store can be safely built on the server via [browserStorage](./browser-storage.md).

## See also

- [MemoryStorage](./memory-storage.md) · [IndexedDB](./indexeddb-storage.md)
- [browserStorage](./browser-storage.md) — server-safe LocalStorage for SSR/SSG.
- [Persist migrations](./persist-migration.md) · [SSR hydration](./ssr-hydration.md)
