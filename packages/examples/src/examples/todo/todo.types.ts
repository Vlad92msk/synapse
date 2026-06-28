// Сквозной домен примеров раздела State Manager: простой todo-list.
// Один и тот же домен проходит через «Создание хранилищ» → «Работа с данными» → «Паттерны».

export interface Todo {
  id: string
  title: string
  done: boolean
}

export type Filter = 'all' | 'active' | 'completed'

export interface TodoState {
  todos: Todo[]
  filter: Filter
}

export const initialTodoState: TodoState = {
  todos: [
    { id: 't1', title: 'Изучить Synapse', done: true },
    { id: 't2', title: 'Собрать todo-приложение', done: false },
  ],
  filter: 'all',
}

let seq = 0
/** Создать новую задачу с уникальным id. */
export const createTodo = (title: string): Todo => ({
  id: `t${Date.now()}_${seq++}`,
  title,
  done: false,
})

/** Отфильтровать задачи по текущему фильтру. */
export const filterTodos = (todos: Todo[], filter: Filter): Todo[] =>
  filter === 'all' ? todos : todos.filter((t) => (filter === 'active' ? !t.done : t.done))
