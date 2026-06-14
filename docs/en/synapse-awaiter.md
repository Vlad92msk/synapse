# createSynapseAwaiter — Framework-agnostic awaiter

> [Back to Main](../../README.md)

A wrapper for waiting on a store's asynchronous initialization. Works in any JS environment: Node.js, browser, React Native.

## Imports

```typescript
import { createSynapse, createSynapseAwaiter } from 'synapse-storage/utils'
```

## Creating

```typescript
// createSynapseAwaiter accepts a handle (thenable), a Promise<SynapseStore>, or a ready store

// Option 1: a lazy handle (the typical case — async initialization in the factory)
const configSynapse = createSynapse(async () => {
  const config = await fetch('/api/config').then((r) => r.json())
  const storage = new MemoryStorage<ConfigState>({ name: 'app-config', initialState: config })
  return { storage, selectors: new ConfigSelectors(storage) }
})

const awaiter = createSynapseAwaiter(configSynapse)

// Option 2: an already-ready store
const readyStore = await configSynapse
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

> **SSR sync-fast-path (5.0.1).** If the input is an already-built synapse (or a handle whose
> `getSnapshot()` returns a synapse with a `READY` storage), the awaiter sets `store`/`status='ready'`
> **synchronously in the function body**, before returning. Then `getStoreIfReady()`/`isReady()` return
> the store on the first synchronous render (needed for server `renderToString`). A not-yet-ready handle
> falls back to the previous async path.

```typescript
// Returns the store if ready, or undefined
const store = awaiter.getStoreIfReady()

if (store) {
  // Synapse — the assembled module; its shape depends on the createSynapse configuration:
  // - basic                (storage + selectors)
  // - with a dispatcher
  // - with effects
  //
  // Always has:
  //   store.storage   — ISyncStorage | IAsyncStorage
  //   store.selectors — the selectors object
  //   store.destroy() — resource cleanup
  //
  // With a dispatcher, additionally:
  //   store.actions    — typed actions
  //   store.dispatcher — the raw dispatcher
  //
  // With effects, additionally:
  //   store.state$     — Observable<TStore>

  const state = store.storage.getStateSync()
  console.log(state.locale)  // 'ru'
}
```

## waitForReady()

```typescript
// Asynchronous waiting — returns a Promise<SynapseStore>
const store = await awaiter.waitForReady()

// Safe to call multiple times — returns the same store
const store1 = await awaiter.waitForReady()
const store2 = await awaiter.waitForReady()
// store1 === store2
```

## onReady() / onError()

```typescript
// Subscribing to readiness — returns an unsubscribe function
const unsub = awaiter.onReady((store) => {
  console.log('Store ready!')
  const state = store.storage.getStateSync()
  console.log(state)
})

// If the store is already ready — the callback is called immediately (synchronously)
// Multiple handlers can be subscribed

// Subscribing to an error
const unsubErr = awaiter.onError((error) => {
  console.error('Initialization failed:', error.message)
})

// If the error has already occurred — the callback is called immediately

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

## Usage in a React component

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

    // If already ready — update right away
    if (awaiter.isReady()) {
      setStatus('ready')
      setConfig(awaiter.getStoreIfReady()?.storage.getStateSync() ?? null)
    }

    return () => { unsubReady(); unsubError() }
  }, [])

  if (status === 'pending') return <div>Loading configuration...</div>
  if (status === 'error') return <div>Error!</div>
  return <div>Locale: {config?.locale}</div>
}
```
