import { IndexedDBStorage } from 'synapse-storage/core'

import { cardStyle } from './styles'
import { TodoList, useTodoState } from './todo/TodoDemo'
import { initialTodoState, TodoState } from './todo/todo.types'

// Тот же todo-домен, но в IndexedDB. Асинхронное хранилище: get/set/update/has/keys
// возвращают Promise. Поле options обязательно (можно пустой объект).
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: {}, // обязательное поле
})

export function IndexedDBExample() {
  const state = useTodoState(storage)
  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>IndexedDBStorage</h2>
      <p>
        Данные хранятся в IndexedDB и переживают перезагрузку. <strong>Асинхронный API</strong> —
        операции возвращают Promise. Демо ниже не использует <code>await</code> (в обработчиках это
        не обязательно), а состояние читается синхронно из кеша через <code>getStateSync()</code>.
      </p>
      <TodoList storage={storage} state={state} />
    </div>
  )
}
