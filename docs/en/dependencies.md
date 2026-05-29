# Dependencies

> [Back to Main](../../README.md)

One `createSynapse` can depend on another. Dependencies are awaited before initialization.

## Dependency (Auth store)

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'

// Auth store — others will depend on it
const authStorePromise = createSynapse({
  createStorageFn: async () => {
    await fetchAuth()  // async initialization
    const storage = new MemoryStorage<AuthState>({
      name: 'auth',
      initialState: { token: 'jwt-123', userId: 'user-1' },
    })
    storage.initialize()
    return storage
  },
  createSelectorsFn: (sm) => ({
    token: sm.createSelector((s) => s.token),
    userId: sm.createSelector((s) => s.userId),
  }),
  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_s, { createAction }) => ({
      login: createAction({
        type: 'login',
        action: (userId: string) => {
          storage.update((s) => { s.token = `jwt-${userId}`; s.userId = userId })
        },
      }),
      logout: createAction({
        type: 'logout',
        action: () => {
          storage.update((s) => { s.token = null; s.userId = null })
        },
      }),
    })),
})
```

## Dependent store (Settings)

```typescript
// Settings store — waits for Auth to be ready
const settingsStorePromise = createSynapse({
  // Array of dependencies — all awaited in parallel via Promise.all
  dependencies: [authStorePromise],

  // Wait timeout (ms, default 30000)
  dependencyTimeout: 5000,

  // By the time createStorageFn is called, all dependencies are ready
  createStorageFn: async () => {
    const authStore = await authStorePromise
    const userId = authStore.storage.getStateSync().userId

    const storage = new MemoryStorage<SettingsState>({
      name: 'settings',
      initialState: { theme: 'dark', loadedForUser: userId },
    })
    storage.initialize()
    return storage
  },

  createSelectorsFn: (sm) => ({
    theme: sm.createSelector((s) => s.theme),
    loadedForUser: sm.createSelector((s) => s.loadedForUser),
  }),
})
```

## Dependency Chain

```typescript
// Dashboard depends on both Auth AND Settings
const dashboardStorePromise = createSynapse({
  dependencies: [authStorePromise, settingsStorePromise],
  dependencyTimeout: 10000,

  createStorageFn: async () => {
    const auth = await authStorePromise
    const settings = await settingsStorePromise
    // Both stores are guaranteed ready
    ...
  },
})
```

## Initialization Order

```typescript
// Order inside createSynapse:
// 1. dependencies ready (Promise.all + timeout)
// 2. storage create (storage or createStorageFn)
// 3. storage.initialize()
// 4. createSelectorsFn
// 5. createDispatcherFn
// 6. effects start

// On timeout — Error is thrown:
// "Dependency 0 ("auth") timed out after 5000ms"

// Dependency must have storage.waitForReady()
// Any createSynapse result works as a dependency
```
