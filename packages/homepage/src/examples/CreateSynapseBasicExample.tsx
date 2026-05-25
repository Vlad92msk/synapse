import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
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

// ─── Создание synapse (basic) ──────────────────────────────────────────────────

const synapsePromise = createSynapse({
  storage: new MemoryStorage<TodoState>({ name: 'todo-basic', initialState }),

  createSelectorsFn: (selectorModule) => {
    // Простой селектор — выбирает одно поле
    const todos = selectorModule.createSelector((state) => state.todos)
    const filter = selectorModule.createSelector((state) => state.filter)

    // Комбинированный селектор — зависит от других селекторов
    const filteredTodos = selectorModule.createSelector(
      [todos, filter],
      (todosVal, filterVal) => {
        if (filterVal === 'active') return todosVal.filter((t) => !t.done)
        if (filterVal === 'done') return todosVal.filter((t) => t.done)
        return todosVal
      },
    )

    const doneCount = selectorModule.createSelector(
      [todos],
      (todosVal) => todosVal.filter((t) => t.done).length,
    )

    return { todos, filter, filteredTodos, doneCount }
  },
})

type TodoSynapse = Awaited<typeof synapsePromise>

// ─── Компонент-пример ──────────────────────────────────────────────────────────

export function CreateSynapseBasicExample() {
  const [store, setStore] = useState<TodoSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    synapsePromise.then((s) => { if (!cancelled) setStore(s) })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>createSynapse (basic)</h2>
      <p>Минимальная конфигурация: storage + selectors, без dispatcher. Изменения через storage напрямую.</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { useSelector } from 'synapse-storage/react'

interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>
  filter: 'all' | 'active' | 'done'
}

const synapsePromise = createSynapse({
  // Передаём готовый storage (или createStorageFn для async создания)
  storage: new MemoryStorage<TodoState>({
    name: 'todo-basic',
    initialState: { todos: [], filter: 'all' },
  }),

  // Селекторы — производные значения от state
  createSelectorsFn: (selectorModule) => {
    const todos = selectorModule.createSelector((state) => state.todos)
    const filter = selectorModule.createSelector((state) => state.filter)

    // Комбинированный: зависит от todos и filter
    const filteredTodos = selectorModule.createSelector(
      [todos, filter],
      (todosVal, filterVal) => {
        if (filterVal === 'active') return todosVal.filter((t) => !t.done)
        if (filterVal === 'done') return todosVal.filter((t) => t.done)
        return todosVal
      },
    )

    return { todos, filter, filteredTodos }
  },
})`}</pre>

      {/* ─── Возвращаемое значение ───────────────────────────────────── */}
      <h3 style={sectionTitle}>Возвращаемое значение</h3>
      <pre style={codeBlock}>{`// createSynapse возвращает Promise
const store = await synapsePromise

// Результат (basic — без dispatcher):
store.storage    // IStorage<TodoState> — хранилище
store.selectors  // { todos, filter, filteredTodos } — SelectorAPI объекты
store.destroy()  // () => Promise<void> — очистка`}</pre>

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

      {/* ─── createStorageFn (async) ─────────────────────────────────── */}
      <h3 style={sectionTitle}>Альтернатива: createStorageFn</h3>
      <pre style={codeBlock}>{`// Вместо storage можно передать createStorageFn
// для асинхронного создания (например, загрузка данных)
const synapsePromise = createSynapse({
  createStorageFn: async () => {
    const data = await fetch('/api/todos').then((r) => r.json())
    const storage = new MemoryStorage<TodoState>({
      name: 'todo-async',
      initialState: { todos: data, filter: 'all' },
    })
    storage.initialize()
    return storage
  },
  createSelectorsFn: (sm) => ({ ... }),
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
