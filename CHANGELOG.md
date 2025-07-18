# Changelog

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
