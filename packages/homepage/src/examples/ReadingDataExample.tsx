import { useState, useEffect } from 'react'
import { MemoryStorage, IndexedDBStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ───────────────────────────────────────────────────────────────────

interface UserState {
  name: string
  age: number
  role: 'admin' | 'user'
}

// ─── Sync Storage (MemoryStorage) ──────────────────────────────────────────

const syncStorage = new MemoryStorage<UserState>({
  name: 'reading-sync',
  initialState: { name: 'Alice', age: 28, role: 'admin' },
})

// ─── Async Storage (IndexedDBStorage) ──────────────────────────────────────

const asyncStorage = new IndexedDBStorage<UserState>({
  name: 'reading-async',
  initialState: { name: 'Bob', age: 35, role: 'user' },
  options: {},
})

// ─── Компонент ──────────────────────────────────────────────────────────────

export function ReadingDataExample() {
  const [ready, setReady] = useState(false)
  const [syncState, setSyncState] = useState<UserState | null>(null)
  const [asyncState, setAsyncState] = useState<UserState | null>(null)
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => setLog((prev) => [...prev.slice(-7), msg])

  useEffect(() => {
    let cancelled = false

    Promise.all([syncStorage.initialize(), asyncStorage.initialize()]).then(() => {
      if (cancelled) return
      setReady(true)
      setSyncState(syncStorage.getStateSync())
      setAsyncState(asyncStorage.getStateSync())
    })

    const unsub1 = syncStorage.subscribeToAll(() => setSyncState(syncStorage.getStateSync()))
    const unsub2 = asyncStorage.subscribeToAll(() => setAsyncState(asyncStorage.getStateSync()))

    return () => {
      cancelled = true
      unsub1()
      unsub2()
    }
  }, [])

  if (!ready) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>Чтение данных</h2>
      <p>Все способы прочитать данные из хранилища. Синхронные хранилища (Memory, LocalStorage) и асинхронные (IndexedDB).</p>

      {/* ─── get() ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>get(key) — чтение одного поля</h3>
      <pre style={codeBlock}>{`// ── Sync Storage (MemoryStorage / LocalStorage) ──

const name = storage.get<string>('name')     // 'Alice'
const age = storage.get<number>('age')       // 28
const missing = storage.get<string>('xxx')   // undefined

// ── Async Storage (IndexedDBStorage) ──

const name = await storage.get<string>('name')   // 'Bob'
const age = await storage.get<number>('age')     // 35`}</pre>

      <p><strong>Sync storage:</strong> <code>{JSON.stringify(syncState)}</code></p>
      <div style={buttonRow}>
        <button onClick={() => addLog(`sync get('name') = ${JSON.stringify(syncStorage.get<string>('name'))}`)}>
          get('name')
        </button>
        <button onClick={() => addLog(`sync get('age') = ${syncStorage.get<number>('age')}`)}>
          get('age')
        </button>
        <button onClick={() => addLog(`sync get('role') = ${JSON.stringify(syncStorage.get<string>('role'))}`)}>
          get('role')
        </button>
      </div>

      <p><strong>Async storage:</strong> <code>{JSON.stringify(asyncState)}</code></p>
      <div style={buttonRow}>
        <button onClick={async () => addLog(`async get('name') = ${JSON.stringify(await asyncStorage.get<string>('name'))}`)}>
          await get('name')
        </button>
        <button onClick={async () => addLog(`async get('age') = ${await asyncStorage.get<number>('age')}`)}>
          await get('age')
        </button>
      </div>

      {/* ─── getState() ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>getState() — всё состояние целиком</h3>
      <pre style={codeBlock}>{`// ── Sync Storage ──

const state = storage.getState()
// { name: 'Alice', age: 28, role: 'admin' }

// ── Async Storage ──

const state = await storage.getState()
// { name: 'Bob', age: 35, role: 'user' }`}</pre>

      <div style={buttonRow}>
        <button onClick={() => addLog(`sync getState() = ${JSON.stringify(syncStorage.getState())}`)}>
          sync getState()
        </button>
        <button onClick={async () => addLog(`async getState() = ${JSON.stringify(await asyncStorage.getState())}`)}>
          async await getState()
        </button>
      </div>

      {/* ─── getStateSync() ──────────────────────────────────────────── */}
      <h3 style={sectionTitle}>getStateSync() — синхронное чтение из кеша</h3>
      <pre style={codeBlock}>{`// Доступен на ВСЕХ типах хранилищ — и sync, и async.
// Читает из внутреннего кеша, не обращается к IndexedDB.
// Работает только после initialize().

// Sync Storage — аналогично getState()
const state = storage.getStateSync()

// Async Storage — синхронный доступ к кешу!
const state = asyncStorage.getStateSync()
// Полезно когда не хотите await, например в render`}</pre>

      <div style={buttonRow}>
        <button onClick={() => addLog(`sync getStateSync() = ${JSON.stringify(syncStorage.getStateSync())}`)}>
          sync getStateSync()
        </button>
        <button onClick={() => addLog(`async getStateSync() = ${JSON.stringify(asyncStorage.getStateSync())}`)}>
          async getStateSync() (no await!)
        </button>
      </div>

      {/* ─── has() / keys() ──────────────────────────────────────────── */}
      <h3 style={sectionTitle}>has(key) / keys() — проверка и перечисление</h3>
      <pre style={codeBlock}>{`// ── Sync Storage ──

storage.has('name')     // true
storage.has('unknown')  // false
storage.keys()          // ['name', 'age', 'role']

// ── Async Storage ──

await storage.has('name')     // true
await storage.has('unknown')  // false
await storage.keys()          // ['name', 'age', 'role']`}</pre>

      <div style={buttonRow}>
        <button onClick={() => addLog(`sync has('name') = ${syncStorage.has('name')}`)}>
          sync has('name')
        </button>
        <button onClick={() => addLog(`sync keys() = ${JSON.stringify(syncStorage.keys())}`)}>
          sync keys()
        </button>
        <button onClick={async () => addLog(`async has('name') = ${await asyncStorage.has('name')}`)}>
          async await has('name')
        </button>
        <button onClick={async () => addLog(`async keys() = ${JSON.stringify(await asyncStorage.keys())}`)}>
          async await keys()
        </button>
      </div>

      {/* ─── Управление данными для демо ─────────────────────────────── */}
      <h3 style={sectionTitle}>Изменить данные (для демо)</h3>
      <div style={buttonRow}>
        <button onClick={() => syncStorage.set('age', (syncState?.age ?? 0) + 1)}>sync: age +1</button>
        <button onClick={() => syncStorage.set('name', syncState?.name === 'Alice' ? 'Charlie' : 'Alice')}>sync: toggle name</button>
        <button onClick={() => asyncStorage.set('age', (asyncState?.age ?? 0) + 1)}>async: age +1</button>
        <button onClick={() => asyncStorage.set('role', asyncState?.role === 'user' ? 'admin' : 'user')}>async: toggle role</button>
        <button onClick={() => { syncStorage.reset(); asyncStorage.reset() }}>reset both</button>
      </div>

      {/* ─── Лог ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Результаты</h3>
      <pre style={{ ...codeBlock, minHeight: 60 }}>{log.join('\n') || '(нажмите кнопки выше чтобы увидеть результаты)'}</pre>
    </div>
  )
}
