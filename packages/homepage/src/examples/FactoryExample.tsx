import { useState, useEffect } from 'react'
import { StorageFactory } from 'synapse-storage/core'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

interface UserState {
  name: string
  age: number
}

// ─── Создание через фабрику ─────────────────────────────────────────────────

const memStorage = StorageFactory.createMemory<UserState>({
  name: 'factory-memory',
  initialState: { name: 'Alice', age: 25 },
})

const localStore = StorageFactory.createLocal<UserState>({
  name: 'factory-local',
  initialState: { name: 'Bob', age: 30 },
})

const idbStore = StorageFactory.createIndexedDB<UserState>({
  name: 'factory-idb',
  initialState: { name: 'Charlie', age: 35 },
  options: {},
})

// ─── Компонент-пример ───────────────────────────────────────────────────────

export function FactoryExample() {
  const [states, setStates] = useState<Record<string, UserState>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const storages = [memStorage, localStore, idbStore]

    Promise.all(storages.map((s) => s.initialize())).then(() => {
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

    const unsubs = storages.map((s) => s.subscribeToAll(() => refresh()))

    return () => {
      cancelled = true
      unsubs.forEach((u) => u())
    }
  }, [])

  if (!ready) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>StorageFactory</h2>
      <p>Фабрика для создания хранилищ. Альтернатива прямому <code>new MemoryStorage()</code>.</p>

      {/* ─── Типизированные методы ────────────────────────────────────── */}
      <h3 style={sectionTitle}>Типизированные методы</h3>
      <pre style={codeBlock}>{`import { StorageFactory } from 'synapse-storage/core'

interface UserState {
  name: string
  age: number
}

// createMemory → MemoryStorage<T> (sync)
const memStorage = StorageFactory.createMemory<UserState>({
  name: 'factory-memory',
  initialState: { name: 'Alice', age: 25 },
})

// createLocal → LocalStorage<T> (sync)
const localStore = StorageFactory.createLocal<UserState>({
  name: 'factory-local',
  initialState: { name: 'Bob', age: 30 },
})

// createIndexedDB → IndexedDBStorage<T> (async)
const idbStore = StorageFactory.createIndexedDB<UserState>({
  name: 'factory-idb',
  initialState: { name: 'Charlie', age: 35 },
  options: {},
})

// Инициализация каждого
await memStorage.initialize()
await localStore.initialize()
await idbStore.initialize()`}</pre>

      {/* ─── Универсальный create ─────────────────────────────────────── */}
      <h3 style={sectionTitle}>Универсальный create()</h3>
      <pre style={codeBlock}>{`// create() — выбор типа через поле type
// Возвращает ISyncStorage или IAsyncStorage в зависимости от type

const sync = StorageFactory.create<UserState>({
  type: 'memory',                 // → ISyncStorage<UserState>
  name: 'universal-mem',
  initialState: { name: 'A', age: 1 },
})

const sync = StorageFactory.create<UserState>({
  type: 'localStorage',           // → ISyncStorage<UserState>
  name: 'universal-local',
  initialState: { name: 'B', age: 2 },
})

const async = StorageFactory.create<UserState>({
  type: 'indexedDB',              // → IAsyncStorage<UserState>
  name: 'universal-idb',
  initialState: { name: 'C', age: 3 },
  options: {},
})`}</pre>

      {/* ─── Демо ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Демо</h3>
      {Object.entries(states).map(([key, st]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <strong>{key}:</strong> <code>{JSON.stringify(st)}</code>
          <div style={buttonRow}>
            <button onClick={() => {
              const store = key === 'memory' ? memStorage : key === 'local' ? localStore : idbStore
              store.set('age', (st.age || 0) + 1)
            }}>age +1</button>
            <button onClick={() => {
              const store = key === 'memory' ? memStorage : key === 'local' ? localStore : idbStore
              store.update((s) => { s.name = s.name + '!' })
            }}>name + !</button>
          </div>
        </div>
      ))}
    </div>
  )
}
