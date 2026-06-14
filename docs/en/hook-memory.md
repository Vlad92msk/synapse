# useCreateStorage (memory)

> [Back to Main](../../README.md)

A React hook for creating a MemoryStorage. It automatically initializes and destroys it on unmount.

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

  // Optional: lifecycle settings
  const result = useCreateStorage<FormState>(
    { type: 'memory', name: 'hook-form', initialState: { ... } },
    {
      autoInitialize: true,    // auto-initialize (default: true)
      destroyOnUnmount: true,  // destroy on unmount (default: true for memory/local)
    }
  )

  // isReady = true  -> storage is available (type: ISyncStorage<FormState>)
  // isReady = false -> storage = null
  if (!isReady) return <div>Loading...</div>

  // After isReady the storage is guaranteed to be non-null
  storage.set('username', 'John')
}
```

## useStorageSubscribe

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function FormFields({ storage }: { storage: ISyncStorage<FormState> }) {
  // Subscribing to a specific field via a selector
  const username = useStorageSubscribe(storage, (s) => s.username)
  const email = useStorageSubscribe(storage, (s) => s.email)
  const agreed = useStorageSubscribe(storage, (s) => s.agreed)

  // Subscribing to the entire state
  const fullState = useStorageSubscribe(storage, (s) => s)

  return <div>{username} — {email} — {String(agreed)}</div>
}
```

## Full example

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
