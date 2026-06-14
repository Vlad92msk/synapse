# createSynapse (базовый)

> [Назад к оглавлению](./README.md)

Минимальная конфигурация: хранилище + селекторы, без диспетчера. Изменения через хранилище напрямую.

## Создание

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { useSelector } from 'synapse-storage/react'

interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>
  filter: 'all' | 'active' | 'done'
}

// Селекторы — поля класса, настоящие SelectorAPI сразу (eager). Имя = имя поля.
class TodoSelectors extends Selectors<TodoState> {
  readonly todos = this.select((state) => state.todos)
  readonly filter = this.select((state) => state.filter)

  // Комбинированный: зависит от todos и filter
  readonly filteredTodos = this.combine([this.todos, this.filter], (todos, filter) => {
    if (filter === 'active') return todos.filter((t) => !t.done)
    if (filter === 'done') return todos.filter((t) => t.done)
    return todos
  })

  readonly doneCount = this.combine([this.todos], (todos) => todos.filter((t) => t.done).length)
}

// createSynapse(factory) → ленивый handle. Фабрика исполняется один раз
// при первом await / ready(), а не на импорте.
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

## Возвращаемое значение

```typescript
// Handle — thenable: await дёргает фабрику и возвращает собранный модуль
const store = await todoSynapse

// Результат (базовый — без диспетчера):
store.storage    // IStorage<TodoState> — хранилище
store.selectors  // экземпляр TodoSelectors — поля = SelectorAPI

// Сам handle:
todoSynapse.ready()    // Promise<store> — то же, что await
todoSynapse.isReady()  // boolean
todoSynapse.destroy()  // () => Promise<void> — очистка + сброс мемоизации (handle пересоздаваем)
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

## Async-инициализация в фабрике

Фабрика — обычная `async`-функция, поэтому любой пролог (запрос, init API-клиента) делается прямо в ней,
до сборки модуля:

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
