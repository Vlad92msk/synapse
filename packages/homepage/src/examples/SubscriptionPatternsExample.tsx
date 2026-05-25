import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import type { ISyncStorage } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ───────────────────────────────────────────────────────────────────

interface AppState {
  user: { name: string; email: string }
  settings: { theme: 'light' | 'dark'; lang: string }
  counter: number
}

// ─── Создание хранилища ─────────────────────────────────────────────────────

const storage = new MemoryStorage<AppState>({
  name: 'subscriptions-demo',
  initialState: {
    user: { name: 'John', email: 'john@test.com' },
    settings: { theme: 'light', lang: 'en' },
    counter: 0,
  },
})

// ─── Компонент ──────────────────────────────────────────────────────────────

export function SubscriptionPatternsExample() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    storage.initialize().then(() => setReady(true))
  }, [])

  if (!ready) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>Подписки (Subscriptions)</h2>
      <p>Все способы подписаться на изменения данных в хранилище. Работают одинаково для Memory, LocalStorage и IndexedDB.</p>

      {/* ─── Кнопки для изменений ─────────────────────────────────────── */}
      <h3 style={sectionTitle}>Изменить данные (для демо)</h3>
      <div style={buttonRow}>
        <button onClick={() => storage.update((s) => { s.counter++ })}>counter++</button>
        <button onClick={() => storage.set('user', { name: 'Jane', email: 'jane@test.com' })}>change user</button>
        <button onClick={() => storage.update((s) => { s.settings.theme = s.settings.theme === 'light' ? 'dark' : 'light' })}>toggle theme</button>
        <button onClick={() => storage.set('settings', { theme: 'light', lang: storage.getStateSync().settings.lang === 'en' ? 'ru' : 'en' })}>toggle lang</button>
        <button onClick={() => storage.reset()}>reset()</button>
      </div>

      {/* ─── 1. subscribe(key, callback) ─────────────────────────────── */}
      <h3 style={sectionTitle}>1. subscribe(key, callback)</h3>
      <pre style={codeBlock}>{`// Подписка на конкретный ключ верхнего уровня.
// Callback вызывается при каждом изменении этого ключа.

const unsub = storage.subscribe('counter', (newValue) => {
  console.log('counter changed:', newValue)  // number
})

const unsub = storage.subscribe('user', (newUser) => {
  console.log('user changed:', newUser)  // { name, email }
})

// Отписка
unsub()`}</pre>
      <SubscribeKeyDemo />

      {/* ─── 2. subscribe(selector, callback) ────────────────────────── */}
      <h3 style={sectionTitle}>2. subscribe(selector, callback)</h3>
      <pre style={codeBlock}>{`// Подписка через selector-функцию.
// Callback вызывается когда результат selector'а изменился.

const unsub = storage.subscribe(
  (state) => state.settings.theme,
  (newTheme) => console.log('theme:', newTheme)  // 'light' | 'dark'
)

// Можно подписаться на вложенные поля
const unsub = storage.subscribe(
  (state) => state.user.name,
  (name) => console.log('name:', name)
)

// Можно вычислять значения
const unsub = storage.subscribe(
  (state) => \`\${state.user.name} (\${state.settings.lang})\`,
  (computed) => console.log('computed:', computed)
)

unsub()`}</pre>
      <SubscribeSelectorDemo />

      {/* ─── 3. subscribeToAll(callback) ──────────────────────────────── */}
      <h3 style={sectionTitle}>3. subscribeToAll(callback)</h3>
      <pre style={codeBlock}>{`// Подписка на ВСЕ изменения хранилища.
// Callback получает event с информацией об изменении.

const unsub = storage.subscribeToAll((event) => {
  console.log(event.type)          // 'set' | 'update' | 'remove' | 'clear' | 'reset'
  console.log(event.key)           // ключ или массив ключей
  console.log(event.changedPaths)  // пути к изменённым полям
})

unsub()`}</pre>
      <SubscribeAllDemo />

      {/* ─── 4. useStorageSubscribe (React hook) ─────────────────────── */}
      <h3 style={sectionTitle}>4. useStorageSubscribe (React hook)</h3>
      <pre style={codeBlock}>{`import { useStorageSubscribe } from 'synapse-storage/react'

function MyComponent({ storage }: { storage: ISyncStorage<AppState> }) {
  // Подписка на одно поле
  const counter = useStorageSubscribe(storage, (s) => s.counter)

  // Подписка на вложенное поле
  const theme = useStorageSubscribe(storage, (s) => s.settings.theme)

  // Подписка на всё состояние
  const fullState = useStorageSubscribe(storage, (s) => s)

  // Вычисляемое значение — ререндер только при изменении результата
  const summary = useStorageSubscribe(
    storage,
    (s) => \`\${s.user.name}, counter: \${s.counter}\`
  )

  return <div>{counter} / {theme} / {summary}</div>
}`}</pre>
      <UseStorageSubscribeDemo storage={storage} />
    </div>
  )
}

