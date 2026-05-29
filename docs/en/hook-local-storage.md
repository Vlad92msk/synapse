# useCreateStorage (localStorage)

> [Back to Main](../../README.md)

Same hook, but with `type: 'localStorage'`. Data survives page reloads.

## Usage

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

interface SettingsState {
  lang: string
  notifications: boolean
  volume: number
}

function SettingsPage() {
  const { storage, isReady } = useCreateStorage<SettingsState>({
    type: 'localStorage',         // <- only difference from memory
    name: 'hook-settings',
    initialState: { lang: 'ru', notifications: true, volume: 50 },
  })

  if (!isReady) return <div>Loading...</div>

  // Use useStorageSubscribe to subscribe to fields
  const lang = useStorageSubscribe(storage, (s) => s.lang)
  const volume = useStorageSubscribe(storage, (s) => s.volume)

  // set/update/clear/reset — everything like with memory
  storage.set('lang', 'en')
  storage.set('volume', 75)
}
```

## Full Example

```tsx
function SettingsPage() {
  const { storage, isReady } = useCreateStorage<SettingsState>({
    type: 'localStorage',
    name: 'hook-settings',
    initialState: { lang: 'ru', notifications: true, volume: 50 },
  })

  if (!isReady) return <div>Loading...</div>

  return <SettingsDisplay storage={storage} />
}

function SettingsDisplay({ storage }: { storage: ISyncStorage<SettingsState> }) {
  const lang = useStorageSubscribe(storage, (s) => s.lang)
  const notifications = useStorageSubscribe(storage, (s) => s.notifications)
  const volume = useStorageSubscribe(storage, (s) => s.volume)

  return (
    <div>
      <select value={lang ?? 'ru'} onChange={(e) => storage.set('lang', e.target.value)}>
        <option value="ru">Русский</option>
        <option value="en">English</option>
      </select>

      <label>
        <input type="checkbox" checked={notifications ?? true}
          onChange={(e) => storage.set('notifications', e.target.checked)} />
        Notifications
      </label>

      <input type="range" min={0} max={100} value={volume ?? 50}
        onChange={(e) => storage.set('volume', Number(e.target.value))} />
    </div>
  )
}
```
