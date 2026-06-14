import { useState, useEffect } from 'react'
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import type { IStorage, SelectorAPI } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher } from 'synapse-storage/reactive'
import { useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Auth Store (от него зависят другие) ───────────────────────────────────────

interface AuthState {
  token: string | null
  userId: string | null
}

class AuthSelectors extends Selectors<AuthState> {
  readonly token = this.select((s) => s.token)
  readonly userId = this.select((s) => s.userId)
}

class AuthDispatcher extends Dispatcher<AuthState> {
  readonly login = this.action((store, userId: string) => {
    store.update((s) => { s.token = `jwt-${userId}`; s.userId = userId })
    return userId
  })
  readonly logout = this.action((store) => {
    store.update((s) => { s.token = null; s.userId = null })
  })
}

const authSynapse = createSynapse(async () => {
  // Имитация async авторизации (бывший createStorageFn/setup — теперь просто пролог фабрики)
  await new Promise((r) => setTimeout(r, 1000))
  const storage = new MemoryStorage<AuthState>({
    name: 'auth-dep',
    initialState: { token: 'jwt-123', userId: 'user-1' },
  })
  return {
    storage,
    dispatcher: new AuthDispatcher(storage),
    selectors: new AuthSelectors(storage),
  }
})

type AuthSynapse = Awaited<typeof authSynapse>

// ─── Settings Store (зависит от Auth) ──────────────────────────────────────────

interface SettingsState {
  theme: string
  loadedForUser: string | null
}

class SettingsSelectors extends Selectors<SettingsState> {
  readonly theme = this.select((s) => s.theme)
  readonly loadedForUser = this.select((s) => s.loadedForUser)

  // Cross-store селектор: зависит от селектора ИЗ ДРУГОГО стора (auth).
  // Внешние селекторы приходят через конструктор; присваиваем после super().
  readonly currentUserId: SelectorAPI<string | null>

  constructor(storage: IStorage<SettingsState>, private auth: AuthSynapse['selectors']) {
    super(storage)
    this.currentUserId = this.combine([this.auth.userId], (userId) => userId)
  }
}

const settingsSynapse = createSynapse(async () => {
  // К моменту исполнения фабрики все dependencies уже ready
  const auth = await authSynapse
  const userId = auth.storage.getStateSync().userId

  const storage = new MemoryStorage<SettingsState>({
    name: 'settings-dep',
    initialState: { theme: 'dark', loadedForUser: userId },
  })
  return {
    storage,
    dependencies: [auth],
    dependencyTimeout: 5000,
    // cross-store селектор — auth.selectors через конструктор
    selectors: new SettingsSelectors(storage, auth.selectors),
  }
})

// ─── Компонент-пример ──────────────────────────────────────────────────────────

export function DependenciesExample() {
  return (
    <div style={cardStyle}>
      <h2>Dependencies</h2>
      <p>Один createSynapse может зависеть от другого. Зависимости ожидаются перед исполнением фабрики.</p>

      {/* ─── Создание зависимости ─────────────────────────────────────── */}
      <h3 style={sectionTitle}>Зависимость (Auth store)</h3>
      <pre style={codeBlock}>{`// Auth store — от него будут зависеть другие
const authSynapse = createSynapse(async () => {
  await fetchAuth()  // async-пролог фабрики
  const storage = new MemoryStorage<AuthState>({
    name: 'auth',
    initialState: { token: 'jwt-123', userId: 'user-1' },
  })
  return {
    storage,
    dispatcher: new AuthDispatcher(storage),
    selectors: new AuthSelectors(storage),
  }
})

type AuthSynapse = Awaited<typeof authSynapse>`}</pre>

      {/* ─── Использование dependencies ──────────────────────────────── */}
      <h3 style={sectionTitle}>Зависимый store (Settings) + cross-store селектор</h3>
      <pre style={codeBlock}>{`// Cross-store селектор: внешние селекторы приходят через конструктор
class SettingsSelectors extends Selectors<SettingsState> {
  readonly theme = this.select((s) => s.theme)
  readonly currentUserId: SelectorAPI<string | null>

  constructor(storage: IStorage<SettingsState>, private auth: AuthSynapse['selectors']) {
    super(storage)
    // зависит от селектора другого стора → реактивно пересчитывается
    this.currentUserId = this.combine([this.auth.userId], (userId) => userId)
  }
}

const settingsSynapse = createSynapse(async () => {
  const auth = await authSynapse              // handle — thenable
  const storage = new MemoryStorage<SettingsState>({ name: 'settings', initialState })
  return {
    storage,
    dependencies: [auth],                     // ждём готовности до сборки
    dependencyTimeout: 5000,                  // мс, по умолчанию 30000
    selectors: new SettingsSelectors(storage, auth.selectors),
  }
})`}</pre>

      {/* ─── 4 паттерна межмодульного общения ────────────────────────── */}
      <h3 style={sectionTitle}>4 паттерна межмодульного общения</h3>
      <pre style={codeBlock}>{`// 1. Читать СОСТОЯНИЕ внешнего стора в эффектах — через toObservable
//    new SettingsEffects(toObservable(auth.storage))  → this.auth$ в замыкании

// 2. Читать СЕЛЕКТОРЫ внешнего стора — через конструктор Selectors (cross-store)
//    new SettingsSelectors(storage, auth.selectors)  → this.combine([this.auth.userId], ...)

// 3. Реагировать на ЭКШЕНЫ внешнего стора — через externalDispatchers
//    class SettingsEffects extends Effects<SettingsState, SettingsDispatcher, { auth: AuthDispatcher }>
//    this.effect((action$, _s, { external }) => action$.pipe(ofType(external.auth.logout), ...))

// 4. Медиатор/event-bus — отдельный синапс-посредник связывает несвязанные модули`}</pre>

      {/* ─── Порядок инициализации ────────────────────────────────────── */}
      <h3 style={sectionTitle}>Порядок инициализации</h3>
      <pre style={codeBlock}>{`// Порядок внутри фабрики createSynapse:
// 1. dependencies ready (Promise.all + timeout)
// 2. фабрика исполняется → создаёт storage, dispatcher, selectors, effects
// 3. storage.initialize() + старт эффектов

// При таймауте — выбрасывается Error:
// "Dependency ("auth") timed out after 5000ms"

// Любой handle createSynapse подходит как зависимость (он thenable + waitForReady)`}</pre>

      {/* ─── Живая демо ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Demo</h3>
      <DependencyDemo />
    </div>
  )
}

function DependencyDemo() {
  const [status, setStatus] = useState<Record<string, string>>({ auth: 'pending', settings: 'pending' })
  const [stores, setStores] = useState<{ auth: AuthSynapse | null; settings: Awaited<typeof settingsSynapse> | null }>({ auth: null, settings: null })
  const [timeline, setTimeline] = useState<string[]>([])
  const [startTime] = useState(() => Date.now())

  const log = (msg: string) => {
    setTimeline((prev) => [...prev, `[${Date.now() - startTime}ms] ${msg}`])
  }

  useEffect(() => {
    log('Waiting for auth...')
    authSynapse.then((authStore) => {
      log('Auth ready!')
      setStatus((s) => ({ ...s, auth: 'ready' }))
      setStores((s) => ({ ...s, auth: authStore }))

      log('Waiting for settings (depends on auth)...')
      settingsSynapse.then((settingsStore) => {
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
            <button onClick={() => stores.auth!.actions.login('user-42')}>login('user-42')</button>
            <button onClick={() => stores.auth!.actions.logout()}>logout()</button>
          </div>
          <AuthStatus store={stores.auth} />
        </div>
      )}

      {stores.settings && <SettingsStatus store={stores.settings} />}
    </div>
  )
}

function AuthStatus({ store }: { store: AuthSynapse }) {
  const token = useSelector(store.selectors.token)
  const userId = useSelector(store.selectors.userId)
  return (
    <div style={{ fontSize: 12, fontFamily: 'monospace' }}>
      Auth: userId={userId ?? 'null'}, token={token ?? 'null'}
    </div>
  )
}

function SettingsStatus({ store }: { store: Awaited<typeof settingsSynapse> }) {
  const theme = useSelector(store.selectors.theme)
  const loadedForUser = useSelector(store.selectors.loadedForUser)
  const currentUserId = useSelector(store.selectors.currentUserId)
  return (
    <div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 4 }}>
      Settings: theme={theme}, loadedForUser={loadedForUser ?? 'null'}, currentUserId (cross-store)={currentUserId ?? 'null'}
    </div>
  )
}
