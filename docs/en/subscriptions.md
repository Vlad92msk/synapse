# Subscriptions (subscribe)

> [Back to Main](../../README.md)

All ways to subscribe to data changes in storage. Work identically for Memory, LocalStorage, and IndexedDB.

## 1. subscribe(key, callback)

Subscribe to a specific top-level key. Callback is called on each change to that key.

```typescript
const unsub = storage.subscribe('counter', (newValue) => {
  console.log('counter changed:', newValue)  // number
})

const unsub = storage.subscribe('user', (newUser) => {
  console.log('user changed:', newUser)  // { name, email }
})

// Unsubscribe
unsub()
```

## 2. subscribe(selector, callback)

Subscribe via a selector function. Callback is called when the selector's result changes.

```typescript
const unsub = storage.subscribe(
  (state) => state.settings.theme,
  (newTheme) => console.log('theme:', newTheme)  // 'light' | 'dark'
)

// Subscribe to nested fields
const unsub = storage.subscribe(
  (state) => state.user.name,
  (name) => console.log('name:', name)
)

// Compute values
const unsub = storage.subscribe(
  (state) => `${state.user.name} (${state.settings.lang})`,
  (computed) => console.log('computed:', computed)
)

unsub()
```

## 3. subscribeToAll(callback)

Subscribe to ALL storage changes. Callback receives an event with change information.

```typescript
const unsub = storage.subscribeToAll((event) => {
  console.log(event.type)          // 'set' | 'update' | 'remove' | 'clear' | 'reset'
  console.log(event.key)           // key or array of keys
  console.log(event.changedPaths)  // paths to changed fields
})

unsub()
```

## 4. useStorageSubscribe (React hook)

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function MyComponent({ storage }: { storage: ISyncStorage<AppState> }) {
  // Subscribe to one field
  const counter = useStorageSubscribe(storage, (s) => s.counter)

  // Subscribe to nested field
  const theme = useStorageSubscribe(storage, (s) => s.settings.theme)

  // Subscribe to entire state
  const fullState = useStorageSubscribe(storage, (s) => s)

  // Computed value — re-render only when result changes
  const summary = useStorageSubscribe(
    storage,
    (s) => `${s.user.name}, counter: ${s.counter}`
  )

  return <div>{counter} / {theme} / {summary}</div>
}
```
