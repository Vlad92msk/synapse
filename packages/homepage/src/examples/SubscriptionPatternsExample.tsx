import { useState, useEffect } from 'react'
import type { IStorage } from 'synapse-storage/core'
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

interface ProfileState {
  user: {
    name: string
    email: string
  }
  settings: {
    theme: string
    lang: string
  }
  counter: number
}

const initialState: ProfileState = {
  user: { name: 'John', email: 'john@test.com' },
  settings: { theme: 'light', lang: 'en' },
  counter: 0,
}

/**
 * Пример 9: Все паттерны подписок
 */
export function SubscriptionPatternsExample() {
  const { storage, isReady, isLoading } = useCreateStorage<ProfileState>({
    name: 'subscription-demo',
    type: 'memory',
    initialState,
  })

  if (isLoading) return <div>Loading...</div>
  if (!isReady || !storage) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>Паттерны подписок</h2>

      <div style={buttonRow}>
        <button onClick={() => storage.update((s) => { s.counter++ })}>counter++</button>
        <button onClick={() => storage.set('user', { name: 'Jane', email: 'jane@test.com' })}>change user</button>
        <button onClick={() => storage.update((s) => { s.settings.theme = s.settings.theme === 'light' ? 'dark' : 'light' })}>
          toggle theme
        </button>
      </div>

      <h4>1. useStorageSubscribe — полное состояние</h4>
      <FullStateSubscriber storage={storage} />

      <h4>2. useStorageSubscribe — одно поле</h4>
      <SingleFieldSubscriber storage={storage} />

      <h4>3. useStorageSubscribe — вложенное поле</h4>
      <NestedFieldSubscriber storage={storage} />

      <h4>4. useStorageSubscribe — computed value</h4>
      <ComputedSubscriber storage={storage} />

      <h4>5. storage.subscribe(key, cb) — императивно по ключу</h4>
      <ImperativeKeySubscriber storage={storage} />

      <h4>6. storage.subscribe(selector, cb) — императивно по selector</h4>
      <ImperativeSelectorSubscriber storage={storage} />

      <h4>7. storage.subscribeToAll(cb) — все изменения</h4>
      <SubscribeAllDemo storage={storage} />
    </div>
  )
}

function FullStateSubscriber({ storage }: { storage: IStorage<ProfileState> }) {
  const state = useStorageSubscribe(storage, (s) => s)
  return <pre style={preStyle}>{JSON.stringify(state, null, 2)}</pre>
}

function SingleFieldSubscriber({ storage }: { storage: IStorage<ProfileState> }) {
  const counter = useStorageSubscribe(storage, (s) => s.counter)
  return <p>counter = <strong>{counter}</strong></p>
}

function NestedFieldSubscriber({ storage }: { storage: IStorage<ProfileState> }) {
  const theme = useStorageSubscribe(storage, (s) => s.settings.theme)
  return <p>settings.theme = <strong>{theme}</strong></p>
}

function ComputedSubscriber({ storage }: { storage: IStorage<ProfileState> }) {
  const summary = useStorageSubscribe(storage, (s) => `${s.user.name} (${s.settings.theme}, counter: ${s.counter})`)
  return <p>computed = <strong>{summary}</strong></p>
}

function ImperativeKeySubscriber({ storage }: { storage: IStorage<ProfileState> }) {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    return storage.subscribe('counter', (value) => {
      setLog((prev) => [...prev.slice(-4), `counter → ${value}`])
    })
  }, [storage])

  return <pre style={preStyle}>{log.join('\n') || '(изменений пока нет)'}</pre>
}

function ImperativeSelectorSubscriber({ storage }: { storage: IStorage<ProfileState> }) {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    return storage.subscribe(
      (s) => s.user.name,
      (name) => {
        setLog((prev) => [...prev.slice(-4), `user.name → ${name}`])
      },
    )
  }, [storage])

  return <pre style={preStyle}>{log.join('\n') || '(изменений пока нет)'}</pre>
}

function SubscribeAllDemo({ storage }: { storage: IStorage<ProfileState> }) {
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    return storage.subscribeToAll((event) => {
      setLog((prev) => [...prev.slice(-4), `${event.type}: keys=${JSON.stringify(event.key)}`])
    })
  }, [storage])

  return <pre style={preStyle}>{log.join('\n') || '(изменений пока нет)'}</pre>
}

const preStyle: React.CSSProperties = { background: '#f5f5f5', padding: 8, fontSize: 12 }
