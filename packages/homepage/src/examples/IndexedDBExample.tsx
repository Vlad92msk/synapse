import { useState, useEffect } from 'react'
import { IndexedDBStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow } from './styles'

interface TodoState {
  items: string[]
  filter: 'all' | 'active'
}

/**
 * Пример 3: Создание IndexedDBStorage через new
 * Требует дополнительного конфига options: { dbVersion }
 */
export function IndexedDBExample() {
  const [storage] = useState(() =>
    new IndexedDBStorage<TodoState>({
      name: 'todo-store',
      initialState: { items: [], filter: 'all' },
      options: { dbVersion: 1 },
    }),
  )
  const [state, setState] = useState<TodoState>({ items: [], filter: 'all' })
  const [isReady, setIsReady] = useState(false)
  const [inputVal, setInputVal] = useState('')

  useEffect(() => {
    let cancelled = false

    storage.initialize().then(() => {
      if (!cancelled) {
        setIsReady(true)
        setState(storage.getStateSync())
      }
    })

    return () => {
      cancelled = true
      storage.destroy()
    }
  }, [storage])

  useEffect(() => {
    if (!isReady) return
    return storage.subscribeToAll(() => {
      setState(storage.getStateSync())
    })
  }, [storage, isReady])

  if (!isReady) return <div>Initializing IndexedDBStorage...</div>

  return (
    <div style={cardStyle}>
      <h2>IndexedDBStorage (new)</h2>
      <p>Данные хранятся в IndexedDB</p>

      <div style={buttonRow}>
        <input
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="New todo..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputVal.trim()) {
              storage.update((s) => { s.items.push(inputVal.trim()) })
              setInputVal('')
            }
          }}
        />
        <button onClick={() => {
          if (!inputVal.trim()) return
          storage.update((s) => { s.items.push(inputVal.trim()) })
          setInputVal('')
        }}>
          Add (update)
        </button>
      </div>

      <ul>
        {state.items.map((item, i) => (
          <li key={i}>
            {item}
            <button style={{ marginLeft: 8 }} onClick={() =>
              storage.update((s) => { s.items.splice(i, 1) })
            }>
              x
            </button>
          </li>
        ))}
      </ul>

      <div style={buttonRow}>
        <button onClick={() => storage.set('filter', state.filter === 'all' ? 'active' : 'all')}>
          filter: {state.filter}
        </button>
        <button onClick={() => storage.clear()}>clear()</button>
      </div>

      <h4>Подписка через path selector:</h4>
      <ItemCountDisplay storage={storage} isReady={isReady} />
    </div>
  )
}

function ItemCountDisplay({ storage, isReady }: { storage: IndexedDBStorage<TodoState>; isReady: boolean }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isReady) return
    // Подписка через selector-функцию (path selector)
    return storage.subscribe(
      (state) => state.items,
      (items) => setCount(items.length),
    )
  }, [storage, isReady])

  return <p><code>subscribe(s =&gt; s.items, cb)</code> → items count: <strong>{count}</strong></p>
}
