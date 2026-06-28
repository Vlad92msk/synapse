import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

import { cardStyle } from './styles'
import { TodoList } from './todo/TodoDemo'
import { initialTodoState, TodoState } from './todo/todo.types'

// Тот же useCreateStorage, только type: 'localStorage' — данные переживают перезагрузку.
// Единственное отличие от memory-варианта — поле type.
export function HookLocalStorageExample() {
  const { storage, isReady, isLoading } = useCreateStorage<TodoState>({
    type: 'localStorage',
    name: 'todo-hook-local',
    initialState: initialTodoState,
  })

  const state = useStorageSubscribe(storage, (s) => s)

  if (isLoading) return <div>Loading…</div>
  if (!isReady || !state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>useCreateStorage (localStorage)</h2>
      <p>
        Тот же хук с <code>type: 'localStorage'</code>. Перезагрузите страницу — задачи сохранятся.
      </p>
      <TodoList storage={storage} state={state} />
    </div>
  )
}
