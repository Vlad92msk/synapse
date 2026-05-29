# useCreateStorage (localStorage)

> [Назад к оглавлению](./README.md)

Тот же хук, но с `type: 'localStorage'`. Данные сохраняются после перезагрузки страницы.

## Использование

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

interface SettingsState {
  lang: string
  notifications: boolean
  volume: number
}

function SettingsPage() {
  const { storage, isReady } = useCreateStorage<SettingsState>({
    type: 'localStorage',         // <- единственное отличие от memory
    name: 'hook-settings',
    initialState: { lang: 'ru', notifications: true, volume: 50 },
  })

  if (!isReady) return <div>Loading...</div>

  // Используйте useStorageSubscribe для подписки на поля
  const lang = useStorageSubscribe(storage, (s) => s.lang)
  const volume = useStorageSubscribe(storage, (s) => s.volume)

  // set/update/clear/reset — всё как с memory
  storage.set('lang', 'en')
  storage.set('volume', 75)
}
```

## Полный пример

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
        Уведомления
      </label>

      <input type="range" min={0} max={100} value={volume ?? 50}
        onChange={(e) => storage.set('volume', Number(e.target.value))} />
    </div>
  )
}
```
