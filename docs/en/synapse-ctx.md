# createSynapseCtx

> [Back to Main](../../README.md)

React Context + HOC for accessing Synapse store through hooks. Automatic loading while the store initializes.

## Creating the Context

```typescript
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'

// 1. Create the store (as usual)
const storePromise = createSynapse({
  storage: new MemoryStorage<SettingsState>({ name: 'settings', initialState }),
  createSelectorsFn: (sm) => ({
    theme: sm.createSelector((s) => s.theme),
    fontSize: sm.createSelector((s) => s.fontSize),
    isDark: sm.createSelector((s) => s.theme === 'dark'),
  }),
  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_s, { createAction }) => ({
      toggleTheme: createAction({ type: 'toggleTheme', action: () => { ... } }),
      setFontSize: createAction({ type: 'setFontSize', action: (size: number) => { ... } }),
    })),
})

// 2. Create context from store promise
const {
  contextSynapse,       // HOC — wraps component, providing context
  useSynapseStorage,    // () => IStorage<T>
  useSynapseSelectors,  // () => { theme, fontSize, ... }
  useSynapseActions,    // () => { toggleTheme, setFontSize, ... }
  cleanupSynapse,       // () => Promise<void>
} = createSynapseCtx(storePromise, {
  loadingComponent: <div>Loading...</div>,  // shown while store is not ready
})
```

## Using Hooks in Child Components

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
  // Direct access to storage — e.g. for getStateSync(), update(), set()
  const state = storage.getStateSync()
}
```

## HOC contextSynapse()

```typescript
// contextSynapse() wraps the root component
// All child components get access to hooks

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

// Wrap — loadingComponent is shown while store is not ready
const SettingsPanelWithContext = contextSynapse(SettingsPanel)

// Usage in JSX:
<SettingsPanelWithContext />
```

## useSynapseState$ (only with effects)

```typescript
// Available only if the store was created with createEffectConfig + effects
// Returns Observable<TState> for use with RxJS

const { useSynapseState$ } = createSynapseCtx(storeWithEffectsPromise)

function MyComponent() {
  const state$ = useSynapseState$()

  useEffect(() => {
    const sub = state$.subscribe((state) => {
      console.log('state changed:', state)
    })
    return () => sub.unsubscribe()
  }, [state$])
}
```

## Cleanup

```typescript
// Manual cleanup of context and resources
await cleanupSynapse()

// Calls store.destroy() internally
// Resets lazy-promise initialization
```

## Three Variants of createSynapseCtx

```typescript
// 1. Basic (storage + selectors)
// Available: useSynapseStorage, useSynapseSelectors, cleanupSynapse
const ctx = createSynapseCtx(basicStorePromise)

// 2. With dispatcher (+ actions)
// Available: + useSynapseActions
const ctx = createSynapseCtx(dispatcherStorePromise)

// 3. With effects (+ state$)
// Available: + useSynapseState$
const ctx = createSynapseCtx(effectsStorePromise)
```
