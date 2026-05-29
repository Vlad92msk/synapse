import type { ISyncStorage } from 'synapse-storage/core'
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, codeBlock, sectionTitle } from './styles'

interface SettingsState {
  lang: string
  notifications: boolean
  volume: number
}

/**
 * useCreateStorage с type: 'localStorage'
 */
export function HookLocalStorageExample() {
  const { storage, isReady, isLoading } = useCreateStorage<SettingsState>({
    name: 'hook-settings',
    type: 'localStorage',
    initialState: { lang: 'ru', notifications: true, volume: 50 },
  })

  if (isLoading) return <div>Loading...</div>
  if (!isReady) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>useCreateStorage (localStorage)</h2>
      <p>Тот же хук, только с <code>type: 'localStorage'</code>. Данные переживают перезагрузку.</p>

      {/* ─── Код ──────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Использование</h3>
      <pre style={codeBlock}>{`import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

interface SettingsState {
  lang: string
  notifications: boolean
  volume: number
}

function SettingsPage() {
  const { storage, isReady } = useCreateStorage<SettingsState>({
    type: 'localStorage',         // ← единственное отличие от memory
    name: 'hook-settings',
    initialState: { lang: 'ru', notifications: true, volume: 50 },
  })

  if (!isReady) return <div>Loading...</div>

  // Используем useStorageSubscribe для подписки на поля
  const lang = useStorageSubscribe(storage, (s) => s.lang)
  const volume = useStorageSubscribe(storage, (s) => s.volume)

  // set/update/clear/reset — всё как с memory
  storage.set('lang', 'en')
  storage.set('volume', 75)
}`}</pre>

      {/* ─── Демо ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Демо (перезагрузите страницу — данные сохранятся)</h3>
      <SettingsDisplay storage={storage} />
    </div>
  )
}

function SettingsDisplay({ storage }: { storage: ISyncStorage<SettingsState> }) {
  const lang = useStorageSubscribe(storage, (s) => s.lang)
  const notifications = useStorageSubscribe(storage, (s) => s.notifications)
  const volume = useStorageSubscribe(storage, (s) => s.volume)

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <label>Language: </label>
        <select value={lang ?? 'ru'} onChange={(e) => storage.set('lang', e.target.value)}>
          <option value="ru">Русский</option>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>
          <input type="checkbox" checked={notifications ?? true} onChange={(e) => storage.set('notifications', e.target.checked)} />
          {' '}Notifications
        </label>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Volume: {volume}</label>
        <input type="range" min={0} max={100} value={volume ?? 50} onChange={(e) => storage.set('volume', Number(e.target.value))} />
      </div>
      <pre style={codeBlock}>{JSON.stringify({ lang, notifications, volume }, null, 2)}</pre>
    </div>
  )
}
