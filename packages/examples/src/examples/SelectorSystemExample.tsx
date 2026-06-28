import { useEffect, useState } from 'react'
import { useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'
import { todoSelectors, todoStorage } from './todo/todo.store'
import { TodoList, useTodoState } from './todo/TodoDemo'

// Селекторы поверх канонического todoStorage. Определение — в ./todo/todo.store.ts
// (TodoSelectors: todos, filter, visibleTodos, activeCount, completedCount).
// Полный разбор select/combine/keyed/.$ — в docs/ru/selector-system.md.

export function SelectorSystemExample() {
  const state = useTodoState(todoStorage)
  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>Селекторы (Selectors)</h2>
      <p>
        Селекторы извлекают и вычисляют данные из хранилища, мемоизируются и комбинируются.
        Меняйте задачи и фильтр — производные значения пересчитываются автоматически.
      </p>

      <TodoList storage={todoStorage} state={state} />
      <SelectorDemo />
    </div>
  )
}

// ─── Демо ─────────────────────────────────────────────────────────────────────

function SelectorDemo() {
  // useSelector — подписка на селектор, ре-рендер только при изменении результата.
  const visible = useSelector(todoSelectors.visibleTodos)
  const active = useSelector(todoSelectors.activeCount)
  const completed = useSelector(todoSelectors.completedCount)
  const { data: allTodos, isLoading } = useSelector(todoSelectors.todos, { withLoading: true })

  const [streamLog, setStreamLog] = useState<string[]>([])

  // Реактивный селектор: selector.$ — Observable, эмитит при каждом изменении.
  useEffect(() => {
    const sub = todoSelectors.activeCount.$.subscribe((value) =>
      setStreamLog((prev) => [...prev.slice(-3), `activeCount.$ → ${value}`]),
    )
    return () => sub.unsubscribe()
  }, [])

  return (
    <div>
      <div style={{ fontSize: 13, background: '#f9f9f9', padding: 8, borderRadius: 4, marginBottom: 8 }}>
        <div>Активных: <strong>{active}</strong> | Выполнено: <strong>{completed}</strong></div>
        <div>Видно под фильтром: <strong>{visible?.length ?? 0}</strong> | Всего: <strong>{allTodos?.length ?? 0}</strong></div>
        {isLoading && <div style={{ color: '#888' }}>Loading…</div>}
      </div>

      <ul>
        {visible?.map((todo) => (
          <li key={todo.id} style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>{todo.title}</li>
        ))}
      </ul>

      <h3 style={sectionTitle}>Программный доступ</h3>
      <div style={buttonRow}>
        <button onClick={() => alert(`activeCount.select() = ${todoSelectors.activeCount.select()}`)}>selector.select()</button>
        <button onClick={() => alert(`activeCount.selectSync() = ${todoSelectors.activeCount.selectSync()}`)}>selector.selectSync()</button>
      </div>

      <p style={{ fontSize: 12 }}>selector.$ subscribe log:</p>
      <pre style={{ ...codeBlock, minHeight: 30 }}>{streamLog.join('\n') || '(измените задачи, чтобы увидеть)'}</pre>
    </div>
  )
}
