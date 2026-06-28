import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

import { cardStyle } from './styles'
import { TodoList } from './todo/TodoDemo'
import { initialTodoState, TodoState } from './todo/todo.types'

// useCreateStorage — React-хук, который создаёт и инициализирует хранилище внутри компонента
// (и уничтожает его при размонтировании). type: 'memory' → ISyncStorage<TodoState>.
export function HookExample() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<TodoState>({
    type: 'memory',
    name: 'todo-hook-memory',
    initialState: initialTodoState,
  })

  // useStorageSubscribe реактивно отдаёт состояние (работает и до, и после готовности).
  const state = useStorageSubscribe(storage, (s) => s)

  if (isLoading) return <div>Loading…</div>
  if (hasError) return <div>Error: {status.error?.message}</div>
  if (!isReady || !state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>useCreateStorage (memory)</h2>
      <p>
        Хранилище создаётся прямо в компоненте через хук — не нужно держать его на уровне модуля.
        Удобно, когда жизненный цикл стора совпадает с жизненным циклом компонента.
      </p>
      <TodoList storage={storage} state={state} />
    </div>
  )
}
