import { useState } from 'react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'
import { todoStorage } from './todo/todo.store'
import { TodoList, useTodoState } from './todo/TodoDemo'

// Операции наличия/удаления/сброса поверх канонического todoStorage.
// has / keys / remove / clear / reset. Здесь синхронное хранилище; у IndexedDB
// те же методы — через await. Подробнее — в docs/ru/delete-has-keys.md.

export function DeleteHasKeysExample() {
  const state = useTodoState(todoStorage)
  const [log, setLog] = useState<string[]>([])
  const addLog = (msg: string) => setLog((prev) => [...prev.slice(-7), msg])

  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>remove / has / keys / clear / reset</h2>
      <p>
        Проверка наличия ключа, удаление ключей и сброс хранилища. <code>clear</code> делает
        состояние пустым <code>{'{}'}</code>, <code>reset</code> возвращает его к initialState.
      </p>

      <TodoList storage={todoStorage} state={state} />

      <h3 style={sectionTitle}>Операции</h3>
      <div style={buttonRow}>
        <button onClick={() => addLog(`has('todos') = ${todoStorage.has('todos')}`)}>has('todos')</button>
        <button onClick={() => addLog(`keys() = ${JSON.stringify(todoStorage.keys())}`)}>keys()</button>
        <button onClick={() => { todoStorage.remove('filter'); addLog("remove('filter')") }}>remove('filter')</button>
        <button onClick={() => { todoStorage.clear(); addLog('clear() → state = {}') }}>clear()</button>
        <button onClick={() => { todoStorage.reset(); addLog('reset() → initialState') }}>reset()</button>
      </div>

      <pre style={{ ...codeBlock, minHeight: 60 }}>{log.join('\n') || '(нажмите кнопку, чтобы увидеть результат)'}</pre>
    </div>
  )
}
