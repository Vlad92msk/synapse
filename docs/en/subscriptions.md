# Subscriptions (subscribe)

> [Back to Main](../../README.md)

All the ways to subscribe to data changes in a storage. They work the same way for Memory, LocalStorage and IndexedDB.

## 1. subscribe(key, callback)

Subscribing to a specific top-level key. The callback is called on every change of that key.

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

Subscribing via a selector function. The callback is called when the selector's result changes.

```typescript
const unsub = storage.subscribe(
  (state) => state.settings.theme,
  (newTheme) => console.log('theme:', newTheme)  // 'light' | 'dark'
)

// Subscribing to nested fields
const unsub = storage.subscribe(
  (state) => state.user.name,
  (name) => console.log('name:', name)
)

// Computed values
const unsub = storage.subscribe(
  (state) => `${state.user.name} (${state.settings.lang})`,
  (computed) => console.log('computed:', computed)
)

unsub()
```

## 3. subscribeToAll(callback)

Subscribing to ALL storage changes. The callback receives an event with information about the change.

```typescript
const unsub = storage.subscribeToAll((event) => {
  console.log(event.type)          // 'set' | 'update' | 'remove' | 'clear' | 'reset'
  console.log(event.key)           // a key or an array of keys
  console.log(event.changedPaths)  // paths to the changed fields
})

unsub()
```

## 4. useStorageSubscribe (React hook)

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function MyComponent({ storage }: { storage: ISyncStorage<AppState> }) {
  // Subscribing to a single field
  const counter = useStorageSubscribe(storage, (s) => s.counter)

  // Subscribing to a nested field
  const theme = useStorageSubscribe(storage, (s) => s.settings.theme)

  // Subscribing to the entire state
  const fullState = useStorageSubscribe(storage, (s) => s)

  // Computed value — re-render only when the result changes
  const summary = useStorageSubscribe(
    storage,
    (s) => `${s.user.name}, counter: ${s.counter}`
  )

  return <div>{counter} / {theme} / {summary}</div>
}
```
