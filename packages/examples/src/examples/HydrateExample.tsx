import { useCallback, useState } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { buttonRow, cardStyle, codeBlock, sectionTitle } from './styles'

interface AppState extends Record<string, any> {
  user: string | null
  items: string[]
}

const DEFAULT_STATE: AppState = { user: null, items: [] }
// Состояние, как будто пришло с сервера (SSR).
const SERVER_STATE: AppState = { user: 'server-user', items: ['a', 'b', 'c'] }

let uid = 0

function HydrateBeforeInitDemo() {
  const [result, setResult] = useState<AppState | null>(null)

  const run = useCallback(async () => {
    const storage = new MemoryStorage<AppState>({ name: `hy-before-${uid++}`, initialState: DEFAULT_STATE })

    // hydrate ДО initialize() — серверное состояние побеждает, initialState не перезатирает.
    storage.hydrate(SERVER_STATE)
    await storage.initialize()

    setResult(storage.getState())
    await storage.destroy()
  }, [])

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={run}>hydrate() → initialize()</button>
      </div>
      <p>
        getState(): <strong>{result ? JSON.stringify(result) : '—'}</strong>
        {result && <span style={{ color: '#2a7' }}> ← серверное состояние, не дефолт</span>}
      </p>
    </div>
  )
}

function HydrateAfterInitDemo() {
  const [storage] = useState(() => new MemoryStorage<AppState>({ name: `hy-after-${uid++}`, initialState: DEFAULT_STATE }))
  const [state, setState] = useState<AppState>(DEFAULT_STATE)
  const [ready, setReady] = useState(false)

  const init = useCallback(async () => {
    await storage.initialize()
    // Подписка покажет реактивное обновление при hydrate после initialize.
    storage.subscribeToAll(() => setState(storage.getStateSync()))
    setState(storage.getStateSync())
    setReady(true)
  }, [storage])

  const hydrate = useCallback(() => {
    storage.hydrate(SERVER_STATE) // заменяет состояние и уведомляет подписчиков
  }, [storage])

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={init} disabled={ready}>
          initialize()
        </button>
        <button onClick={hydrate} disabled={!ready}>
          hydrate(serverState)
        </button>
      </div>
      <p>
        состояние: <strong>{JSON.stringify(state)}</strong>
      </p>
    </div>
  )
}

export function HydrateExample() {
  return (
    <div style={cardStyle}>
      <h2>SSR-гидрация (hydrate)</h2>
      <p>
        <code>storage.hydrate(state)</code> заменяет состояние готовым снапшотом. Основной
        сценарий — SSR: сервер сериализует состояние, клиент инициализирует им хранилище.
        Sync-хранилища возвращают <code>void</code>, async (IndexedDB) — <code>Promise</code>.
      </p>

      <h3 style={sectionTitle}>1. Гидрация ДО initialize()</h3>
      <p>Засевает хранилище — инициализация не перезатирает его дефолтным `initialState`.</p>
      <pre style={codeBlock}>{`const storage = new MemoryStorage<AppState>({
  name: 'app',
  initialState: { user: null, items: [] },   // дефолт для «чистого» клиента
})

storage.hydrate(window.__INITIAL_STATE__)     // данные с сервера
await storage.initialize()                     // initialState НЕ перезатрёт гидрацию`}</pre>
      <HydrateBeforeInitDemo />

      <h3 style={sectionTitle}>2. Гидрация ПОСЛЕ initialize()</h3>
      <p>Заменяет состояние и уведомляет подписчиков (селекторы/хуки обновятся реактивно).</p>
      <pre style={codeBlock}>{`await storage.initialize()

// позже — например при навигации в SPA с серверными данными
storage.hydrate(nextPageState)
// подписчики получат новое состояние`}</pre>
      <HydrateAfterInitDemo />

      <h3 style={sectionTitle}>С persist-миграциями</h3>
      <pre style={codeBlock}>{`// Если задана version, hydrate фиксирует текущую версию схемы:
// серверный снапшот считается актуальным — миграция на нём не запускается.

// В createSynapse hydrate доступен на synapse.storage:
const synapse = await appSynapse.ready()
synapse.storage.hydrate(serverState)`}</pre>
    </div>
  )
}
