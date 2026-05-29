import { useState, useEffect } from 'react'
import { IndexedDBStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

interface TodoState {
  items: string[]
  filter: 'all' | 'active'
}

// ─── Создание хранилища ─────────────────────────────────────────────────────

const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: {},                    // обязательное поле, можно пустой объект
})

// ─── Компонент-пример ───────────────────────────────────────────────────────

export function IndexedDBExample() {
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
    const unsub = storage.subscribeToAll(() => setState(storage.getStateSync()))
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  if (!isReady) return <div>Initializing IndexedDBStorage...</div>

  return (
    <div style={cardStyle}>
      <h2>IndexedDBStorage</h2>
      <p>Данные хранятся в IndexedDB. Переживают перезагрузку. <strong>Асинхронное API</strong> — все методы возвращают Promise.</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { IndexedDBStorage } from 'synapse-storage/core'

interface TodoState {
  items: string[]
  filter: 'all' | 'active'
}

// Через new (options — обязательное поле)
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: {},                     // можно пустой объект
})

// С кастомным dbName
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: { dbName: 'my_app_db' }, // по умолчанию 'app_storage'
})

// Или через static .create()
const storage = IndexedDBStorage.create<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: {},
})

// Инициализация (обязательна)
await storage.initialize()`}</pre>

      {/* ─── Запись ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Запись данных (async!)</h3>
      <pre style={codeBlock}>{`// set() — возвращает Promise
await storage.set('filter', 'active')
await storage.set('items', ['Buy milk', 'Walk dog'])

// update() — возвращает Promise
await storage.update((s) => {
  s.items.push('New item')
  s.filter = 'all'
})`}</pre>

      <p>State: <code>{JSON.stringify(state)}</code></p>
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
        <button onClick={() => storage.set('filter', state.filter === 'all' ? 'active' : 'all')}>
          toggle filter
        </button>
      </div>

      <ul>
        {state.items.map((item, i) => (
          <li key={i}>
            {item}
            <button style={{ marginLeft: 8 }} onClick={() =>
              storage.update((s) => { s.items.splice(i, 1) })
            }>x</button>
          </li>
        ))}
      </ul>

      {/* ─── Чтение ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Чтение данных (async!)</h3>
      <pre style={codeBlock}>{`// get() — возвращает Promise
const items = await storage.get<string[]>('items')   // ['Buy milk']
const filter = await storage.get<string>('filter')   // 'all'

// getState() — возвращает Promise
const state = await storage.getState()               // { items: [...], filter: 'all' }

// getStateSync() — синхронное чтение из кеша (доступно всегда!)
const state = storage.getStateSync()                 // { items: [...], filter: 'all' }`}</pre>

      <div style={buttonRow}>
        <button onClick={async () => alert(`get('items') = ${JSON.stringify(await storage.get('items'))}`)}>await get('items')</button>
        <button onClick={async () => alert(`getState() = ${JSON.stringify(await storage.getState())}`)}>await getState()</button>
        <button onClick={() => alert(`getStateSync() = ${JSON.stringify(storage.getStateSync())}`)}>getStateSync()</button>
      </div>

      {/* ─── Проверка и удаление ──────────────────────────────────────── */}
      <h3 style={sectionTitle}>Проверка, удаление, сброс (async!)</h3>
      <pre style={codeBlock}>{`// Все методы возвращают Promise:
await storage.has('items')      // true
await storage.keys()            // ['items', 'filter']
await storage.remove('filter')  // удалить ключ
await storage.clear()           // очистить всё (state = {})
await storage.reset()           // вернуть к initialState`}</pre>

      <div style={buttonRow}>
        <button onClick={async () => alert(`has('items') = ${await storage.has('items')}`)}>await has('items')</button>
        <button onClick={async () => alert(`keys() = ${JSON.stringify(await storage.keys())}`)}>await keys()</button>
        <button onClick={() => storage.remove('filter')}>remove('filter')</button>
        <button onClick={() => storage.clear()}>clear()</button>
        <button onClick={() => storage.reset()}>reset()</button>
      </div>

      {/* ─── Подписки ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Подписки (одинаковы для всех типов!)</h3>
      <pre style={codeBlock}>{`// Подписки работают одинаково для sync и async хранилищ:
const unsub = storage.subscribe('items', (newValue) => {
  console.log('items changed:', newValue)
})

const unsub = storage.subscribe(
  (state) => state.items.length,
  (count) => console.log('items count:', count)
)

const unsub = storage.subscribeToAll((event) => {
  console.log('changed:', event)
})`}</pre>

      <SubscribeDemo />

      {/* ─── Отличия от sync-хранилищ ─────────────────────────────────── */}
      <h3 style={sectionTitle}>Отличия от MemoryStorage/LocalStorage</h3>
      <pre style={codeBlock}>{`// 1. Конфиг требует поле options (даже пустой объект)
//    { name, initialState, options: {} }
//    vs { name, initialState }

// 2. Все операции записи/чтения возвращают Promise:
//    await storage.set(...)   vs  storage.set(...)
//    await storage.get(...)   vs  storage.get(...)
//    await storage.has(...)   vs  storage.has(...)

// 3. getStateSync() — общий для всех, работает из кеша

// 4. Подписки идентичны для всех типов хранилищ`}</pre>
    </div>
  )
}

function SubscribeDemo() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    const unsub = storage.subscribe(
      (s) => s.items.length,
      (count) => setLog((prev) => [...prev.slice(-4), `items.length → ${count}`]),
    )
    return unsub
  }, [])

  return (
    <div>
      <p>subscribe(s =&gt; s.items.length, cb) log:</p>
      <pre style={{ ...codeBlock, minHeight: 40 }}>{log.join('\n') || '(добавьте/удалите todo чтобы увидеть)'}</pre>
    </div>
  )
}
