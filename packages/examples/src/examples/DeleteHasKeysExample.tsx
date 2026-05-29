import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ───────────────────────────────────────────────────────────────────

interface DemoState {
  name: string
  age: number
  role: string
  active: boolean
}

// ─── Создание хранилища ─────────────────────────────────────────────────────

const storage = new MemoryStorage<DemoState>({
  name: 'operations-demo',
  initialState: { name: 'Alice', age: 28, role: 'admin', active: true },
})

// ─── Компонент ──────────────────────────────────────────────────────────────

export function DeleteHasKeysExample() {
  const [state, setState] = useState<DemoState | null>(null)
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => setLog((prev) => [...prev.slice(-7), msg])

  useEffect(() => {
    let cancelled = false
    storage.initialize().then(() => {
      if (!cancelled) setState(storage.getStateSync())
    })
    const unsub = storage.subscribeToAll(() => setState(storage.getStateSync()))
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  if (!state) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>remove / has / keys / clear / reset</h2>
      <p>Операции проверки наличия, удаления ключей и сброса хранилища. Работают одинаково для всех типов хранилищ.</p>

      <p>Текущий state: <code>{JSON.stringify(state)}</code></p>

      {/* ─── has() ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>has(key) — проверить наличие ключа</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<DemoState>({
  name: 'my-store',
  initialState: { name: 'Alice', age: 28, role: 'admin', active: true },
})
await storage.initialize()

// ── Sync Storage (MemoryStorage / LocalStorage) ──

storage.has('name')      // true
storage.has('age')       // true
storage.has('unknown')   // false

// ── Async Storage (IndexedDBStorage) ──

await storage.has('name')      // true
await storage.has('unknown')   // false`}</pre>

      <div style={buttonRow}>
        <button onClick={() => addLog(`has('name') = ${storage.has('name')}`)}>has('name')</button>
        <button onClick={() => addLog(`has('age') = ${storage.has('age')}`)}>has('age')</button>
        <button onClick={() => addLog(`has('role') = ${storage.has('role')}`)}>has('role')</button>
        <button onClick={() => addLog(`has('active') = ${storage.has('active')}`)}>has('active')</button>
      </div>

      {/* ─── keys() ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>keys() — получить все ключи</h3>
      <pre style={codeBlock}>{`// ── Sync ──
const allKeys = storage.keys()
// ['name', 'age', 'role', 'active']

// ── Async ──
const allKeys = await storage.keys()`}</pre>

      <div style={buttonRow}>
        <button onClick={() => addLog(`keys() = ${JSON.stringify(storage.keys())}`)}>keys()</button>
      </div>

      {/* ─── remove() ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>remove(key) — удалить конкретный ключ</h3>
      <pre style={codeBlock}>{`// Удаляет ключ из хранилища.
// После удаления has(key) вернёт false, keys() не будет содержать этот ключ.

// ── Sync ──
storage.remove('role')
storage.has('role')   // false
storage.keys()        // ['name', 'age', 'active']

// ── Async ──
await storage.remove('role')`}</pre>

      <div style={buttonRow}>
        <button onClick={() => { storage.remove('name'); addLog("remove('name')") }}>remove('name')</button>
        <button onClick={() => { storage.remove('age'); addLog("remove('age')") }}>remove('age')</button>
        <button onClick={() => { storage.remove('role'); addLog("remove('role')") }}>remove('role')</button>
        <button onClick={() => { storage.remove('active'); addLog("remove('active')") }}>remove('active')</button>
      </div>

      {/* ─── clear() ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>clear() — очистить хранилище</h3>
      <pre style={codeBlock}>{`// Удаляет ВСЕ ключи. State становится пустым объектом {}.

// ── Sync ──
storage.clear()
storage.getState()   // {}
storage.keys()       // []

// ── Async ──
await storage.clear()`}</pre>

      <div style={buttonRow}>
        <button onClick={() => { storage.clear(); addLog('clear() → state = {}') }}>clear()</button>
      </div>

      {/* ─── reset() ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>reset() — сброс к initialState</h3>
      <pre style={codeBlock}>{`// Возвращает state к начальному значению (initialState из конфига).
// Разница с clear():
//   clear() → state = {}
//   reset() → state = initialState

// ── Sync ──
storage.reset()
storage.getState()   // { name: 'Alice', age: 28, role: 'admin', active: true }

// ── Async ──
await storage.reset()`}</pre>

      <div style={buttonRow}>
        <button onClick={() => { storage.reset(); addLog('reset() → state = initialState') }}>reset()</button>
      </div>

      {/* ─── clear vs reset ──────────────────────────────────────────── */}
      <h3 style={sectionTitle}>clear() vs reset() — разница</h3>
      <pre style={codeBlock}>{`const storage = new MemoryStorage({
  name: 'example',
  initialState: { count: 0, label: 'hello' },
})

storage.set('count', 99)
storage.set('label', 'world')

// clear() — полная очистка
storage.clear()
storage.getState()   // {}
storage.keys()       // []

// reset() — возврат к initialState
storage.reset()
storage.getState()   // { count: 0, label: 'hello' }
storage.keys()       // ['count', 'label']`}</pre>

      {/* ─── Лог ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Результаты</h3>
      <pre style={{ ...codeBlock, minHeight: 60 }}>{log.join('\n') || '(нажмите кнопки выше чтобы увидеть результаты)'}</pre>
    </div>
  )
}
