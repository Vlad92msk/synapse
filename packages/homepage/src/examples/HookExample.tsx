import type { ISyncStorage } from 'synapse-storage/core'
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

interface FormState {
  username: string
  email: string
  agreed: boolean
}

/**
 * useCreateStorage (memory) + useStorageSubscribe
 */
export function HookExample() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<FormState>({
    name: 'hook-form',
    type: 'memory',
    initialState: { username: '', email: '', agreed: false },
  })

  if (isLoading) return <div>Loading...</div>
  if (hasError) return <div>Error: {status.error?.message}</div>
  if (!isReady) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>useCreateStorage (memory)</h2>
      <p>React-хук для создания хранилища. Автоматически инициализирует и уничтожает при размонтировании.</p>

      {/* ─── useCreateStorage ─────────────────────────────────────────── */}
      <h3 style={sectionTitle}>useCreateStorage</h3>
      <pre style={codeBlock}>{`import { useCreateStorage } from 'synapse-storage/react'

interface FormState {
  username: string
  email: string
  agreed: boolean
}

function MyComponent() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<FormState>({
    type: 'memory',           // 'memory' | 'localStorage' | 'indexedDB'
    name: 'hook-form',
    initialState: { username: '', email: '', agreed: false },
  })

  // Опционально: настройки lifecycle
  const result = useCreateStorage<FormState>(
    { type: 'memory', name: 'hook-form', initialState: { ... } },
    {
      autoInitialize: true,    // авто-инициализация (default: true)
      destroyOnUnmount: true,  // уничтожить при unmount (default: true для memory/local)
    }
  )

  // isReady = true  → storage доступен (тип: ISyncStorage<FormState>)
  // isReady = false → storage = null
  if (!isReady) return <div>Loading...</div>

  // После isReady, storage гарантированно не null
  storage.set('username', 'John')
}`}</pre>

      {/* ─── useStorageSubscribe ──────────────────────────────────────── */}
      <h3 style={sectionTitle}>useStorageSubscribe</h3>
      <pre style={codeBlock}>{`import { useStorageSubscribe } from 'synapse-storage/react'

function FormFields({ storage }: { storage: ISyncStorage<FormState> }) {
  // Подписка на конкретное поле через selector
  const username = useStorageSubscribe(storage, (s) => s.username)
  const email = useStorageSubscribe(storage, (s) => s.email)
  const agreed = useStorageSubscribe(storage, (s) => s.agreed)

  // Подписка на всё состояние
  const fullState = useStorageSubscribe(storage, (s) => s)

  return <div>{username} — {email} — {String(agreed)}</div>
}`}</pre>

      {/* ─── Демо ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Демо</h3>
      <FormFields storage={storage} />
      <FormDisplay storage={storage} />
    </div>
  )
}

function FormFields({ storage }: { storage: ISyncStorage<FormState> }) {
  const username = useStorageSubscribe(storage, (s) => s.username)
  const email = useStorageSubscribe(storage, (s) => s.email)
  const agreed = useStorageSubscribe(storage, (s) => s.agreed)

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <label>Username: </label>
        <input value={username ?? ''} onChange={(e) => storage.set('username', e.target.value)} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Email: </label>
        <input value={email ?? ''} onChange={(e) => storage.set('email', e.target.value)} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>
          <input type="checkbox" checked={agreed ?? false} onChange={(e) => storage.set('agreed', e.target.checked)} />
          {' '}I agree
        </label>
      </div>
    </div>
  )
}

function FormDisplay({ storage }: { storage: ISyncStorage<FormState> }) {
  const fullState = useStorageSubscribe(storage, (s) => s)

  return (
    <div>
      <h4>Полное состояние:</h4>
      <pre style={codeBlock}>{JSON.stringify(fullState, null, 2)}</pre>
      <div style={buttonRow}>
        <button onClick={() => storage.update((s) => { s.username = ''; s.email = ''; s.agreed = false })}>
          reset via update()
        </button>
        <button onClick={() => storage.clear()}>clear()</button>
        <button onClick={() => storage.reset()}>reset()</button>
      </div>
    </div>
  )
}
