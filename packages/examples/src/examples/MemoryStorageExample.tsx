import { cardStyle } from './styles'
import { todoStorage } from './todo/todo.store'
import { TodoList, useTodoState } from './todo/TodoDemo'

// Создание см. в ./todo/todo.store.ts — это канонический todo-стор,
// который переиспользуется в разделах «Работа с данными» и «Паттерны».

export function MemoryStorageExample() {
  const state = useTodoState(todoStorage)
  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>MemoryStorage</h2>
      <p>
        Хранилище в оперативной памяти: данные живут, пока открыта страница. Синхронный API.
        Базовый выбор для эфемерного UI-состояния.
      </p>
      <TodoList storage={todoStorage} state={state} />
    </div>
  )
}
