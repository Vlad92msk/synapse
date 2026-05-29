# createSynapse (базовый)

> [Назад к оглавлению](./README.md)

Минимальная конфигурация: хранилище + селекторы, без диспетчера. Изменения через хранилище напрямую.

## Создание

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { useSelector } from 'synapse-storage/react'

interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>
  filter: 'all' | 'active' | 'done'
}

const synapsePromise = createSynapse({
  // Передаём готовое хранилище (или createStorageFn для асинхронного создания)
  storage: new MemoryStorage<TodoState>({
    name: 'todo-basic',
    initialState: { todos: [], filter: 'all' },
  }),

  // Селекторы — производные значения из состояния
  createSelectorsFn: (selectorModule) => {
    const todos = selectorModule.createSelector((state) => state.todos)
    const filter = selectorModule.createSelector((state) => state.filter)

    // Комбинированный: зависит от todos и filter
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

## Возвращаемое значение

```typescript
// createSynapse возвращает Promise
const store = await synapsePromise

// Результат (базовый — без диспетчера):
store.storage    // IStorage<TodoState> — хранилище
store.selectors  // { todos, filter, filteredTodos } — объекты SelectorAPI
store.destroy()  // () => Promise<void> — очистка
```

## Использование в React

```typescript
// useSelector — подписка на селектор (автоматически обновляет компонент)
const todos = useSelector(store.selectors.todos)
const filteredTodos = useSelector(store.selectors.filteredTodos)
const doneCount = useSelector(store.selectors.doneCount)

// Изменение состояния — через хранилище напрямую
store.storage.set('filter', 'active')

store.storage.update((s) => {
  s.todos.push({ id: Date.now(), text: 'New', done: false })
})
```

## Альтернатива: createStorageFn

Вместо `storage` можно передать `createStorageFn` для асинхронного создания (например, загрузка данных):

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
