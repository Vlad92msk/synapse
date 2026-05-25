import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow } from './styles'

interface CounterState {
  count: number
  label: string
}

/**
 * Пример 1: Создание MemoryStorage через new + ручная инициализация
 */
export function MemoryStorageExample() {
  const [storage] = useState(() =>
    new MemoryStorage<CounterState>({
      name: 'memory-counter',
      initialState: { count: 0, label: 'clicks' },
    }),
  )
  const [state, setState] = useState<CounterState>({ count: 0, label: 'clicks' })
  const [isReady, setIsReady] = useState(false)

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

  // Подписка на изменения
  useEffect(() => {
    if (!isReady) return

    const unsub = storage.subscribeToAll(() => {
      setState(storage.getStateSync())
    })
    return unsub
  }, [storage, isReady])

  if (!isReady) return <div>Initializing MemoryStorage...</div>

  return (
    <div style={cardStyle}>
      <h2>MemoryStorage (new)</h2>
      <p>Count: {state.count} ({state.label})</p>

      <div style={buttonRow}>
        {/* set() — обновление одного ключа */}
        <button onClick={() => storage.set('count', state.count + 1)}>
          set('count', +1)
        </button>

        {/* update() — immer-like batch update */}
        <button onClick={() => storage.update((s) => { s.count += 10 })}>
          update(s =&gt; s.count += 10)
        </button>

        {/* set() для строкового поля */}
        <button onClick={() => storage.set('label', state.label === 'clicks' ? 'taps' : 'clicks')}>
          toggle label
        </button>

        {/* clear() — сброс */}
        <button onClick={() => storage.clear()}>
          clear()
        </button>
      </div>

      <h4>Чтение значений:</h4>
      <ul>
        <li><code>getStateSync()</code> → <code>{JSON.stringify(state)}</code></li>
        <li>
          <button onClick={() => {
            const val = storage.get<number>('count')
            alert(`get('count') = ${val}`)
          }}>
            get('count')
          </button>
        </li>
        <li>
          <button onClick={() => {
            const full = storage.getState()
            alert(`getState() = ${JSON.stringify(full)}`)
          }}>
            getState()
          </button>
        </li>
      </ul>
    </div>
  )
}
