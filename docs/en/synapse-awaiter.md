# createSynapseAwaiter — Framework-Agnostic Awaiter

> [Back to Main](../../README.md)

Wrapper for awaiting async store initialization. Works in any JS environment: Node.js, browser, React Native.

## Imports

```typescript
import { createSynapse, createSynapseAwaiter } from 'synapse-storage/utils'
```

## Creating

```typescript
// createSynapseAwaiter accepts Promise<SynapseStore> or a ready SynapseStore

// Option 1: Promise (typical case — async initialization)
const storePromise = createSynapse({
  createStorageFn: async () => {
    const config = await fetch('/api/config').then(r => r.json())
    const storage = new MemoryStorage<ConfigState>({
      name: 'app-config',
      initialState: config,
    })
    storage.initialize()
    return storage
  },
})

const awaiter = createSynapseAwaiter(storePromise)

// Option 2: already ready store (wrapped in Promise.resolve)
const readyStore = await createSynapse({ storage: myStorage })
const awaiter2 = createSynapseAwaiter(readyStore)
```

## isReady() / getStatus() / getError()

```typescript
// Synchronous readiness check
awaiter.isReady()     // boolean

// Current status
awaiter.getStatus()   // 'pending' | 'ready' | 'error'

// Initialization error (if any)
awaiter.getError()    // Error | null
```

## getStoreIfReady()

```typescript
// Returns store if ready, or undefined
const store = awaiter.getStoreIfReady()

if (store) {
  // SynapseStore — type depends on createSynapse config:
  // - SynapseStoreBasic           (without dispatcher)
  // - SynapseStoreWithDispatcher
  // - SynapseStoreWithEffects
  //
  // Always has:
  //   store.storage   — ISyncStorage | IAsyncStorage
  //   store.selectors — selectors object
  //   store.destroy() — resource cleanup
  //
  // With dispatcher additionally:
  //   store.actions    — typed actions
  //   store.dispatcher — raw dispatcher
  //
  // With effects additionally:
  //   store.state$     — Observable<TStore>

  const state = store.storage.getStateSync()
  console.log(state.locale)  // 'ru'
}
```

## waitForReady()

```typescript
// Async wait — returns Promise<SynapseStore>
const store = await awaiter.waitForReady()

// Safe to call multiple times — returns the same store
const store1 = await awaiter.waitForReady()
const store2 = await awaiter.waitForReady()
// store1 === store2
```

## onReady() / onError()

```typescript
// Subscribe to readiness — returns unsubscribe function
const unsub = awaiter.onReady((store) => {
  console.log('Store ready!')
  const state = store.storage.getStateSync()
  console.log(state)
})

// If store is already ready — callback fires immediately (synchronously)
// Multiple handlers can be subscribed

// Subscribe to error
const unsubErr = awaiter.onError((error) => {
  console.error('Init failed:', error.message)
})

// If error already occurred — callback fires immediately

// Unsubscribe
unsub()
unsubErr()
```

## destroy()

```typescript
// Resource cleanup: resets subscriptions, status -> 'pending', store -> undefined
awaiter.destroy()

// After destroy:
awaiter.isReady()        // false
awaiter.getStatus()      // 'pending'
awaiter.getStoreIfReady() // undefined
```

## Usage in React Component

```typescript
function ConfigPanel() {
  const [status, setStatus] = useState(awaiter.getStatus())
  const [config, setConfig] = useState<ConfigState | null>(null)

  useEffect(() => {
    const unsubReady = awaiter.onReady((store) => {
      setStatus('ready')
      setConfig(store.storage.getStateSync())
    })

    const unsubError = awaiter.onError(() => {
      setStatus('error')
    })

    // If already ready — update immediately
    if (awaiter.isReady()) {
      setStatus('ready')
      setConfig(awaiter.getStoreIfReady()?.storage.getStateSync() ?? null)
    }

    return () => { unsubReady(); unsubError() }
  }, [])

  if (status === 'pending') return <div>Loading config...</div>
  if (status === 'error') return <div>Error!</div>
  return <div>Locale: {config?.locale}</div>
}
```
