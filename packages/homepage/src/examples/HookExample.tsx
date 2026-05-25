import type { IStorage } from 'synapse-storage/core'
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

interface FormState {
  username: string
  email: string
  agreed: boolean
}

/**
 * Пример 5: Создание хранилища через useCreateStorage хук
 * + чтение данных через useStorageSubscribe
 */
export function HookExample() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<FormState>({
    name: 'hook-form',
    type: 'memory',
    initialState: { username: '', email: '', agreed: false },
  })

  if (isLoading) return <div>Loading...</div>
  if (hasError) return <div>Error: {status.error?.message}</div>
  if (!isReady || !storage) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>useCreateStorage + useStorageSubscribe</h2>
      <p>Хук создает, инициализирует и уничтожает storage автоматически</p>

      <FormFields storage={storage} />
      <FormDisplay storage={storage} />
    </div>
  )
}

/**
 * useStorageSubscribe с разными селекторами
 */
function FormFields({ storage }: { storage: IStorage<FormState> }) {
  // Подписка на конкретное поле через selector
  const username = useStorageSubscribe(storage, (s) => s.username)
  const email = useStorageSubscribe(storage, (s) => s.email)
  const agreed = useStorageSubscribe(storage, (s) => s.agreed)

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <label>Username: </label>
        <input
          value={username ?? ''}
          onChange={(e) => storage.set('username', e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Email: </label>
        <input
          value={email ?? ''}
          onChange={(e) => storage.set('email', e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>
          <input
            type="checkbox"
            checked={agreed ?? false}
            onChange={(e) => storage.set('agreed', e.target.checked)}
          />
          {' '}I agree
        </label>
      </div>
    </div>
  )
}

/**
 * Подписка на всё состояние целиком
 */
function FormDisplay({ storage }: { storage: IStorage<FormState> }) {
  // Подписка на всё состояние
  const fullState = useStorageSubscribe(storage, (s) => s)

  return (
    <div>
      <h4>Полное состояние (useStorageSubscribe с identity selector):</h4>
      <pre style={{ background: '#f5f5f5', padding: 8 }}>{JSON.stringify(fullState, null, 2)}</pre>

      <div style={buttonRow}>
        <button onClick={() => storage.update((s) => {
          s.username = ''
          s.email = ''
          s.agreed = false
        })}>
          reset via update()
        </button>
        <button onClick={() => storage.clear()}>
          clear()
        </button>
      </div>
    </div>
  )
}
