import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'
import { useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример 13: Dependencies — SynapseDependency, dependencyTimeout в createSynapse
 * Один Synapse может зависеть от другого и ждать его готовности
 */

// --- Шаг 1: Создаем "Auth" Synapse (от него будут зависеть другие) ---

interface AuthState {
  token: string | null
  userId: string | null
  isAuthenticated: boolean
}

const authStorePromise = createSynapse({
  createStorageFn: async () => {
    // Имитация асинхронной авторизации
    await new Promise((r) => setTimeout(r, 1000))
    const storage = new MemoryStorage<AuthState>({
      name: 'auth-dep',
      initialState: { token: 'mock-jwt-token', userId: 'user-123', isAuthenticated: true },
    })
    storage.initialize()
    return storage
  },

  createSelectorsFn: (sm) => ({
    token: sm.createSelector((s) => s.token),
    isAuthenticated: sm.createSelector((s) => s.isAuthenticated),
    userId: sm.createSelector((s) => s.userId),
  }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_s, { createAction }) => ({
      login: createAction({
        type: 'login',
        action: (params: { userId: string }) => {
          storage.update((s) => {
            s.token = `jwt-${params.userId}-${Date.now()}`
            s.userId = params.userId
            s.isAuthenticated = true
          })
        },
      }),
      logout: createAction({
        type: 'logout',
        action: () => {
          storage.update((s) => {
            s.token = null
            s.userId = null
            s.isAuthenticated = false
          })
        },
      }),
    })),
})

// --- Шаг 2: Создаем "Settings" Synapse (зависит от Auth) ---

interface SettingsState {
  theme: string
  language: string
  ownerUserId: string | null
}

let settingsStorePromise: ReturnType<typeof createSynapse> | null = null

function createSettingsStore() {
  settingsStorePromise = createSynapse({
    // Зависимость: ждем готовности authStore
    dependencies: [authStorePromise as any],
    dependencyTimeout: 5000, // Таймаут 5 секунд (по умолчанию 30 сек)

    createStorageFn: async () => {
      // К этому моменту authStore гарантированно ready!
      const authStore = await authStorePromise
      const userId = authStore.storage.getStateSync().userId

      const storage = new MemoryStorage<SettingsState>({
        name: 'settings-dep',
        initialState: {
          theme: 'dark',
          language: 'en',
          ownerUserId: userId,
        },
      })
      storage.initialize()
      return storage
    },

    createSelectorsFn: (sm) => ({
      theme: sm.createSelector((s) => s.theme),
      language: sm.createSelector((s) => s.language),
      ownerUserId: sm.createSelector((s) => s.ownerUserId),
    }),

    createDispatcherFn: (storage) =>
      createDispatcher({ storage }, (_s, { createAction }) => ({
        setTheme: createAction({
          type: 'setTheme',
          action: (theme: string) => {
            storage.set('theme', theme)
          },
        }),
        setLanguage: createAction({
          type: 'setLanguage',
          action: (lang: string) => {
            storage.set('language', lang)
          },
        }),
      })),
  })
  return settingsStorePromise
}

// --- Шаг 3: Создаем "Dashboard" Synapse (зависит от Auth и Settings) ---

interface DashboardState {
  widgets: string[]
  lastSync: string
  loadedFromDeps: { authUserId: string | null; settingsTheme: string }
}

function createDashboardStore(authPromise: any, settingsPromise: any) {
  return createSynapse({
    dependencies: [authPromise, settingsPromise], // Зависит от обоих!
    dependencyTimeout: 10000,

    createStorageFn: async () => {
      const authStore = await authPromise
      const settingsStore = await settingsPromise

      const authState = authStore.storage.getStateSync()
      const settingsState = settingsStore.storage.getStateSync()

      const storage = new MemoryStorage<DashboardState>({
        name: 'dashboard-dep',
        initialState: {
          widgets: ['stats', 'chart', 'notifications'],
          lastSync: new Date().toISOString(),
          loadedFromDeps: {
            authUserId: authState.userId,
            settingsTheme: settingsState.theme,
          },
        },
      })
      storage.initialize()
      return storage
    },

    createSelectorsFn: (sm) => ({
      widgets: sm.createSelector((s) => s.widgets),
      loadedFromDeps: sm.createSelector((s) => s.loadedFromDeps),
    }),
  })
}

// --- UI ---

