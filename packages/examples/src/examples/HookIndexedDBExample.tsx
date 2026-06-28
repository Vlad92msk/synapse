import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

import { cardStyle } from './styles'
import { TodoList } from './todo/TodoDemo'
import { initialTodoState, TodoState } from './todo/todo.types'

// useCreateStorage с type: 'indexedDB' → IAsyncStorage<TodoState>.
// Важно: destroyOnUnmount по умолчанию false для IndexedDB (персистентное хранилище).
export function HookIndexedDBExample() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<TodoState>({
    type: 'indexedDB',
    name: 'todo-hook-idb',
    initialState: initialTodoState,
  })

  const state = useStorageSubscribe(storage, (s) => s)

  if (isLoading) return <div>Loading…</div>
  if (hasError) return <div>Error: {status.error?.message}</div>
  if (!isReady || !state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>useCreateStorage (indexedDB)</h2>
      <p>
        Тот же хук с <code>type: 'indexedDB'</code>. Возвращает <code>IAsyncStorage</code>; запись в
        обработчиках можно не <code>await</code>-ить, а <code>useStorageSubscribe</code> читает
        состояние синхронно из кеша.
      </p>
      <TodoList storage={storage} state={state} />
    </div>
  )
}
