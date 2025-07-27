> [🏠 Home](../../README.md)
> [🏠 Changelog](../../CHANGELOG.md)

# Additional Utilities and Features
___

## 🏭 Storage Factory

StorageFactory provides a convenient way to create storages with improved typing and singleton pattern support.

### Approach Comparison

```typescript
import { StorageFactory, MemoryStorage } from 'synapse-storage/core'

// Classic approach
const storage1 = await new MemoryStorage({ 
  name: 'test', 
  initialState: { value: 0 } 
}).initialize()

// New approach through factory (recommended)
const storage2 = await StorageFactory.createMemory({ 
  name: 'test', 
  initialState: { value: 0 } 
}).initialize()
```

**StorageFactory advantages:**
- 📦 Uniform API for all storage types
- 🚀 Dynamic storage type selection capability

### Ready-to-use Templates

```typescript
import { StorageFactory } from 'synapse-storage/core'

// Memory Storage - data stored in memory
const userStorage = await StorageFactory.createMemory({
  name: 'user',
  singleton: { enabled: true }, // Singleton support
  initialState: { name: '', email: '' }
}).initialize()

// Local Storage - data in browser localStorage
const settingsStorage = await StorageFactory.createLocal({
  name: 'settings',
  initialState: { theme: 'light', language: 'en' }
}).initialize()

// IndexedDB Storage - data in IndexedDB
const cacheStorage = await StorageFactory.createIndexedDB({
  name: 'cache',
  options: { // IndexedDB configuration
    dbName: 'MyApp',
    version: 1
  },
  initialState: { items: [] }
}).initialize()

// Now you can use them
await userStorage.set('name', 'John Doe')
await settingsStorage.update(state => { state.theme = 'dark' })
```

### Universal Creation Method

```typescript
// Dynamic creation with type specification
const dynamicStorage = await StorageFactory.create({
  name: 'cache',
  type: 'indexedDB', // 'memory' | 'localStorage' | 'indexedDB'
  initialState: { items: [] },
  options: { // For IndexedDB
    dbName: 'DynamicDB',
    version: 1
  }
}).initialize()

// Ready to use!
await dynamicStorage.set('items', [{ id: 1, name: 'Item 1' }])
```

### Singleton Storages

Singleton allows reusing one storage instance between different components:

```typescript
import { ConfigMergeStrategy } from 'synapse-storage/core'

// Component A creates singleton
const storage1 = await StorageFactory.createMemory({
  name: 'shared-data',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.DEEP_MERGE, // Configuration merge strategy
    warnOnConflict: true, // Warn about configuration conflicts
  },
  initialState: { count: 0, user: { name: 'John' } }
}).initialize()

// Component B gets the same instance
const storage2 = await StorageFactory.createMemory({
  name: 'shared-data', // Same name = same instance
  singleton: {
    enabled: true,
  },
  initialState: { count: 5 } // Will be ignored or merged
}).initialize()

console.log(storage1 === storage2) // true
```

### Configuration Merge Strategies

```typescript
// Available merge strategies
enum ConfigMergeStrategy {
  IGNORE = 'ignore',           // Ignore new configuration
  REPLACE = 'replace',         // Replace with new configuration
  SHALLOW_MERGE = 'shallow',   // Shallow merge
  DEEP_MERGE = 'deep'          // Deep merge (default)
}
```

### Storage Factory Initialization

```typescript
// StorageFactory creates storages synchronously but requires initialization
const storage = StorageFactory.createMemory({
  name: 'example',
  initialState: { value: 0 }
})

// Initialization (asynchronous)
await storage.initialize()

// Now you can use it
await storage.set('value', 100)
```

---

## 🔄 Common Utilities

### createSynapseAwaiter - Universal Readiness Awaiting

**Purpose:** Awaiting Synapse initialization in any JavaScript environment (Node.js, browser, React Native, etc.)

**When to use:**
- 🔧 Integration with frameworks other than React
- 🎯 Precise control over the moment of Synapse usage
- 🔄 Reusing waiting logic between projects
- 📱 Development for React Native, Electron, Node.js

```typescript
import { createSynapseAwaiter } from 'synapse-storage/core'

const awaiter = createSynapseAwaiter(userMediaSynapse)

// In Angular, Vue, Svelte or vanilla JS
awaiter.onReady(store => {
  console.log('Synapse is ready!', store)
  // Initialize UI, start application logic
})

// Waiting with error handling
try {
  const store = await awaiter.waitForReady()
  // Work with ready store
} catch (error) {
  console.error('Initialization error:', error)
}

// Synchronous check
if (awaiter.isReady()) {
  const store = awaiter.getStoreIfReady()
  // Use store without waiting
}
```

---

## ⚛️ React Utilities

### useCreateStorage Hook (v3.0.16+)

New hook for creating storages directly in React components:

