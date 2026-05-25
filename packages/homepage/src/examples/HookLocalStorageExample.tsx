import type { IStorage } from 'synapse-storage/core'
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle } from './styles'

interface SettingsState {
  lang: string
  notifications: boolean
  volume: number
}

/**
 * Пример 6: useCreateStorage с type: 'localStorage'
 */
export function HookLocalStorageExample() {
  const { storage, isReady, isLoading } = useCreateStorage<SettingsState>({
    name: 'hook-settings',
    type: 'localStorage',
    initialState: { lang: 'ru', notifications: true, volume: 50 },
  })

  if (isLoading) return <div>Loading...</div>
  if (!isReady || !storage) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>useCreateStorage (localStorage)</h2>
      <p>Перезагрузите страницу — данные сохранятся</p>

      <SettingsDisplay storage={storage} />
    </div>
  )
}

function SettingsDisplay({ storage }: { storage: IStorage<SettingsState> }) {
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
          <input
            type="checkbox"
            checked={notifications ?? true}
            onChange={(e) => storage.set('notifications', e.target.checked)}
          />
          {' '}Notifications
        </label>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>Volume: {volume}</label>
        <input
          type="range"
          min={0}
          max={100}
          value={volume ?? 50}
          onChange={(e) => storage.set('volume', Number(e.target.value))}
        />
      </div>

      <pre style={{ background: '#f5f5f5', padding: 8 }}>
        {JSON.stringify({ lang, notifications, volume }, null, 2)}
      </pre>
    </div>
  )
}
