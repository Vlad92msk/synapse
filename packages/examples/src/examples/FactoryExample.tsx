import { StorageFactory } from 'synapse-storage/core'

import { cardStyle } from './styles'
import { TodoList, useTodoState } from './todo/TodoDemo'
import { initialTodoState, TodoState } from './todo/todo.types'

// StorageFactory — альтернатива прямому new MemoryStorage() / new LocalStorage() и т.д.
// createMemory / createLocal / createIndexedDB возвращают конкретный тип хранилища;
// универсальный create({ type }) выбирает тип в рантайме. См. остальные методы в доке.
const storage = StorageFactory.createMemory<TodoState>({
  name: 'todo-factory',
  initialState: initialTodoState,
})

export function FactoryExample() {
  const state = useTodoState(storage)
  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>StorageFactory</h2>
      <p>
        Фабрика для создания хранилищ без прямого <code>new</code>. Здесь todo-стор создан через
        <code> StorageFactory.createMemory()</code> — поведение идентично <code>new MemoryStorage()</code>.
      </p>
      <TodoList storage={storage} state={state} />
    </div>
  )
}
