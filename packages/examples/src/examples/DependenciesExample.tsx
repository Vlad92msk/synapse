import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'
import { useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Auth Store (от него зависят другие) ───────────────────────────────────────

interface AuthState {
  token: string | null
  userId: string | null
}

const authStorePromise = createSynapse({
  createStorageFn: async () => {
    // Имитация async авторизации
    await new Promise((r) => setTimeout(r, 1000))
    const storage = new MemoryStorage<AuthState>({
      name: 'auth-dep',
      initialState: { token: 'jwt-123', userId: 'user-1' },
    })
    storage.initialize()
    return storage
  },

  createSelectorsFn: (sm) => ({
    token: sm.createSelector((s) => s.token),
    userId: sm.createSelector((s) => s.userId),
  }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_s, { createAction }) => ({
      login: createAction({
        type: 'login',
        action: (userId: string) => {
          storage.update((s) => { s.token = `jwt-${userId}`; s.userId = userId })
        },
      }),
      logout: createAction({
        type: 'logout',
        action: () => {
          storage.update((s) => { s.token = null; s.userId = null })
        },
      }),
    })),
})

// ─── Settings Store (зависит от Auth) ──────────────────────────────────────────

interface SettingsState {
  theme: string
  loadedForUser: string | null
}

const settingsStorePromise = createSynapse({
  dependencies: [authStorePromise],
  dependencyTimeout: 5000,

  createStorageFn: async () => {
    const authStore = await authStorePromise
    const userId = authStore.storage.getStateSync().userId

    const storage = new MemoryStorage<SettingsState>({
      name: 'settings-dep',
      initialState: { theme: 'dark', loadedForUser: userId },
    })
    storage.initialize()
    return storage
  },

  createSelectorsFn: (sm) => ({
    theme: sm.createSelector((s) => s.theme),
    loadedForUser: sm.createSelector((s) => s.loadedForUser),
  }),
})

// ─── Компонент-пример ──────────────────────────────────────────────────────────