function DependencyChainDemo() {
  const [status, setStatus] = useState<Record<string, string>>({
    auth: 'pending',
    settings: 'not started',
    dashboard: 'not started',
  })
  const [stores, setStores] = useState<Record<string, any>>({})
  const [timeline, setTimeline] = useState<string[]>([])
  const startTime = useState(() => Date.now())[0]

  const addTimeline = (msg: string) => {
    const elapsed = Date.now() - startTime
    setTimeline((prev) => [...prev, `[${elapsed}ms] ${msg}`])
  }

  useEffect(() => {
    const init = async () => {
      addTimeline('Starting auth initialization...')
      setStatus((s) => ({ ...s, auth: 'loading' }))

      try {
        const authStore = await authStorePromise
        addTimeline('Auth ready!')
        setStatus((s) => ({ ...s, auth: 'ready' }))
        setStores((s) => ({ ...s, auth: authStore }))

        // Запускаем settings (зависит от auth)
        addTimeline('Starting settings (depends on auth)...')
        setStatus((s) => ({ ...s, settings: 'loading' }))
        const settingsPromise = createSettingsStore()
        const settingsStore = await settingsPromise

        addTimeline('Settings ready!')
        setStatus((s) => ({ ...s, settings: 'ready' }))
        setStores((s) => ({ ...s, settings: settingsStore }))

        // Запускаем dashboard (зависит от auth + settings)
        addTimeline('Starting dashboard (depends on auth + settings)...')
        setStatus((s) => ({ ...s, dashboard: 'loading' }))
        const dashboardStore = await createDashboardStore(authStorePromise, settingsPromise)

        addTimeline('Dashboard ready!')
        setStatus((s) => ({ ...s, dashboard: 'ready' }))
        setStores((s) => ({ ...s, dashboard: dashboardStore }))

      } catch (err: any) {
        addTimeline(`Error: ${err.message}`)
      }
    }

    init()
  }, [])

  return (
    <div>
      {/* Status indicators */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        {Object.entries(status).map(([name, s]) => (
          <div key={name} style={{
            padding: '4px 12px',
            borderRadius: 4,
            background: s === 'ready' ? '#c8e6c9' : s === 'loading' ? '#fff9c4' : '#f5f5f5',
            fontSize: 12,
          }}>
            <strong>{name}</strong>: {s}
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>Initialization Timeline:</strong>
        <pre style={{ fontSize: 11, margin: 0, maxHeight: 120, overflow: 'auto' }}>
          {timeline.join('\n')}
        </pre>
      </div>

      {/* Dashboard state showing data from dependencies */}
      {stores.dashboard && <DashboardPanel store={stores.dashboard} />}

      {/* Auth controls */}
      {stores.auth && 'actions' in stores.auth && (
        <div style={{ marginTop: 8 }}>
          <strong style={{ fontSize: 12 }}>Auth actions:</strong>
          <div style={buttonRow}>
            <button onClick={() => (stores.auth as any).actions.login({ userId: 'user-456' })}>
              Login as user-456
            </button>
            <button onClick={() => (stores.auth as any).actions.logout()}>
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardPanel({ store }: { store: any }) {
  const widgets = useSelector(store.selectors.widgets)
  const loadedFromDeps = useSelector<{ authUserId: string | null; settingsTheme: string }>(store.selectors.loadedFromDeps)

  return (
    <div style={{ padding: 8, background: '#e3f2fd', borderRadius: 4 }}>
      <strong style={{ fontSize: 12 }}>Dashboard (loaded from dependencies):</strong>
      <div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 4 }}>
        <div>widgets: {JSON.stringify(widgets)}</div>
        <div>from auth: userId = {loadedFromDeps?.authUserId}</div>
        <div>from settings: theme = {loadedFromDeps?.settingsTheme}</div>
      </div>
    </div>
  )
}

// --- Dependency Timeout Demo ---

function TimeoutDemo() {
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const runTimeout = async () => {
    setLoading(true)
    setResult('Creating store with 2s timeout on a dependency that takes 5s...')

    try {
      // Создаем зависимость, которая инициализируется 5 секунд
      const slowDep = createSynapse({
        createStorageFn: async () => {
          await new Promise((r) => setTimeout(r, 5000))
          const s = new MemoryStorage({ name: 'slow-dep', initialState: {} })
          s.initialize()
          return s
        },
      })

      // Создаем store с таймаутом 2 секунды на зависимость
      await createSynapse({
        dependencies: [slowDep as any],
        dependencyTimeout: 2000, // Таймаут 2 секунды
        createStorageFn: async () => {
          const s = new MemoryStorage({ name: 'timeout-test', initialState: {} })
          s.initialize()
          return s
        },
      })

      setResult('Unexpected: store initialized without timeout')
    } catch (err: any) {
      setResult(`Expected timeout error: ${err.message}`)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: 8, background: '#fce4ec', borderRadius: 4, marginTop: 8 }}>
      <h4>Dependency Timeout</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        Если зависимость не готова за указанное время — выбрасывается ошибка.
      </p>
      <button onClick={runTimeout} disabled={loading}>
        {loading ? 'Waiting for timeout...' : 'Test dependency timeout (2s)'}
      </button>
      {result && (
        <pre style={{ fontSize: 11, marginTop: 4, color: result.includes('Expected') ? '#e65100' : '#333' }}>
          {result}
        </pre>
      )}
    </div>
  )
}

export function DependenciesExample() {
  return (
    <div style={cardStyle}>
      <h2>Dependencies — SynapseDependency</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        Один createSynapse может зависеть от других. Зависимости ждут готовности перед инициализацией.
      </p>

      <DependencyChainDemo />
      <TimeoutDemo />

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>dependencies: [authStore, settingsStore]</code> — массив SynapseDependency</li>
        <li><code>dependencyTimeout: 5000</code> — таймаут ожидания (мс, по умолчанию 30000)</li>
        <li>Зависимость должна иметь <code>storage.waitForReady()</code></li>
        <li>Все зависимости ожидаются параллельно через <code>Promise.all</code></li>
        <li>При таймауте выбрасывается Error с описанием какая зависимость не успела</li>
        <li>Порядок инициализации: dependencies ready -&gt; storage create -&gt; selectors -&gt; dispatcher -&gt; effects</li>
      </ul>
    </div>
  )
}
