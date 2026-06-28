import { useState } from 'react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'
import { todoStorage } from './todo/todo.store'
import { TodoList, useTodoState } from './todo/TodoDemo'

// Чтение данных из канонического todoStorage (см. ./todo/todo.store.ts).
// Здесь — синхронное хранилище (MemoryStorage). Для IndexedDB те же методы
// возвращают Promise — полные сигнатуры в docs/ru/reading-data.md.

export function ReadingDataExample() {
  const state = useTodoState(todoStorage)
  const [log, setLog] = useState<string[]>([])
  const addLog = (msg: string) => setLog((prev) => [...prev.slice(-7), msg])

  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>Чтение данных</h2>
      <p>
        Все способы прочитать данные из хранилища. У синхронных (Memory, LocalStorage) методы
        возвращают значение сразу, у IndexedDB — через <code>await</code>.
      </p>

      <TodoList storage={todoStorage} state={state} />

      <h3 style={sectionTitle}>Прочитать значения</h3>
      <div style={buttonRow}>
        <button onClick={() => addLog(`get('filter') = ${JSON.stringify(todoStorage.get('filter'))}`)}>get('filter')</button>
        <button onClick={() => addLog(`getStateSync().todos.length = ${todoStorage.getStateSync().todos.length}`)}>getStateSync()</button>
        <button onClick={() => addLog(`has('todos') = ${todoStorage.has('todos')}`)}>has('todos')</button>
        <button onClick={() => addLog(`keys() = ${JSON.stringify(todoStorage.keys())}`)}>keys()</button>
      </div>

      <pre style={{ ...codeBlock, minHeight: 60 }}>{log.join('\n') || '(нажмите кнопку, чтобы прочитать данные)'}</pre>
    </div>
  )
}