export function DependenciesExample() {
  return (
    <div style={cardStyle}>
      <h2>Dependencies</h2>
      <p>Один createSynapse может зависеть от другого. Зависимости ожидаются перед инициализацией.</p>

      {/* ─── Создание зависимости ─────────────────────────────────────── */}
      <h3 style={sectionTitle}>Зависимость (Auth store)</h3>
      <pre style={codeBlock}>{`// Auth store — от него будут зависеть другие
const authStorePromise = createSynapse({
  createStorageFn: async () => {
    await fetchAuth()  // async инициализация
    const storage = new MemoryStorage<AuthState>({
      name: 'auth',
      initialState: { token: 'jwt-123', userId: 'user-1' },
    })
    storage.initialize()
    return storage
  },
  createSelectorsFn: (sm) => ({ ... }),
  createDispatcherFn: (storage) => createDispatcher({ storage }, ...),
})`}</pre>

      {/* ─── Использование dependencies ──────────────────────────────── */}
      <h3 style={sectionTitle}>Зависимый store (Settings)</h3>
      <pre style={codeBlock}>{`// Settings store — ждёт готовности Auth
const settingsStorePromise = createSynapse({
  // Массив зависимостей — все ожидаются параллельно через Promise.all
  dependencies: [authStorePromise],

  // Таймаут ожидания (мс, по умолчанию 30000)
  dependencyTimeout: 5000,

  // К моменту вызова createStorageFn все dependencies уже ready
  createStorageFn: async () => {
    const authStore = await authStorePromise
    const userId = authStore.storage.getStateSync().userId

    const storage = new MemoryStorage<SettingsState>({
      name: 'settings',
      initialState: { theme: 'dark', loadedForUser: userId },
    })
    storage.initialize()
    return storage
  },

  createSelectorsFn: (sm) => ({ ... }),
})`}</pre>

      {/* ─── Цепочка зависимостей ────────────────────────────────────── */}
      <h3 style={sectionTitle}>Цепочка зависимостей</h3>
      <pre style={codeBlock}>{`// Dashboard зависит от Auth И Settings
const dashboardStorePromise = createSynapse({
  dependencies: [authStorePromise, settingsStorePromise],
  dependencyTimeout: 10000,

  createStorageFn: async () => {
    const auth = await authStorePromise
    const settings = await settingsStorePromise
    // Оба store гарантированно ready
    ...
  },
})`}</pre>

      {/* ─── Порядок инициализации ────────────────────────────────────── */}
      <h3 style={sectionTitle}>Порядок инициализации</h3>
      <pre style={codeBlock}>{`// Порядок внутри createSynapse:
// 1. dependencies ready (Promise.all + timeout)
// 2. storage create (storage или createStorageFn)
// 3. storage.initialize()
// 4. createSelectorsFn
// 5. createDispatcherFn
// 6. effects start

// При таймауте — выбрасывается Error:
// "Dependency 0 ("auth") timed out after 5000ms"

// Зависимость должна иметь storage.waitForReady()
// Любой результат createSynapse подходит как зависимость`}</pre>

      {/* ─── Живая демо ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Demo</h3>
      <DependencyDemo />

      {/* ─── Timeout demo ────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Timeout Demo</h3>
      <TimeoutDemo />
    </div>
  )
}

function DependencyDemo() {
  const [status, setStatus] = useState<Record<string, string>>({ auth: 'pending', settings: 'pending' })
  const [stores, setStores] = useState<{ auth: any; settings: any }>({ auth: null, settings: null })
  const [timeline, setTimeline] = useState<string[]>([])
  const [startTime] = useState(() => Date.now())

  const log = (msg: string) => {
    setTimeline((prev) => [...prev, `[${Date.now() - startTime}ms] ${msg}`])
  }

  useEffect(() => {
    log('Waiting for auth...')
    authStorePromise.then((authStore) => {
      log('Auth ready!')
      setStatus((s) => ({ ...s, auth: 'ready' }))
      setStores((s) => ({ ...s, auth: authStore }))

      log('Waiting for settings (depends on auth)...')
      settingsStorePromise.then((settingsStore) => {
        log('Settings ready!')
        setStatus((s) => ({ ...s, settings: 'ready' }))
        setStores((s) => ({ ...s, settings: settingsStore }))
      })
    })
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {Object.entries(status).map(([name, s]) => (
          <span key={name} style={{
            padding: '2px 8px',
            borderRadius: 4,
            background: s === 'ready' ? '#c8e6c9' : '#fff9c4',
            fontSize: 12,
          }}>
            {name}: {s}
          </span>
        ))}
      </div>

      <pre style={{ ...codeBlock, fontSize: 11, minHeight: 40 }}>
        {timeline.join('\n') || 'Loading...'}
      </pre>

      {stores.auth && (
        <div style={{ marginTop: 8 }}>
          <div style={buttonRow}>
            <button onClick={() => stores.auth.actions.login('user-42')}>login('user-42')</button>
            <button onClick={() => stores.auth.actions.logout()}>logout()</button>
          </div>
          <AuthStatus store={stores.auth} />
        </div>
      )}

      {stores.settings && <SettingsStatus store={stores.settings} />}
    </div>
  )
}

function AuthStatus({ store }: { store: any }) {
  const token = useSelector<string | null>(store.selectors.token)
  const userId = useSelector<string | null>(store.selectors.userId)
  return (
    <div style={{ fontSize: 12, fontFamily: 'monospace' }}>
      Auth: userId={userId ?? 'null'}, token={token ?? 'null'}
    </div>
  )
}

function SettingsStatus({ store }: { store: any }) {
  const theme = useSelector<string>(store.selectors.theme)
  const loadedForUser = useSelector<string | null>(store.selectors.loadedForUser)
  return (
    <div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 4 }}>
      Settings: theme={theme}, loadedForUser={loadedForUser ?? 'null'}
    </div>
  )
}

function TimeoutDemo() {
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    setResult('Creating store with 2s timeout on a 5s dependency...')
    try {
      const slowDep = createSynapse({
        createStorageFn: async () => {
          await new Promise((r) => setTimeout(r, 5000))
          const s = new MemoryStorage({ name: 'slow', initialState: {} })
          s.initialize()
          return s
        },
      })

      await createSynapse({
        dependencies: [slowDep as any],
        dependencyTimeout: 2000,
        createStorageFn: async () => {
          const s = new MemoryStorage({ name: 'timeout-test', initialState: {} })
          s.initialize()
          return s
        },
      })
      setResult('Store initialized (unexpected)')
    } catch (err: any) {
      setResult(`Timeout error: ${err.message}`)
    }
    setLoading(false)
  }

  return (
    <div>
      <button onClick={run} disabled={loading}>
        {loading ? 'Waiting...' : 'Test timeout (2s on 5s dep)'}
      </button>
      {result && (
        <pre style={{ ...codeBlock, fontSize: 11, marginTop: 4, color: result.includes('Timeout') ? '#e65100' : '#333' }}>
          {result}
        </pre>
      )}
    </div>
  )
}
