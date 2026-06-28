import { useEffect, useState } from 'react'
import { MemoryStorage, syncBroadcastMiddleware } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'
import { Filter, TodoState, createTodo, initialTodoState } from './todo/todo.types'
import { TodoList, useTodoState } from './todo/TodoDemo'

// Middleware перехватывают операции хранилища (set/get/update/delete/clear) и могут
// группировать, фильтровать или логировать их. Конфигурируются при создании стора,
// поэтому здесь отдельные todo-сторы (тот же домен TodoState, что и в остальных разделах).
// Полный разбор (+ кастомные middleware) — в docs/ru/middlewares.md.

const FILTERS: Filter[] = ['all', 'active', 'completed']

// 1. Logger — пишущие действия логируются в консоль, чтения молчат.
const loggerStorage = new MemoryStorage<TodoState>({
  name: 'mw-todo-logger',
  initialState: initialTodoState,
  middlewares: (getDefault) => [getDefault().logger({ collapsed: true })],
})

// 2. Batching — серия быстрых set схлопывается в одно уведомление.
const batchingStorage = new MemoryStorage<TodoState>({
  name: 'mw-todo-batching',
  initialState: initialTodoState,
  middlewares: (getDefault) => [getDefault().batching({ batchSize: 5, batchDelay: 100 })],
})
batchingStorage.initialize()

// 3. ShallowCompare — установка идентичного значения не вызывает уведомление.
const shallowStorage = new MemoryStorage<TodoState>({
  name: 'mw-todo-shallow',
  initialState: initialTodoState,
  middlewares: (getDefault) => [getDefault().shallowCompare()],
})
shallowStorage.initialize()

// 4. Broadcast — синхронизация между вкладками.
const broadcastStorage = new MemoryStorage<TodoState>({
  name: 'mw-todo-broadcast',
  initialState: initialTodoState,
  middlewares: () => [syncBroadcastMiddleware({ storageName: 'mw-todo-broadcast', storageType: 'memory' })],
})

// ─── Демо ─────────────────────────────────────────────────────────────────────

function LoggerDemo() {
  const state = useTodoState(loggerStorage)
  if (!state) return <div>Initializing…</div>
  return (
    <div>
      <p style={{ fontSize: 13, color: '#888' }}>Открой консоль: добавление/переключение задач логируется, чтения — нет.</p>
      <TodoList storage={loggerStorage} state={state} />
    </div>
  )
}

function BatchingDemo() {
  const filter = useStorageSubscribe(batchingStorage, (s) => s.filter)
  const [fires, setFires] = useState(0)

  const rapidFire = () => {
    // 12 быстрых set('filter') — до подписчиков дойдёт только финальное значение.
    for (let i = 0; i < 12; i++) batchingStorage.set('filter', FILTERS[i % FILTERS.length])
    setFires((c) => c + 1)
  }

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={rapidFire}>12 быстрых set('filter')</button>
        <button onClick={() => batchingStorage.reset()}>reset</button>
      </div>
      <p>filter: <strong>{filter}</strong> | пачек: {fires}</p>
    </div>
  )
}

function ShallowCompareDemo() {
  const filter = useStorageSubscribe(shallowStorage, (s) => s.filter)
  const [attempts, setAttempts] = useState(0)
  const [updates, setUpdates] = useState(0)

  useEffect(() => shallowStorage.subscribe('filter', () => setUpdates((c) => c + 1)), [])

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={() => { shallowStorage.set('filter', filter ?? 'all'); setAttempts((c) => c + 1) }}>
          set то же значение (пропуск)
        </button>
        <button onClick={() => { shallowStorage.set('filter', filter === 'all' ? 'active' : 'all'); setAttempts((c) => c + 1) }}>
          set другое значение
        </button>
      </div>
      <p>filter: <strong>{filter}</strong> | попыток: {attempts} | реальных обновлений: {updates}</p>
    </div>
  )
}

function BroadcastDemo() {
  const state = useTodoState(broadcastStorage)
  if (!state) return <div>Initializing…</div>
  return (
    <div>
      <p style={{ fontSize: 13, color: '#888' }}>Открой страницу во второй вкладке — изменения синхронизируются.</p>
      <TodoList storage={broadcastStorage} state={state} />
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function MiddlewaresExample() {
  return (
    <div style={cardStyle}>
      <h2>Middlewares</h2>
      <p>
        Middleware перехватывают операции хранилища и могут модифицировать, фильтровать или группировать их.
        Подключаются массивом в поле <code>middlewares</code>; порядок в массиве = порядок обработки.
      </p>

      <h3 style={sectionTitle}>1. Logger — лог пишущих действий (dev)</h3>
      <LoggerDemo />

      <h3 style={sectionTitle}>2. Batching — группировка быстрых записей</h3>
      <BatchingDemo />

      <h3 style={sectionTitle}>3. ShallowCompare — фильтрация идентичных значений</h3>
      <ShallowCompareDemo />

      <h3 style={sectionTitle}>4. Broadcast — синхронизация между вкладками</h3>
      <BroadcastDemo />
    </div>
  )
}
