import { cardStyle, buttonRow, sectionTitle } from './styles'
import { todoStorage } from './todo/todo.store'
import { TodoList, useTodoState } from './todo/TodoDemo'
import { createTodo } from './todo/todo.types'

// Запись в канонический todoStorage (см. ./todo/todo.store.ts).
// set / update / reset. Здесь синхронное хранилище; у IndexedDB те же методы —
// через await. Разбор set vs update — в docs/ru/writing-data.md.

export function WritingDataExample() {
  const state = useTodoState(todoStorage)
  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>Запись данных</h2>
      <p>
        Все способы записать данные. <code>set</code> заменяет значение по ключу, <code>update</code>{' '}
        атомарно меняет несколько полей (мутации в стиле immer), <code>reset</code> возвращает к
        начальному состоянию.
      </p>

      <TodoList storage={todoStorage} state={state} />

      <h3 style={sectionTitle}>Записать данные</h3>
      <div style={buttonRow}>
        <button onClick={() => todoStorage.set('filter', 'completed')}>set('filter', 'completed')</button>
        <button onClick={() => todoStorage.update((s) => { s.todos.push(createTodo('Задача из update()')) })}>update(добавить задачу)</button>
        <button onClick={() => todoStorage.update((s) => { s.todos.forEach((t) => (t.done = true)) })}>update(отметить все)</button>
        <button onClick={() => todoStorage.reset()}>reset()</button>
      </div>
    </div>
  )
}
