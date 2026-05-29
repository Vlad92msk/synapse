import { useState, useEffect } from 'react'
import { LocalStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

interface ThemeState {
  theme: 'light' | 'dark'
  fontSize: number
}

// ─── Создание хранилища ─────────────────────────────────────────────────────

const storage = new LocalStorage<ThemeState>({
  name: 'theme-settings',
  initialState: { theme: 'light', fontSize: 14 },
})

// ─── Компонент-пример ───────────────────────────────────────────────────────

export function LocalStorageExample() {
  const [state, setState] = useState<ThemeState>({ theme: 'light', fontSize: 14 })
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
      <h2>LocalStorage</h2>
      <p>Данные сохраняются в <code>localStorage</code> браузера. Переживают перезагрузку страницы. Синхронное API (идентично MemoryStorage).</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { LocalStorage } from 'synapse-storage/core'

interface ThemeState {
  theme: 'light' | 'dark'
  fontSize: number
}

// Через new
const storage = new LocalStorage<ThemeState>({
  name: 'theme-settings',           // ключ в localStorage
  initialState: { theme: 'light', fontSize: 14 },
})

// Или через static .create()
const storage = LocalStorage.create<ThemeState>({
  name: 'theme-settings',
  initialState: { theme: 'light', fontSize: 14 },
})

// Инициализация — загрузит данные из localStorage если есть
await storage.initialize()`}</pre>

      {/* ─── Запись ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Запись данных</h3>
      <pre style={codeBlock}>{`// set() — установить значение по ключу
storage.set('theme', 'dark')
storage.set('fontSize', 16)

// update() — изменить несколько полей за раз
storage.update((s) => {
  s.theme = 'dark'
  s.fontSize = 18
})`}</pre>

      <p>State: <code>{JSON.stringify(state)}</code></p>
      <div style={buttonRow}>
        <button onClick={() => storage.set('theme', state.theme === 'light' ? 'dark' : 'light')}>toggle theme</button>
        <button onClick={() => storage.set('fontSize', state.fontSize + 2)}>fontSize +2</button>
        <button onClick={() => storage.set('fontSize', state.fontSize - 2)}>fontSize -2</button>
        <button onClick={() => storage.update((s) => { s.theme = 'dark'; s.fontSize = 20 })}>update(batch)</button>
      </div>

      {/* ─── Чтение ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Чтение данных</h3>
      <pre style={codeBlock}>{`// Все методы идентичны MemoryStorage:
const theme = storage.get<string>('theme')     // 'dark'
const state = storage.getState()               // { theme: 'dark', fontSize: 16 }
const state = storage.getStateSync()           // то же самое`}</pre>

      <div style={buttonRow}>
        <button onClick={() => alert(`get('theme') = ${storage.get<string>('theme')}`)}>get('theme')</button>
        <button onClick={() => alert(`getState() = ${JSON.stringify(storage.getState())}`)}>getState()</button>
      </div>

      {/* ─── Проверка и удаление ──────────────────────────────────────── */}
      <h3 style={sectionTitle}>Проверка, удаление, сброс</h3>
      <pre style={codeBlock}>{`// Все методы идентичны MemoryStorage:
storage.has('theme')     // true
storage.keys()           // ['theme', 'fontSize']
storage.remove('theme')  // удалить ключ
storage.clear()          // очистить всё (state = {})
storage.reset()          // вернуть к initialState`}</pre>

      <div style={buttonRow}>
        <button onClick={() => alert(`has('theme') = ${storage.has('theme')}`)}>has('theme')</button>
        <button onClick={() => alert(`keys() = ${JSON.stringify(storage.keys())}`)}>keys()</button>
        <button onClick={() => storage.remove('fontSize')}>remove('fontSize')</button>
        <button onClick={() => storage.clear()}>clear()</button>
        <button onClick={() => storage.reset()}>reset()</button>
      </div>

      {/* ─── Подписки ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Подписки</h3>
      <pre style={codeBlock}>{`// Идентичны MemoryStorage:
const unsub = storage.subscribe('theme', (newValue) => {
  console.log('theme changed:', newValue)
})

const unsub = storage.subscribe(
  (state) => state.fontSize,
  (newSize) => console.log('fontSize:', newSize)
)

const unsub = storage.subscribeToAll((event) => {
  console.log('changed:', event)
})`}</pre>

      <SubscribeDemo />

      {/* ─── Отличия от MemoryStorage ─────────────────────────────────── */}
      <h3 style={sectionTitle}>Отличия от MemoryStorage</h3>
      <pre style={codeBlock}>{`// API полностью идентичен MemoryStorage.
// Единственное отличие — данные персистятся в localStorage браузера.
// При initialize() данные загружаются из localStorage.
// При set/update/clear/reset данные автоматически синхронизируются.
// Ключ в localStorage = значение поля name в конфиге.`}</pre>
    </div>
  )
}

function SubscribeDemo() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    const unsub = storage.subscribe('theme', (value) => {
      setLog((prev) => [...prev.slice(-4), `theme → ${value}`])
    })
    return unsub
  }, [])

  return (
    <div>
      <p>subscribe('theme', cb) log:</p>
      <pre style={{ ...codeBlock, minHeight: 40 }}>{log.join('\n') || '(измените theme чтобы увидеть)'}</pre>
    </div>
  )
}