// ─── Демо-компоненты ────────────────────────────────────────────────────────

function SubscribeKeyDemo() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    const unsub1 = storage.subscribe('counter', (value) => {
      setLog((prev) => [...prev.slice(-4), `counter → ${value}`])
    })
    const unsub2 = storage.subscribe('user', (value) => {
      setLog((prev) => [...prev.slice(-4), `user → ${JSON.stringify(value)}`])
    })
    return () => { unsub1(); unsub2() }
  }, [])

  return (
    <pre style={{ ...codeBlock, minHeight: 40 }}>
      {log.join('\n') || '(измените counter или user чтобы увидеть)'}
    </pre>
  )
}

function SubscribeSelectorDemo() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    const unsub1 = storage.subscribe(
      (s) => s.settings.theme,
      (theme) => setLog((prev) => [...prev.slice(-4), `theme → ${theme}`]),
    )
    const unsub2 = storage.subscribe(
      (s) => s.user.name,
      (name) => setLog((prev) => [...prev.slice(-4), `user.name → ${name}`]),
    )
    const unsub3 = storage.subscribe(
      (s) => `${s.user.name} (${s.settings.lang})`,
      (computed) => setLog((prev) => [...prev.slice(-4), `computed → ${computed}`]),
    )
    return () => { unsub1(); unsub2(); unsub3() }
  }, [])

  return (
    <pre style={{ ...codeBlock, minHeight: 40 }}>
      {log.join('\n') || '(измените user, theme или lang чтобы увидеть)'}
    </pre>
  )
}

function SubscribeAllDemo() {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    return storage.subscribeToAll((event) => {
      setLog((prev) => [...prev.slice(-4), `${event.type}: key=${JSON.stringify(event.key)}`])
    })
  }, [])

  return (
    <pre style={{ ...codeBlock, minHeight: 40 }}>
      {log.join('\n') || '(любое изменение покажется здесь)'}
    </pre>
  )
}

function UseStorageSubscribeDemo({ storage }: { storage: ISyncStorage<AppState> }) {
  const counter = useStorageSubscribe(storage, (s) => s.counter)
  const theme = useStorageSubscribe(storage, (s) => s.settings.theme)
  const fullState = useStorageSubscribe(storage, (s) => s)
  const summary = useStorageSubscribe(storage, (s) => `${s.user.name}, counter: ${s.counter}`)

  return (
    <div style={{ fontSize: 13 }}>
      <div><code>counter</code> = <strong>{counter}</strong></div>
      <div><code>theme</code> = <strong>{theme}</strong></div>
      <div><code>summary</code> = <strong>{summary}</strong></div>
      <div><code>fullState</code>:</div>
      <pre style={{ ...codeBlock, marginTop: 4 }}>{JSON.stringify(fullState, null, 2)}</pre>
    </div>
  )
}
