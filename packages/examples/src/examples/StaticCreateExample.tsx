import { MemoryStorage } from 'synapse-storage/core'

import { cardStyle } from './styles'
import { TodoList, useTodoState } from './todo/TodoDemo'
import { initialTodoState, TodoState } from './todo/todo.types'

// У каждого класса хранилища есть статический .create() — эквивалент new.
// MemoryStorage.create() / LocalStorage.create() / IndexedDBStorage.create().
const storage = MemoryStorage.create<TodoState>({
  name: 'todo-static',
  initialState: initialTodoState,
})

export function StaticCreateExample() {
  const state = useTodoState(storage)
  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>Static .create()</h2>
      <p>
        Альтернатива оператору <code>new</code>: <code>MemoryStorage.create()</code> создаёт ровно
        такое же хранилище. То же доступно для <code>LocalStorage</code> и <code>IndexedDBStorage</code>.
      </p>
      <TodoList storage={storage} state={state} />
    </div>
  )
}
