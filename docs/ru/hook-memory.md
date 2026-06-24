# useCreateStorage (memory)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HookExample.tsx)

React-хук для создания MemoryStorage. Автоматически инициализирует и уничтожает при размонтировании.

## useCreateStorage

```typescript
import { useCreateStorage } from 'synapse-storage/react'

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

  // Опционально: настройки жизненного цикла
  const result = useCreateStorage<FormState>(
    { type: 'memory', name: 'hook-form', initialState: { ... } },
    {
      autoInitialize: true,    // автоинициализация (по умолчанию: true)
      destroyOnUnmount: true,  // уничтожить при размонтировании (по умолчанию: true для memory/local)
    }
  )

  // isReady = true  -> хранилище доступно (тип: ISyncStorage<FormState>)
  // isReady = false -> storage = null
  if (!isReady) return <div>Loading...</div>

  // После isReady хранилище гарантированно не null
  storage.set('username', 'John')
}
```

## useStorageSubscribe

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function FormFields({ storage }: { storage: ISyncStorage<FormState> }) {
  // Подписка на конкретное поле через селектор
  const username = useStorageSubscribe(storage, (s) => s.username)
  const email = useStorageSubscribe(storage, (s) => s.email)
  const agreed = useStorageSubscribe(storage, (s) => s.agreed)

  // Подписка на всё состояние
  const fullState = useStorageSubscribe(storage, (s) => s)

  return <div>{username} — {email} — {String(agreed)}</div>
}
```

## Полный пример

```tsx
import type { ISyncStorage } from 'synapse-storage/core'
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function App() {
  const { storage, isReady } = useCreateStorage<FormState>({
    type: 'memory',
    name: 'hook-form',
    initialState: { username: '', email: '', agreed: false },
  })

  if (!isReady) return <div>Loading...</div>

  return (
    <>
      <FormFields storage={storage} />
      <FormDisplay storage={storage} />
    </>
  )
}

function FormFields({ storage }: { storage: ISyncStorage<FormState> }) {
  const username = useStorageSubscribe(storage, (s) => s.username)
  const email = useStorageSubscribe(storage, (s) => s.email)

  return (
    <div>
      <input value={username ?? ''} onChange={(e) => storage.set('username', e.target.value)} />
      <input value={email ?? ''} onChange={(e) => storage.set('email', e.target.value)} />
    </div>
  )
}
```