```tsx
import { useCreateStorage } from 'synapse-storage/react'

function NotificationsComponent() {
  const { 
    storage, 
    isReady, 
    isLoading, 
    hasError, 
    status, 
    initialize, 
    destroy 
  } = useCreateStorage<{ notifications: string[] }>({
    type: 'localStorage',
    name: 'notifications',
    initialState: { notifications: [] },
    // Optional: singleton settings
    singleton: {
      enabled: true,
      mergeStrategy: ConfigMergeStrategy.DEEP_MERGE
    }
  }, {
    autoInitialize: true,    // Automatic initialization (default)
    destroyOnUnmount: true   // Destroy on unmount (default)
  })

  useEffect(() => {
    if (!isReady || !storage) return

    // Subscribe to specific field
    const unsubscribe = storage.subscribe(
      (state) => state.notifications,
      (notifications) => {
        console.log('Notifications updated:', notifications)
      },
    )

    return unsubscribe
  }, [isReady, storage])

  const addNotification = async () => {
    if (storage) {
      await storage.update((state) => {
        state.notifications.push(`Notification ${Date.now()}`)
      })
    }
  }

  // Handle states
  if (hasError) return <div>Error: {status.error?.message}</div>
  if (isLoading) return <div>Initializing storage...</div>
  if (!isReady || !storage) return <div>Storage not ready</div>

  return (
    <div>
      <button onClick={addNotification}>Add Notification</button>
      <button onClick={initialize}>Reinitialize</button>
      <button onClick={destroy}>Destroy Storage</button>
    </div>
  )
}
```

### awaitSynapse - Simple Waiting in React

**Purpose:** Simple waiting for Synapse readiness in React without creating context

**When to use:**
- 🎯 Simple cases - only need to wait for readiness
- 🔄 No need for shared state between components
- ⚡ Quick solution for single components

```tsx
import { awaitSynapse } from 'synapse-storage/react'

const userMediaReady = awaitSynapse(userMediaSynapse, {
  loadingComponent: <Spinner />,
  errorComponent: (error) => <ErrorBoundary error={error} />
})

// Simple usage - HOC
const MediaComponent = userMediaReady.withSynapseReady(() => {
  // Synapse is guaranteed to be ready
  return <div>Content ready to display</div>
})

// Or hook for more control
function MyComponent() {
  const { isReady, isError, isPending, store, error } = userMediaReady.useSynapseReady()

  if (isPending) return <div>Loading...</div>
  if (isError) return <div>Error: {error?.message}</div>
  
  return <div>Store ready: {store.storage.name}</div>
}
```

### createSynapseCtx - React Context with Extended Capabilities

**Purpose:** Full-featured React context for Synapse with access to all capabilities

**When to use:**
- 🌐 Need shared state between multiple components
- 🎛️ Require access to actions, selectors, storage in different parts of the application
- 📊 Working with reactive streams (state$)
- 🏗️ Complex architecture with deeply nested components

**Tip:** If you're currently using `awaitSynapse` but might need context in the future - just replace it with `createSynapseCtx`. The API remains compatible, but React context functionality is added.

```tsx
import { createSynapseCtx } from 'synapse-storage/react'

// Create context
const userMediaCtx = createSynapseCtx(userMediaSynapse, {
  loadingComponent: <div>Loading context...</div>
})

// Parent component
const App = userMediaCtx.contextSynapse(() => {
  return (
    <div>
      <HeaderComponent />
      <MainComponent />
      <FooterComponent />
    </div>
  )
})

// Child components can use any hooks
function HeaderComponent() {
  const actions = userMediaCtx.useSynapseActions()
  const selectors = userMediaCtx.useSynapseSelectors()
  
  return <header onClick={() => actions.updateUser(...)}>Header</header>
}

function MainComponent() {
  const storage = userMediaCtx.useSynapseStorage()
  const state$ = userMediaCtx.useSynapseState$() // Only for effects
  
  return <main>Main Content</main>
}
```

---

## 💡 Utility Selection Recommendations

### Decision-making Flowchart:

```
Do you need React? 
├─ No → createSynapseAwaiter (universal)
└─ Yes → Do you need context?
    ├─ No → awaitSynapse (simple waiting)
    └─ Yes → createSynapseCtx (full functionality)
```

### Example Scenarios:

- **Node.js server, Electron:** `createSynapseAwaiter`
- **Simple React component:** `awaitSynapse`
- **React app with shared state:** `createSynapseCtx`
- **Creating storage in component:** `useCreateStorage`

---

## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### All Sections:
- [🚀 Basic Usage](./basic-usage.md)
- [🧮 Redux-style Computed Selectors](./redux-selectors.md)
- [⚙️ Middlewares](./middlewares.md)
- [🌐 API Client](./api-client.md)
- [⚡ Create Dispatcher](./create-dispatcher.md)
- [⚡ Create Effects](./create-effects.md)
- [⚡ Create Effects Module](./create-effects-module.md)
- [🛠️ createSynapse Utility](./create-synapse.md)
- [🔌 Creating Custom Plugins](./custom-plugins.md)
- [⚙️ Creating Custom Middlewares](./custom-middlewares.md)
