# createSynapseCtx

> [Back to Main](../../README.md)

React Context + HOC for accessing a Synapse module through hooks. A lazy handle is passed in: the factory starts
on the first mount of the Provider (not on import), with an automatic `loadingComponent` during initialization.

## Creating the context

```typescript
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { createSynapse } from 'synapse-storage/utils'

// 1. Create a lazy handle (as usual)
const settingsSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<SettingsState>({ name: 'settings', initialState })
  return {
    storage,
    dispatcher: new SettingsDispatcher(storage),
    selectors: new SettingsSelectors(storage),
  }
})

// 2. Create the context — pass the handle ITSELF, not a call.
//    The factory starts lazily on the first mount, not on import.
const {
  contextSynapse,       // HOC — wraps a component, providing the context
  useSynapseStorage,    // () => IStorage<T>
  useSynapseSelectors,  // () => SettingsSelectors
  useSynapseActions,    // () => SettingsDispatcher (actions)
  useSynapseState$,     // () => Observable<TState> (only with effects)
  cleanupSynapse,       // () => Promise<void>
} = createSynapseCtx(settingsSynapse, {
  loadingComponent: <div>Loading...</div>,  // shown while the module isn't ready
})
```

## Using the hooks in child components

```typescript
// Child components are called ONLY inside the contextSynapse HOC

function ThemeDisplay() {
  const selectors = useSynapseSelectors()
  const theme = useSelector(selectors.theme)       // reactive value
  const isDark = useSelector(selectors.isDark)

  return <div>Theme: {theme}, isDark: {String(isDark)}</div>
}

function FontSizeControl() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const fontSize = useSelector(selectors.fontSize)

  return (
    <div>
      Size: {fontSize}px
      <button onClick={() => actions.setFontSize(fontSize - 2)}>A-</button>
      <button onClick={() => actions.setFontSize(fontSize + 2)}>A+</button>
    </div>
  )
}

function DirectAccess() {
  const storage = useSynapseStorage()
  // Direct access to the storage — e.g. for getStateSync(), update(), set()
  const state = storage.getStateSync()
}
```

## HOC contextSynapse()

```typescript
function SettingsPanel() {
  const actions = useSynapseActions()
  return (
    <div>
      <button onClick={() => actions.toggleTheme()}>Toggle Theme</button>
      <ThemeDisplay />
      <FontSizeControl />
    </div>
  )
}

// Wrap it — loadingComponent is shown while the module isn't ready
const SettingsPanelWithContext = contextSynapse(SettingsPanel)

// Usage in JSX:
<SettingsPanelWithContext />
```

## useSynapseState$ (only with effects)

```typescript
// Available only if effects were passed to the factory.
// Returns Observable<TState> for use with RxJS.

const { useSynapseState$ } = createSynapseCtx(synapseWithEffects)

function MyComponent() {
  const state$ = useSynapseState$()

  useEffect(() => {
    const sub = state$.subscribe((state) => console.log('state changed:', state))
    return () => sub.unsubscribe()
  }, [state$])
}
```

## Reactive reads in a component

Writes still go through actions, but reading can be reactive — straight from the selector's stream:

```typescript
import { useObservable, useSubscription } from 'synapse-storage/react'

function SearchBox() {
  const selectors = useSynapseSelectors()

  const debounced = useObservable(
    () => selectors.searchQuery.$.pipe(debounceTime(300), distinctUntilChanged()),
    '',
    [selectors],
  )

  useSubscription(() => selectors.lastId.$.pipe(skip(1), tap(scrollToEnd)).subscribe(), [selectors])

  return <div>{debounced}</div>
}
```

## Cleanup

```typescript
// Manual cleanup of the context and resources
await cleanupSynapse()

// For a class-handle it delegates to handle.destroy() (LIFO teardown + memoization reset) —
// the next mount will run the factory again.
```

## Three variants of createSynapseCtx

```typescript
// 1. Basic (storage + selectors)
// Available: useSynapseStorage, useSynapseSelectors, cleanupSynapse
const ctx = createSynapseCtx(basicSynapse)

// 2. With a dispatcher (+ actions)
// Available: + useSynapseActions
const ctx = createSynapseCtx(dispatcherSynapse)

// 3. With effects (+ state$)
// Available: + useSynapseState$
const ctx = createSynapseCtx(effectsSynapse)
```
