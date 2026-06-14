# awaitSynapse

> [Back to Main](../../README.md)

A React utility for waiting until a Synapse storage is ready. HOC + hook + programmatic API.

## Creating

```typescript
import { awaitSynapse } from 'synapse-storage/react'
import { createSynapse } from 'synapse-storage/utils'

// Initialization may take time (IndexedDB, loading from the server, etc.)
const configSynapse = createSynapse(async () => {
  const data = await fetch('/api/config').then((r) => r.json())
  const storage = new MemoryStorage({ name: 'config', initialState: data })
  return {
    storage,
    dispatcher: new ConfigDispatcher(storage),
    selectors: new ConfigSelectors(storage),
  }
})

// Create an awaiter — it accepts a handle (thenable)
const awaiter = awaitSynapse(configSynapse, {
  loadingComponent: <div>Loading...</div>,
  errorComponent: (error) => <div>Error: {error.message}</div>,
})
```

## withSynapseReady (HOC)

```typescript
// HOC: shows loadingComponent while the storage isn't ready
// The component renders ONLY when the storage is fully initialized

function MyComponent() {
  // The storage is guaranteed to be ready — it can be used safely
  const store = awaiter.getStoreIfReady()!
  const value = useSelector(store.selectors.someValue)

  return <div>{value}</div>
}

// Wrap it
const MyComponentWithReady = awaiter.withSynapseReady(MyComponent)

// In JSX — it first shows loading, then the component:
<MyComponentWithReady />
```

## useSynapseReady (hook)

```typescript
// A hook for manual control over readiness

function StatusPanel() {
  const { isReady, isPending, isError, store, error } = awaiter.useSynapseReady()

  if (isPending) return <div>Loading...</div>
  if (isError)   return <div>Error: {error?.message}</div>
  if (isReady)   return <div>Store ready! State: {JSON.stringify(store.storage.getStateSync())}</div>
}

// Fields of the returned object:
// isReady:   boolean — the storage is initialized
// isPending: boolean — waiting for initialization
// isError:   boolean — initialization error
// store:     SynapseStore | undefined
// error:     Error | null
```

## Programmatic API

```typescript
// Can be used outside React components

// Synchronous checks
awaiter.isReady()         // boolean
awaiter.getStatus()       // 'pending' | 'ready' | 'error'
awaiter.getError()        // Error | null
awaiter.getStoreIfReady() // store | undefined

// Asynchronous waiting
const store = await awaiter.waitForReady()

// Callbacks (return an unsubscribe function)
const unsub = awaiter.onReady((store) => {
  console.log('Store ready!', store.storage.getStateSync())
})

const unsub2 = awaiter.onError((error) => {
  console.error('Init failed:', error.message)
})

// If the storage is already ready — onReady fires immediately

// Cleanup
awaiter.destroy()
```

## Relation to createSynapseAwaiter

```typescript
// awaitSynapse — a React wrapper around createSynapseAwaiter
// Adds: withSynapseReady (HOC) and useSynapseReady (hook)
// Proxies: waitForReady, isReady, getStoreIfReady, onReady, onError, getStatus, getError, destroy

// For vanilla JS / Node.js / without React — use createSynapseAwaiter directly:
import { createSynapseAwaiter } from 'synapse-storage/utils'
const awaiter = createSynapseAwaiter(configSynapse)
// The same programmatic API, but without React hooks
```
