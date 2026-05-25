import { useState, useEffect } from 'react'
import { MemoryStorage, LocalStorage, IndexedDBStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

interface AppState {
  value: number
}

// ─── Создание через static .create() ────────────────────────────────────────

const memStorage = MemoryStorage.create<AppState>({
  name: 'static-memory',
  initialState: { value: 100 },
})

const localStore = LocalStorage.create<AppState>({
  name: 'static-local',
  initialState: { value: 200 },
})

const idbStore = IndexedDBStorage.create<AppState>({
  name: 'static-idb',
  initialState: { value: 300 },
  options: {},
})

// ─── Компонент-пример ───────────────────────────────────────────────────────

export function StaticCreateExample() {
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
    }
  }, [])

  if (!ready) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>Static .create()</h2>
      <p>Каждый класс хранилища имеет статический метод <code>.create()</code> — альтернатива <code>new</code>.</p>

      <h3 style={sectionTitle}>Использование</h3>
      <pre style={codeBlock}>{`import { MemoryStorage, LocalStorage, IndexedDBStorage } from 'synapse-storage/core'

interface AppState {
  value: number
}

// MemoryStorage.create() — эквивалент new MemoryStorage()
const memStorage = MemoryStorage.create<AppState>({
  name: 'static-memory',
  initialState: { value: 100 },
})

// LocalStorage.create() — эквивалент new LocalStorage()
const localStore = LocalStorage.create<AppState>({
  name: 'static-local',
  initialState: { value: 200 },
})

// IndexedDBStorage.create() — эквивалент new IndexedDBStorage()
const idbStore = IndexedDBStorage.create<AppState>({
  name: 'static-idb',
  initialState: { value: 300 },
  options: {},                    // обязательно для IndexedDB
})

// Инициализация
await Promise.all([
  memStorage.initialize(),
  localStore.initialize(),
  idbStore.initialize(),
])`}</pre>

      {/* ─── Демо ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Демо</h3>
      {Object.entries(states).map(([key, st]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <strong>{key}:</strong> value = {st.value}
          {' '}
          <button onClick={() => {
            const store = key === 'memory' ? memStorage : key === 'local' ? localStore : idbStore
            store.set('value', st.value + 1)
          }}>+1</button>
        </div>
      ))}
    </div>
  )
}
