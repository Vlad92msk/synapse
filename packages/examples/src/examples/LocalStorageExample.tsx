import { LocalStorage } from 'synapse-storage/core'

import { cardStyle } from './styles'
import { TodoList, useTodoState } from './todo/TodoDemo'
import { initialTodoState, TodoState } from './todo/todo.types'

// Тот же todo-домен, что и MemoryStorage, но данные переживают перезагрузку.
// API идентичен MemoryStorage — отличается только тип хранилища.
const storage = new LocalStorage<TodoState>({
  name: 'todo-local', // ключ в localStorage
  initialState: initialTodoState,
})

export function LocalStorageExample() {
  const state = useTodoState(storage)
  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>LocalStorage</h2>
      <p>
        Данные сохраняются в <code>localStorage</code> браузера и переживают перезагрузку
        страницы. Синхронный API, полностью идентичный MemoryStorage. Перезагрузите вкладку —
        задачи останутся.
      </p>
      <TodoList storage={storage} state={state} />
    </div>
  )
}
