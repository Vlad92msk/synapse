import { useEffect, useState } from 'react'
import type { IStorage } from 'synapse-storage/core'

import { buttonRow } from '../styles'
import { createTodo, Filter, filterTodos, TodoState } from './todo.types'

// Демо-обвязка для раздела «Создание хранилищ». Не часть «кода, который копируется»,
// а минимальный UI, чтобы пример можно было пощупать. Реальные сигнатуры записи
// (set / update / reset) подробно разбираются в разделе «Работа с данными».

/** Инициализирует модульное хранилище и реактивно отдаёт его состояние. */
export function useTodoState(storage: IStorage<TodoState>): TodoState | null {
  const [state, setState] = useState<TodoState | null>(null)

  useEffect(() => {
    let cancelled = false
    storage.initialize().then(() => {
      if (!cancelled) setState(storage.getStateSync())
    })
    const unsub = storage.subscribeToAll(() => setState(storage.getStateSync()))
    return () => {
      cancelled = true
      unsub()
    }
  }, [storage])

  return state
}

const FILTERS: Filter[] = ['all', 'active', 'completed']

/** Презентационный todo-список. Пишет напрямую в переданное хранилище. */
export function TodoList({ storage, state }: { storage: IStorage<TodoState>; state: TodoState }) {
  const [title, setTitle] = useState('')

  const add = () => {
    const value = title.trim()
    if (!value) return
    storage.update((s) => {
      s.todos.push(createTodo(value))
    })
    setTitle('')
  }

  return (
    <div>
      <div style={buttonRow}>
        <input
          value={title}
          placeholder="Новая задача…"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add}>Добавить</button>
        <button onClick={() => storage.reset()}>reset()</button>
      </div>

      <div style={buttonRow}>
        {FILTERS.map((f) => (
          <button key={f} disabled={f === state.filter} onClick={() => storage.set('filter', f)}>
            {f}
          </button>
        ))}
      </div>

      <ul>
        {filterTodos(state.todos, state.filter).map((todo) => (
          <li key={todo.id}>
            <label style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() =>
                  storage.update((s) => {
                    const target = s.todos.find((t) => t.id === todo.id)
                    if (target) target.done = !target.done
                  })
                }
              />{' '}
              {todo.title}
            </label>
            <button
              style={{ marginLeft: 8 }}
              onClick={() => storage.update((s) => { s.todos = s.todos.filter((t) => t.id !== todo.id) })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
