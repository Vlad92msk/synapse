import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { useSelector } from 'synapse-storage/react'
import type { SynapseStoreBasic } from 'synapse-storage/utils'
import type { IStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример: createSynapse() — базовый вариант (только storage + selectors, без dispatcher)
 */

interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>
  filter: 'all' | 'active' | 'done'
}

const initialState: TodoState = {
  todos: [
    { id: 1, text: 'Изучить Synapse', done: false },
    { id: 2, text: 'Написать примеры', done: true },
    { id: 3, text: 'Провести аудит API', done: false },
  ],
  filter: 'all',
}

// Создаём synapse с селекторами, но без dispatcher
const synapsePromise = createSynapse({
  storage: new MemoryStorage<TodoState>({ name: 'todo-basic', initialState }),
  createSelectorsFn: (selectorModule) => {
    const todos = selectorModule.createSelector((state) => state.todos)
    const filter = selectorModule.createSelector((state) => state.filter)

    // Комбинированный селектор из зависимостей
    const filteredTodos = selectorModule.createSelector(
      [todos, filter],
      (todosValue, filterValue) => {
        switch (filterValue) {
          case 'active': return todosValue.filter((t) => !t.done)
          case 'done': return todosValue.filter((t) => t.done)
          default: return todosValue
        }
      },
    )

    const todosCount = selectorModule.createSelector(
      [todos],
      (todosValue) => todosValue.length,
    )

    const doneCount = selectorModule.createSelector(
      [todos],
      (todosValue) => todosValue.filter((t) => t.done).length,
    )

    return { todos, filter, filteredTodos, todosCount, doneCount }
  },
})

type TodoSynapse = Awaited<typeof synapsePromise>

export function CreateSynapseBasicExample() {
  const [store, setStore] = useState<TodoSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    synapsePromise.then((s) => { if (!cancelled) setStore(s) })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing createSynapse (basic)...</div>

  return <TodoUI store={store} />
}

function TodoUI({ store }: { store: TodoSynapse }) {
  // Используем useSelector для доступа к значениям
  const filteredTodos = useSelector(store.selectors.filteredTodos)
  const filter = useSelector(store.selectors.filter)
  const todosCount = useSelector(store.selectors.todosCount)
  const doneCount = useSelector(store.selectors.doneCount)

  const addTodo = () => {
    store.storage.update((s) => {
      s.todos.push({ id: Date.now(), text: `Задача #${s.todos.length + 1}`, done: false })
    })
  }

  const toggleTodo = (id: number) => {
    store.storage.update((s) => {
      const todo = s.todos.find((t) => t.id === id)
      if (todo) todo.done = !todo.done
    })
  }

  const setFilter = (f: TodoState['filter']) => {
    store.storage.set('filter', f)
  }

  return (
    <div style={cardStyle}>
      <h2>createSynapse() — базовый (storage + selectors)</h2>
      <p>Всего: {todosCount}, Готово: {doneCount}</p>

      <div style={buttonRow}>
        <button onClick={addTodo}>+ Добавить задачу</button>
        <button onClick={() => setFilter('all')} style={{ fontWeight: filter === 'all' ? 'bold' : 'normal' }}>Все</button>
        <button onClick={() => setFilter('active')} style={{ fontWeight: filter === 'active' ? 'bold' : 'normal' }}>Активные</button>
        <button onClick={() => setFilter('done')} style={{ fontWeight: filter === 'done' ? 'bold' : 'normal' }}>Готовые</button>
      </div>

      <ul>
        {filteredTodos?.map((todo) => (
          <li key={todo.id} style={{ textDecoration: todo.done ? 'line-through' : 'none', cursor: 'pointer' }} onClick={() => toggleTodo(todo.id)}>
            {todo.done ? '✓' : '○'} {todo.text}
          </li>
        ))}
      </ul>

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>createSynapse({'{'} storage, createSelectorsFn {'}'})</code> — минимальная конфигурация</li>
        <li><code>store.selectors.*</code> — типизированные SelectorAPI объекты</li>
        <li><code>useSelector(selector)</code> — React хук для подписки на селектор</li>
        <li><code>store.storage.update()</code> / <code>store.storage.set()</code> — изменение через storage напрямую</li>
      </ul>
    </div>
  )
}
