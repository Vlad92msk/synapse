# MemoryStorage

> [Back to Main](../../README.md)

In-memory storage. Data lives only while the page is open. Synchronous API.

Every example in the State Manager section is built on a single end-to-end domain — a todo-list.
It is the canonical store that is reused later in the "Working with data" and "Patterns" sections.

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
    { id: 't1', title: 'Изучить Synapse', done: true },
    { id: 't2', title: 'Собрать todo-приложение', done: false },
  ],
  filter: 'all',
}
```

## Creating

```typescript
import { MemoryStorage } from 'synapse-storage/core'

// Via new
export const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: initialTodoState,
})

// Or via the static .create() — a full equivalent
const todoStorage = MemoryStorage.create<TodoState>({
  name: 'todo',
  initialState: initialTodoState,
})

// Initialization is required before use
await todoStorage.initialize()
```

## When to use

- Ephemeral UI state: filters, forms, modal state, selected items.
- State that must not survive a page reload.
- The default baseline choice — when persistence isn't needed.

## When not to use

- You need to keep data across reloads → [LocalStorage](./local-storage.md) or
  [IndexedDB](./indexeddb-storage.md).
- Large amounts of data or binary data → [IndexedDB](./indexeddb-storage.md).

## Working with data

Reading, writing, subscriptions, and selectors are the same for all synchronous storages and are
covered in the "Working with data" section:

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
