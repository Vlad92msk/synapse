# createSynapse (basic)

> [Back to Main](../../README.md)

Minimal configuration: storage + selectors, without dispatcher. Changes via storage directly.

## Creating

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { useSelector } from 'synapse-storage/react'

interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>
  filter: 'all' | 'active' | 'done'
}

const synapsePromise = createSynapse({
  // Pass a ready storage (or createStorageFn for async creation)
  storage: new MemoryStorage<TodoState>({
    name: 'todo-basic',
    initialState: { todos: [], filter: 'all' },
  }),

  // Selectors — derived values from state
  createSelectorsFn: (selectorModule) => {
    const todos = selectorModule.createSelector((state) => state.todos)
    const filter = selectorModule.createSelector((state) => state.filter)

    // Combined: depends on todos and filter
    const filteredTodos = selectorModule.createSelector(
      [todos, filter],
      (todosVal, filterVal) => {
        if (filterVal === 'active') return todosVal.filter((t) => !t.done)
        if (filterVal === 'done') return todosVal.filter((t) => t.done)
        return todosVal
      },
    )

    return { todos, filter, filteredTodos }
  },
})
```

## Return Value

```typescript
// createSynapse returns a Promise
const store = await synapsePromise

// Result (basic — without dispatcher):
store.storage    // IStorage<TodoState> — storage
store.selectors  // { todos, filter, filteredTodos } — SelectorAPI objects
store.destroy()  // () => Promise<void> — cleanup
```

## Usage in React

```typescript
// useSelector — subscribe to a selector (auto-updates component)
const todos = useSelector(store.selectors.todos)
const filteredTodos = useSelector(store.selectors.filteredTodos)
const doneCount = useSelector(store.selectors.doneCount)

// Change state — via storage directly
store.storage.set('filter', 'active')

store.storage.update((s) => {
  s.todos.push({ id: Date.now(), text: 'New', done: false })
})
```

## Alternative: createStorageFn

Instead of `storage`, you can pass `createStorageFn` for async creation (e.g., loading data):

```typescript
const synapsePromise = createSynapse({
  createStorageFn: async () => {
    const data = await fetch('/api/todos').then((r) => r.json())
    const storage = new MemoryStorage<TodoState>({
      name: 'todo-async',
      initialState: { todos: data, filter: 'all' },
    })
    storage.initialize()
    return storage
  },
  createSelectorsFn: (sm) => ({ ... }),
})
```
