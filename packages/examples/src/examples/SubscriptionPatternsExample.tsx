import { useEffect, useState } from 'react'
import type { ISyncStorage } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, codeBlock, sectionTitle } from './styles'
import { todoStorage } from './todo/todo.store'
import { TodoState } from './todo/todo.types'
import { TodoList, useTodoState } from './todo/TodoDemo'

// Подписки на изменения канонического todoStorage.
// subscribe(key) / subscribe(selector) / subscribeToAll / useStorageSubscribe.
// Работают одинаково для Memory, LocalStorage и IndexedDB. Подробнее —
// в docs/ru/subscriptions.md.

export function SubscriptionPatternsExample() {
  const state = useTodoState(todoStorage)
  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>Подписки (subscribe)</h2>
      <p>Меняйте задачи и фильтр ниже — каждый блок показывает свой способ подписки на изменения.</p>

      <TodoList storage={todoStorage} state={state} />

      <h3 style={sectionTitle}>1. subscribe(key, callback) — конкретный ключ</h3>
      <SubscribeKeyDemo />

      <h3 style={sectionTitle}>2. subscribe(selector, callback) — вычисляемое значение</h3>
      <SubscribeSelectorDemo />

      <h3 style={sectionTitle}>3. subscribeToAll(callback) — любое изменение</h3>
      <SubscribeAllDemo />

      <h3 style={sectionTitle}>4. useStorageSubscribe — React-хук</h3>
      <UseStorageSubscribeDemo storage={todoStorage} />
    </div>
  )
}

// ─── Демо-компоненты ────────────────────────────────────────────────────────

function SubscribeKeyDemo() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    // Подписка на ключ верхнего уровня — callback при каждом изменении 'filter'.
    return todoStorage.subscribe('filter', (value) => {
      setLog((prev) => [...prev.slice(-4), `filter → ${value}`])
    })
  }, [])

  return <pre style={{ ...codeBlock, minHeight: 40 }}>{log.join('\n') || '(переключите фильтр)'}</pre>
}

function SubscribeSelectorDemo() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    // Подписка через selector — callback только когда результат изменился.
    return todoStorage.subscribe(
      (s) => s.todos.filter((t) => !t.done).length,
      (activeCount) => setLog((prev) => [...prev.slice(-4), `активных задач → ${activeCount}`]),
    )
  }, [])

  return <pre style={{ ...codeBlock, minHeight: 40 }}>{log.join('\n') || '(добавьте/отметьте задачу)'}</pre>
}

function SubscribeAllDemo() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    // Подписка на ВСЕ изменения — callback получает событие с типом и ключом.
    return todoStorage.subscribeToAll((event) => {
      setLog((prev) => [...prev.slice(-4), `${event.type}: key=${JSON.stringify(event.key)}`])
    })
  }, [])

  return <pre style={{ ...codeBlock, minHeight: 40 }}>{log.join('\n') || '(любое изменение покажется здесь)'}</pre>
}

function UseStorageSubscribeDemo({ storage }: { storage: ISyncStorage<TodoState> }) {
  const filter = useStorageSubscribe(storage, (s) => s.filter)
  const total = useStorageSubscribe(storage, (s) => s.todos.length)
  const active = useStorageSubscribe(storage, (s) => s.todos.filter((t) => !t.done).length)

  return (
    <div style={{ fontSize: 13 }}>
      <div><code>filter</code> = <strong>{filter}</strong></div>
      <div><code>всего задач</code> = <strong>{total}</strong></div>
      <div><code>активных</code> = <strong>{active}</strong></div>
    </div>
  )
}
