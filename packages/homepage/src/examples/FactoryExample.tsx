import { useState, useEffect } from 'react'
import { StorageFactory, MemoryStorage, LocalStorage } from 'synapse-storage/core'
import type { IStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow } from './styles'

interface UserState {
  name: string
  age: number
}

/**
 * Пример 4: Создание хранилищ через StorageFactory
 * Три варианта: createMemory, createLocal, и универсальный create
 */
export function FactoryExample() {
  // Вариант 1: StorageFactory.createMemory
  const [memStorage] = useState(() =>
    StorageFactory.createMemory<UserState>({
      name: 'factory-memory',
      initialState: { name: 'Alice', age: 25 },
    }),
  )

  // Вариант 2: StorageFactory.createLocal
  const [localStore] = useState(() =>
    StorageFactory.createLocal<UserState>({
      name: 'factory-local',
      initialState: { name: 'Bob', age: 30 },
    }),
  )

  // Вариант 3: StorageFactory.create (универсальный, возвращает IStorage)
  const [universalStore] = useState(() =>
    StorageFactory.create<UserState>({
      name: 'factory-universal',
      type: 'memory',
      initialState: { name: 'Charlie', age: 35 },
    }),
  )

  const [readyCount, setReadyCount] = useState(0)
  const [states, setStates] = useState<Record<string, UserState>>({})

  useEffect(() => {
    let cancelled = false
    const storages = [memStorage, localStore, universalStore]

    Promise.all(storages.map((s) => s.initialize())).then(() => {
      if (cancelled) return
      setReadyCount(3)
      refreshStates()
    })

    function refreshStates() {
      setStates({
        memory: memStorage.getStateSync(),
        local: localStore.getStateSync(),
        universal: universalStore.getStateSync(),
      })
    }

    const unsubs = storages.map((s) =>
      s.subscribeToAll(() => refreshStates()),
    )

    return () => {
      cancelled = true
      unsubs.forEach((u) => u())
      storages.forEach((s) => s.destroy())
    }
  }, [memStorage, localStore, universalStore])

  if (readyCount < 3) return <div>Initializing factories...</div>

  return (
    <div style={cardStyle}>
      <h2>StorageFactory</h2>

      <h4>createMemory → MemoryStorage</h4>
      <StorageControls storage={memStorage} state={states.memory} label="memory" />

      <h4>createLocal → LocalStorage</h4>
      <StorageControls storage={localStore} state={states.local} label="local" />

      <h4>create(type: 'memory') → IStorage</h4>
      <StorageControls storage={universalStore} state={states.universal} label="universal" />

      <h4>Проверка типов:</h4>
      <ul>
        <li><code>memStorage instanceof MemoryStorage</code> → <strong>{String(memStorage instanceof MemoryStorage)}</strong></li>
        <li><code>localStore instanceof LocalStorage</code> → <strong>{String(localStore instanceof LocalStorage)}</strong></li>
        <li><code>universalStore instanceof MemoryStorage</code> → <strong>{String(universalStore instanceof MemoryStorage)}</strong></li>
      </ul>
    </div>
  )
}

function StorageControls({ storage, state, label }: { storage: IStorage<UserState>; state?: UserState; label: string }) {
  if (!state) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <p>{label}: {JSON.stringify(state)}</p>
      <div style={buttonRow}>
        <button onClick={() => storage.set('age', (state.age || 0) + 1)}>age +1</button>
        <button onClick={() => storage.update((s) => { s.name = s.name + '!' })}>name + !</button>
      </div>
    </div>
  )
}
