import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

interface CounterState {
  count: number
  label: string
}

// ─── Создание хранилища ─────────────────────────────────────────────────────

const storage = new MemoryStorage<CounterState>({
  name: 'memory-counter',
  initialState: { count: 0, label: 'clicks' },
})

// ─── Компонент-пример ───────────────────────────────────────────────────────

export function MemoryStorageExample() {
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
    const unsub = storage.subscribeToAll(() => setState(storage.getStateSync()))
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  if (!isReady) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>MemoryStorage</h2>
      <p>In-memory хранилище. Данные живут только пока открыта страница. Синхронное API.</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'

interface CounterState {
  count: number
  label: string
}

// Через new
const storage = new MemoryStorage<CounterState>({
  name: 'memory-counter',
  initialState: { count: 0, label: 'clicks' },
})

// Или через static .create()
const storage = MemoryStorage.create<CounterState>({
  name: 'memory-counter',
  initialState: { count: 0, label: 'clicks' },
})

// Инициализация (обязательна)
await storage.initialize()`}</pre>

      {/* ─── Запись ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Запись данных</h3>
      <pre style={codeBlock}>{`// set() — установить значение по ключу
storage.set('count', 5)
storage.set('label', 'taps')

// update() — изменить несколько полей за раз (immer-like)
storage.update((s) => {
  s.count += 10
  s.label = 'updated'
})`}</pre>

      <p>State: <code>{JSON.stringify(state)}</code></p>
      <div style={buttonRow}>
        <button onClick={() => storage.set('count', state.count + 1)}>set('count', +1)</button>
        <button onClick={() => storage.update((s) => { s.count += 10 })}>update(s =&gt; s.count += 10)</button>
        <button onClick={() => storage.set('label', state.label === 'clicks' ? 'taps' : 'clicks')}>toggle label</button>
      </div>

      {/* ─── Чтение ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Чтение данных</h3>
      <pre style={codeBlock}>{`// get() — получить значение по ключу
const count = storage.get<number>('count')     // 5
const label = storage.get<string>('label')     // 'clicks'

// getState() — получить всё состояние целиком
const state = storage.getState()               // { count: 5, label: 'clicks' }

// getStateSync() — то же самое для sync-хранилищ
const state = storage.getStateSync()           // { count: 5, label: 'clicks' }`}</pre>

      <div style={buttonRow}>
        <button onClick={() => alert(`get('count') = ${storage.get<number>('count')}`)}>get('count')</button>
        <button onClick={() => alert(`getState() = ${JSON.stringify(storage.getState())}`)}>getState()</button>
      </div>

      {/* ─── Проверка и удаление ──────────────────────────────────────── */}
      <h3 style={sectionTitle}>Проверка, удаление, сброс</h3>
      <pre style={codeBlock}>{`// has() — проверить наличие ключа
storage.has('count')   // true
storage.has('unknown') // false

// keys() — получить список ключей
storage.keys()         // ['count', 'label']

// remove() — удалить конкретный ключ
storage.remove('label')

// clear() — очистить всё хранилище (state = {})
storage.clear()

// reset() — сбросить к initialState
storage.reset()        // state = { count: 0, label: 'clicks' }`}</pre>

      <div style={buttonRow}>
        <button onClick={() => alert(`has('count') = ${storage.has('count')}`)}>has('count')</button>
        <button onClick={() => alert(`keys() = ${JSON.stringify(storage.keys())}`)}>keys()</button>
        <button onClick={() => storage.remove('label')}>remove('label')</button>
        <button onClick={() => storage.clear()}>clear()</button>
        <button onClick={() => storage.reset()}>reset()</button>
      </div>

      {/* ─── Подписки ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Подписки</h3>
      <pre style={codeBlock}>{`// Подписка на конкретный ключ
const unsub = storage.subscribe('count', (newValue) => {
  console.log('count changed:', newValue)
})

// Подписка через path-selector
const unsub = storage.subscribe(
  (state) => state.count,
  (newCount) => console.log('count:', newCount)
)

// Подписка на все изменения
const unsub = storage.subscribeToAll((event) => {
  console.log('changed:', event)
})

// Отписка
unsub()`}</pre>

      <SubscribeDemo />

      {/* ─── Lifecycle ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Lifecycle</h3>
      <pre style={codeBlock}>{`// Инициализация
await storage.initialize()

// Ожидание готовности
await storage.waitForReady()

// Статус
storage.initStatus  // { status: 'ready' }

// Подписка на изменение статуса
const unsub = storage.onStatusChange((status) => {
  console.log(status) // { status: 'ready' | 'loading' | 'error' | 'idle' }
})

// Уничтожение
await storage.destroy()`}</pre>
    </div>
  )
}

function SubscribeDemo() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    const unsub = storage.subscribe('count', (value) => {
      setLog((prev) => [...prev.slice(-4), `count → ${value}`])
    })
    return unsub
  }, [])

  return (
    <div>
      <p>subscribe('count', cb) log:</p>
      <pre style={{ ...codeBlock, minHeight: 40 }}>{log.join('\n') || '(измените count чтобы увидеть)'}</pre>
    </div>
  )
}
