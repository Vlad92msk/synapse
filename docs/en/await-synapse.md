# awaitSynapse

> [Back to Main](../../README.md)

React utility for awaiting Synapse store readiness. HOC + hook + programmatic API.

## Creating

```typescript
import { awaitSynapse } from 'synapse-storage/react'
import { createSynapse } from 'synapse-storage/utils'

// Store may take time to initialize (IndexedDB, server loading, etc.)
const storePromise = createSynapse({
  createStorageFn: async () => {
    const data = await fetch('/api/config').then((r) => r.json())
    const storage = new MemoryStorage({ name: 'config', initialState: data })
    await storage.initialize()
    return storage
  },
  createSelectorsFn: (sm) => ({ ... }),
  createDispatcherFn: (storage) => createDispatcher({ storage }, ...),
})

// Create awaiter
const awaiter = awaitSynapse(storePromise, {
  loadingComponent: <div>Loading...</div>,
  errorComponent: (error) => <div>Error: {error.message}</div>,
})
```

## withSynapseReady (HOC)

```typescript
// HOC: shows loadingComponent while store is not ready
// Component renders ONLY when store is fully initialized

function MyComponent() {
  // Store is guaranteed ready — safe to use
  const store = awaiter.getStoreIfReady()!
  const value = useSelector(store.selectors.someValue)

  return <div>{value}</div>
}

// Wrap it
const MyComponentWithReady = awaiter.withSynapseReady(MyComponent)

// In JSX — will show loading, then the component:
<MyComponentWithReady />
```

## useSynapseReady (hook)

```typescript
// Hook for manual readiness control

function StatusPanel() {
  const { isReady, isPending, isError, store, error } = awaiter.useSynapseReady()

  if (isPending) return <div>Loading...</div>
  if (isError)   return <div>Error: {error?.message}</div>
  if (isReady)   return <div>Store ready! State: {JSON.stringify(store.storage.getStateSync())}</div>
}

// Returned object fields:
// isReady:   boolean — store is initialized
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

// Async wait
const store = await awaiter.waitForReady()

// Callbacks (return unsubscribe)
const unsub = awaiter.onReady((store) => {
  console.log('Store ready!', store.storage.getStateSync())
})

const unsub2 = awaiter.onError((error) => {
  console.error('Init failed:', error.message)
})

// If store is already ready — onReady fires immediately

// Cleanup
awaiter.destroy()
```

## Relation to createSynapseAwaiter

```typescript
// awaitSynapse — React wrapper over createSynapseAwaiter
// Adds: withSynapseReady (HOC) and useSynapseReady (hook)
// Proxies: waitForReady, isReady, getStoreIfReady, onReady, onError, getStatus, getError, destroy

// For vanilla JS / Node.js / without React — use createSynapseAwaiter directly:
import { createSynapseAwaiter } from 'synapse-storage/utils'
const awaiter = createSynapseAwaiter(storePromise)
// Same programmatic API, but without React hooks
```
