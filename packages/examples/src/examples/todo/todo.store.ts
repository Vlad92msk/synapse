import { MemoryStorage, Selectors } from 'synapse-storage/core'

import { filterTodos, initialTodoState, TodoState } from './todo.types'

// Канонический todo-стор. Создаётся в разделе «MemoryStorage» и переиспользуется
// в разделах «Работа с данными» и «Паттерны» — чтобы пример накапливался, а не
// начинался с нуля в каждом разделе.
export const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: initialTodoState,
})

// Селекторы поверх канонического стора. Извлекают и вычисляют данные из todoStorage,
// мемоизируются (пересчёт только при изменении зависимостей). Переиспользуются
// в разделе «Работа с данными» (Selector System / реактивные селекторы).
export class TodoSelectors extends Selectors<TodoState> {
  // Простые селекторы — извлекают часть состояния.
  readonly todos = this.select((s) => s.todos)
  readonly filter = this.select((s) => s.filter)

  // Комбинированные — зависят от других селекторов, пересчёт только при их изменении.
  readonly visibleTodos = this.combine([this.todos, this.filter], (todos, filter) => filterTodos(todos, filter))
  readonly activeCount = this.combine([this.todos], (todos) => todos.filter((t) => !t.done).length)
  readonly completedCount = this.combine([this.todos], (todos) => todos.filter((t) => t.done).length)
}

// Канонический набор селекторов поверх todoStorage — переиспользуется примерами.
export const todoSelectors = new TodoSelectors(todoStorage)
