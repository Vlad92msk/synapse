# createSynapse (basic)

> [Back to Main](../../README.md)

Minimal configuration: storage + selectors, without a dispatcher. Changes go through the storage directly.

## Creating

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { useSelector } from 'synapse-storage/react'

interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>
  filter: 'all' | 'active' | 'done'
}

// Selectors — class fields, real SelectorAPI right away (eager). Name = field name.
class TodoSelectors extends Selectors<TodoState> {
  readonly todos = this.select((state) => state.todos)
  readonly filter = this.select((state) => state.filter)

  // Combined: depends on todos and filter
  readonly filteredTodos = this.combine([this.todos, this.filter], (todos, filter) => {
    if (filter === 'active') return todos.filter((t) => !t.done)
    if (filter === 'done') return todos.filter((t) => t.done)
    return todos
  })

  readonly doneCount = this.combine([this.todos], (todos) => todos.filter((t) => t.done).length)
}

// createSynapse(factory) → a lazy handle. The factory runs once
// on the first await / ready(), not on import.
const todoSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<TodoState>({
    name: 'todo-basic',
    initialState: { todos: [], filter: 'all' },
  })
  return {
    storage,
    selectors: new TodoSelectors(storage),
  }
})

export type TodoSynapse = Awaited<typeof todoSynapse>
```

## Return value

```typescript
// The handle is a thenable: await triggers the factory and returns the assembled module
const store = await todoSynapse

// The result (basic — without a dispatcher):
store.storage    // IStorage<TodoState> — the storage
store.selectors  // a TodoSelectors instance — fields = SelectorAPI

// The handle itself:
todoSynapse.ready()    // Promise<store> — the same as await
todoSynapse.isReady()  // boolean
todoSynapse.destroy()  // () => Promise<void> — cleanup + memoization reset (the handle is re-creatable)
```

## Usage in React

```typescript
// useSelector — subscribes to a selector (automatically updates the component)
const todos = useSelector(store.selectors.todos)
const filteredTodos = useSelector(store.selectors.filteredTodos)
const doneCount = useSelector(store.selectors.doneCount)

// Changing the state — through the storage directly
store.storage.set('filter', 'active')

store.storage.update((s) => {
  s.todos.push({ id: Date.now(), text: 'New', done: false })
})
```

## Async initialization in the factory

The factory is an ordinary `async` function, so any prologue (a request, API-client init) is done right in it,
before the module is assembled:

```typescript
const todoSynapse = createSynapse(async () => {
  const data = await fetch('/api/todos').then((r) => r.json())
  const storage = new MemoryStorage<TodoState>({
    name: 'todo-async',
    initialState: { todos: data, filter: 'all' },
  })
  return {
    storage,
    selectors: new TodoSelectors(storage),
  }
})
```
