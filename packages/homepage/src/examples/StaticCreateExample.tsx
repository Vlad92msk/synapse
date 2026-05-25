import { useState, useEffect } from 'react'
import { MemoryStorage, LocalStorage, IndexedDBStorage } from 'synapse-storage/core'
import { cardStyle } from './styles'

interface AppState {
  value: number
}

/**
 * Пример 8: Создание хранилищ через статический метод .create()
 * Каждый класс хранилища имеет статический .create() метод
 */
export function StaticCreateExample() {
  const [memStorage] = useState(() =>
    MemoryStorage.create<AppState>({ name: 'static-memory', initialState: { value: 100 } }),
  )
  const [localStore] = useState(() =>
    LocalStorage.create<AppState>({ name: 'static-local', initialState: { value: 200 } }),
  )
  const [idbStore] = useState(() =>
    IndexedDBStorage.create<AppState>({
      name: 'static-idb',
      initialState: { value: 300 },
      options: {},
    }),
  )

  const [states, setStates] = useState<Record<string, AppState>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const all = [memStorage, localStore, idbStore]

    Promise.all(all.map((s) => s.initialize())).then(() => {
      if (cancelled) return
      setReady(true)
      refresh()
    })

    function refresh() {
      setStates({
        memory: memStorage.getStateSync(),
        local: localStore.getStateSync(),
        idb: idbStore.getStateSync(),
      })
    }

    const unsubs = all.map((s) => s.subscribeToAll(() => refresh()))

    return () => {
      cancelled = true
      unsubs.forEach((u) => u())
      all.forEach((s) => s.destroy())
    }
  }, [memStorage, localStore, idbStore])

  if (!ready) return <div>Initializing static .create()...</div>

  return (
    <div style={cardStyle}>
      <h2>Static .create() methods</h2>
      <p>Каждый класс хранилища имеет статический <code>.create()</code> — синоним <code>new</code></p>

      {Object.entries(states).map(([key, st]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <strong>{key}:</strong> value = {st.value}
          {' '}
          <button onClick={() => {
            const store = key === 'memory' ? memStorage : key === 'local' ? localStore : idbStore
            store.set('value', st.value + 1)
          }}>
            +1
          </button>
        </div>
      ))}
    </div>
  )
}
