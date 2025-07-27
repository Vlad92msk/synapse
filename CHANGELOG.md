# Changelog

# Changelog

## [3.0.16] - 2025-07-25

### ✨ Added

- **Singleton Storage Support**: Ability to create singleton storage instances for reuse across components
- **Storage Factory**: New `StorageFactory` for convenient storage creation
- **React Hook `useCreateStorage`**: New hook for creating storage in React components

### 🛠 Improved

- **Simplified Storage Configuration**: Removed `type` parameter duplication in storage configurations
- **Enhanced TypeScript Support**: Improved type inference and autocompletion

### 📖 Usage Examples

#### Singleton Storage
```typescript
// Component A
const storage1 = new MemoryStorage({
  name: 'shared-data',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.DEEP_MERGE,
    warnOnConflict: true,
  },
  initialState: { count: 0 }
})

// Component B - will get the same instance
const storage2 = new MemoryStorage({
  name: 'shared-data', // Same name
  singleton: {
    enabled: true,
  },
  initialState: { count: 5 } // Will be ignored
})
```

#### Storage Factory
```typescript
const userStorage = StorageFactory.createMemory({
  name: 'user',
  singleton: { enabled: true },
  initialState: { name: '', email: '' }
})

const settingsStorage = StorageFactory.createLocal({
  name: 'settings',
  initialState: { theme: 'light' }
})

// Universal method (with type)
const dynamicStorage = StorageFactory.create({
  name: 'cache',
  type: 'indexedDB',
  initialState: { items: [] }
})
```

#### React Hook `useCreateStorage`
```tsx
function UseSynapseStorageExample() {
  const { storage, isReady } = useCreateStorage<{ notifications: string[] }>({
    type: 'localStorage',
    name: 'notifications',
    initialState: { notifications: [] },
  })

  useEffect(() => {
    if (!isReady || !storage) return

    // Subscribe to a specific field
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

  return (
    <div>
      <button onClick={addNotification}>Add Notification</button>
    </div>
  )
}
```

### 🚨 Breaking Changes

- **Storage Configuration**: Removed `type` parameter from `MemoryStorageConfig`, `LocalStorageConfig`, `IndexedDBStorageConfig`
  - Use specific factory methods or `UniversalStorageConfig` for dynamic type selection

---

## [3.0.15] - 2025-07-18

### 🚨 Breaking Changes

- **createSynapseCtx**: Removed `contextProps` parameter from `contextSynapse` function
  - Use actions within components to set initial state instead
  - Simplified component wrapper signature

### 🐛 Fixed

- **Storage Delete Logic**: Fixed plugin validation in delete operations
- **Cache Invalidation**: Fixed cache invalidation for non-cached API endpoints
- **Memory Leaks**: Improved cleanup in awaiter utilities and context providers

### 📖 Usage Examples

```tsx
// Framework-agnostic usage
import { createSynapseAwaiter } from 'synapse-storage/core'

const awaiter = createSynapseAwaiter(userMediaSynapse)
awaiter.onReady(store => console.log('Ready!', store))
const store = await awaiter.waitForReady()

// React usage
import { awaitSynapse } from 'synapse-storage/react'

const userMediaReady = awaitSynapse(userMediaSynapse, {
  loadingComponent: <Spinner />,
  errorComponent: (error) => <ErrorBoundary error={error} />
})

const MediaComponent = userMediaReady.withSynapseReady(() => {
  // Synapse guaranteed to be ready here
  return <div>Content</div>
})

// Simplified context (no contextProps)
const userMediaCtx = createSynapseCtx(userMediaSynapse, {
  loadingComponent: <div>Loading...</div>
})

const Component = userMediaCtx.contextSynapse(() => {
  const actions = userMediaCtx.useSynapseActions()
  
  useEffect(() => {
    // Set initial state via actions instead of contextProps
    actions.moduleEnter({ selectedType: 'image' })
  }, [])
  
  return <div>Ready!</div>
})
```
---

## [3.0.14] - 2025-06-21

### 🐛 Fixed

- **Logger Middleware**: Fixed issue with dispatcher logger not displaying properly formatted output

---

## [3.0.13] - 2025-06-08

### ✨ Added

- **Enhanced Watcher System**: Added `startWithCurrentValue` option to `createWatcher()` for controlling initial value emission
  - Control whether watchers emit current state value immediately upon subscription
  - Useful for module synchronization and component initialization scenarios
  - Backwards compatible - defaults to `false` for safe behavior

### 🛠 Improved

- **ESM-Only Build**: Migrated to ESM-only distribution for modern JavaScript ecosystem
  - Removed CommonJS build to reduce bundle size and complexity
  - Improved tree shaking and static analysis capabilities
  - Faster builds and smaller library footprint
  - **Breaking Change**: Node.js 14+ required with `"type": "module"` in package.json

### 📖 Usage Examples

```typescript
// Watcher with immediate current value emission
watchCurrentUserProfile: createWatcher({
  type: 'watchCurrentUserProfile',
  selector: (state) => state.currentUserProfile?.user_info,
  shouldTrigger: (prev, curr) => JSON.stringify(prev) !== JSON.stringify(curr),
  startWithCurrentValue: true, // Emit current value on subscription
  meta: { description: 'Sync user profile between modules' },
})

// Watcher for tracking only changes (default behavior)
watchUserActions: createWatcher({
  type: 'watchUserActions', 
  selector: (state) => state.user.lastAction,
  shouldTrigger: (prev, curr) => prev?.id !== curr?.id,
  startWithCurrentValue: false, // Only emit on changes (default)
  meta: { description: 'Track new user actions only' },
})
```

### 🚨 Breaking Changes

- **ESM-Only**: Library now requires modern JavaScript environment
  - Node.js 14+ with ESM support
  - Modern bundlers (Webpack 5+, Vite, Rollup)
  - Update your package.json to include `"type": "module"`

---
---
## [3.0.12] - 2025-06-01

### ✨ Added

- **Storage Status Tracking**: Monitor initialization progress with `onStatusChange()` and `waitForReady()`
- **Dependency Management**: Control synapse initialization order with `dependencies` property
- **EventBus**: New `createEventBus()` utility for decoupled communication between modules
- **Configuration Validation**: Comprehensive validation with detailed error messages

### 🛠 Improved

- Enhanced error handling during storage initialization
- Better TypeScript support and type inference
- Improved cleanup and memory management

### 📖 Usage Examples

```typescript
// Status tracking
const storage = new MemoryStorage(config)
storage.onStatusChange(status => console.log(status.status))
await storage.initialize()

// Dependencies
const synapse = await createSynapse({
  dependencies: [coreSynapse], // Wait for dependencies
  // ... config
})

// EventBus
const eventBus = await createEventBus({ name: 'app-events' })
eventBus.dispatcher.publish({ event: 'USER_UPDATED', data: {...} })
```

---
