# LocalStorage

> [Back to Main](../../README.md)

Data is stored in the browser's `localStorage` and survives page reloads. Synchronous API,
fully identical to [MemoryStorage](./memory-storage.md).

The same end-to-end todo domain (`TodoState`, `initialTodoState` — see [MemoryStorage](./memory-storage.md)),
but now the tasks are persisted across reloads.

## Creating

```typescript
import { LocalStorage } from 'synapse-storage/core'

// Via new
const storage = new LocalStorage<TodoState>({
  name: 'todo-local', // the key in localStorage
  initialState: initialTodoState,
})

// Or via the static .create()
const storage = LocalStorage.create<TodoState>({
  name: 'todo-local',
  initialState: initialTodoState,
})

// initialize() loads saved data from localStorage, if any
await storage.initialize()
```

## When to use

- Small user settings and state that should survive a reload
  (theme, selected filter, draft).
- You want a synchronous API and simplicity — without async `await`.

## When not to use

- Large amounts of data, arrays of thousands of items, or binary data → localStorage is
  limited (~5 MB) and serializes everything into a string. Use [IndexedDB](./indexeddb-storage.md).
- Data must not survive the session → [MemoryStorage](./memory-storage.md).

## Working with data

The write/read/subscription API is identical to MemoryStorage — see the "Working with data" section
([Reading](./reading-data.md), [Writing](./writing-data.md), [Subscriptions](./subscriptions.md)).
The only difference is that data is automatically synchronized into localStorage; the key in
localStorage equals the `name` field.

## destroy() and clearOnDestroy

By default `destroy()` does **not** wipe the data in localStorage — the state survives storage
destruction (persistent IndexedDB behaves the same way). The behavior is controlled by the
`clearOnDestroy?: boolean` config flag (`SyncStorageConfig`): default `false` for
`localStorage` and `true` for `memory` (ephemeral). To make `destroy()` clear localStorage,
pass `{ clearOnDestroy: true }`.

## Persist migrations and SSR

Since the data is persistent, when the shape of `initialState` changes between releases you can
migrate it via `version` + `migrate` — see [Persist migrations](./persist-migration.md).
Server state can be seeded via [`hydrate(state)`](./ssr-hydration.md).
