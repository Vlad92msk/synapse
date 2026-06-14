import { useState, useEffect } from 'react'
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>
  filter: 'all' | 'active' | 'done'
}

const initialState: TodoState = {
  todos: [
    { id: 1, text: 'Learn Synapse', done: false },
    { id: 2, text: 'Write examples', done: true },
  ],
  filter: 'all',
}

// ─── Селекторы (class-based) ─────────────────────────────────────────────────────
// Поля — настоящие SelectorAPI сразу (eager). Имя селектора = имя поля.

class TodoSelectors extends Selectors<TodoState> {
  // Простой селектор — выбирает одно поле
  readonly todos = this.select((state) => state.todos)
  readonly filter = this.select((state) => state.filter)

  // Комбинированный селектор — зависит от других селекторов
  readonly filteredTodos = this.combine([this.todos, this.filter], (todos, filter) => {
    if (filter === 'active') return todos.filter((t) => !t.done)
    if (filter === 'done') return todos.filter((t) => t.done)
    return todos
  })

  readonly doneCount = this.combine([this.todos], (todos) => todos.filter((t) => t.done).length)
}

// ─── Создание synapse (basic) ──────────────────────────────────────────────────
// Перегрузка createSynapse(factory) → ленивый handle: фабрика исполняется один раз
// при первом await / ready(), а не на импорте.

const todoSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<TodoState>({ name: 'todo-basic', initialState })
  return {
    storage,
    selectors: new TodoSelectors(storage),
  }
})

type TodoSynapse = Awaited<typeof todoSynapse>

// ─── Компонент-пример ──────────────────────────────────────────────────────────

export function CreateSynapseBasicExample() {
  const [store, setStore] = useState<TodoSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    todoSynapse.then((s) => { if (!cancelled) setStore(s) })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>createSynapse (basic)</h2>
      <p>Минимальная конфигурация: storage + selectors, без dispatcher. Изменения через storage напрямую.</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { useSelector } from 'synapse-storage/react'

interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>
  filter: 'all' | 'active' | 'done'
}

// Селекторы — поля класса, настоящие SelectorAPI сразу (eager)
class TodoSelectors extends Selectors<TodoState> {
  readonly todos = this.select((state) => state.todos)
  readonly filter = this.select((state) => state.filter)

  // Комбинированный: зависит от todos и filter
  readonly filteredTodos = this.combine([this.todos, this.filter], (todos, filter) => {
    if (filter === 'active') return todos.filter((t) => !t.done)
    if (filter === 'done') return todos.filter((t) => t.done)
    return todos
  })
}

// createSynapse(factory) → ленивый handle (фабрика исполняется один раз)
const todoSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<TodoState>({
    name: 'todo-basic',
    initialState: { todos: [], filter: 'all' },
  })
  return { storage, selectors: new TodoSelectors(storage) }
})`}</pre>

      {/* ─── Возвращаемое значение ───────────────────────────────────── */}
      <h3 style={sectionTitle}>Возвращаемое значение</h3>
      <pre style={codeBlock}>{`// Handle — thenable: await дёргает фабрику и возвращает собранный модуль
const store = await todoSynapse

// Результат (basic — без dispatcher):
store.storage    // IStorage<TodoState> — хранилище
store.selectors  // экземпляр TodoSelectors — поля = SelectorAPI

// Сам handle:
todoSynapse.ready()    // Promise<store> — то же, что await
todoSynapse.isReady()  // boolean
todoSynapse.destroy()  // () => Promise<void> — очистка + сброс мемоизации`}</pre>

      {/* ─── Использование в React ───────────────────────────────────── */}
      <h3 style={sectionTitle}>Использование в React</h3>
      <pre style={codeBlock}>{`// useSelector — подписка на селектор (авто-обновление компонента)
const todos = useSelector(store.selectors.todos)
const filteredTodos = useSelector(store.selectors.filteredTodos)
const doneCount = useSelector(store.selectors.doneCount)

// Изменение state — через storage напрямую
store.storage.set('filter', 'active')

store.storage.update((s) => {
  s.todos.push({ id: Date.now(), text: 'New', done: false })
})`}</pre>

      {/* ─── Живая демо ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Demo</h3>
      <TodoDemo store={store} />

      {/* ─── Async-пролог в фабрике ──────────────────────────────────── */}
      <h3 style={sectionTitle}>Альтернатива: async-инициализация в фабрике</h3>
      <pre style={codeBlock}>{`// Фабрика — обычная async-функция: можно сделать запрос/init до сборки модуля
const todoSynapse = createSynapse(async () => {
  const data = await fetch('/api/todos').then((r) => r.json())
  const storage = new MemoryStorage<TodoState>({
    name: 'todo-async',
    initialState: { todos: data, filter: 'all' },
  })
  return { storage, selectors: new TodoSelectors(storage) }
})`}</pre>
    </div>
  )
}

function TodoDemo({ store }: { store: TodoSynapse }) {
  const filteredTodos = useSelector(store.selectors.filteredTodos)
  const filter = useSelector(store.selectors.filter)
  const doneCount = useSelector(store.selectors.doneCount)
  const todos = useSelector(store.selectors.todos)

  return (
    <div>
      <p>
        Total: {todos?.length ?? 0}, Done: {doneCount ?? 0}
      </p>

      <div style={buttonRow}>
        <button onClick={() => {
          store.storage.update((s) => {
            s.todos.push({ id: Date.now(), text: `Task #${s.todos.length + 1}`, done: false })
          })
        }}>
          Add todo
        </button>
        {(['all', 'active', 'done'] as const).map((f) => (
          <button
            key={f}
            onClick={() => store.storage.set('filter', f)}
            style={{ fontWeight: filter === f ? 'bold' : 'normal' }}
          >
            {f}
          </button>
        ))}
      </div>

      <ul>
        {filteredTodos?.map((todo) => (
          <li
            key={todo.id}
            style={{ textDecoration: todo.done ? 'line-through' : 'none', cursor: 'pointer' }}
            onClick={() => {
              store.storage.update((s) => {
                const t = s.todos.find((x) => x.id === todo.id)
                if (t) t.done = !t.done
              })
            }}
          >
            {todo.done ? '[x]' : '[ ]'} {todo.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
