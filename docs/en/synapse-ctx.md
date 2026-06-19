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

## SSR — server-rendering seeded sync stores

> Available since **5.0.1**. Classic `renderToString` only (streaming/Suspense is out of scope).

By default `createSynapseCtx` gates children behind `loadingComponent` until the module is ready —
on the server this yields empty HTML (no SEO, no first paint from server-state). The `ssr: true`
flag enables a mode where a synchronously-ready store (Memory/LocalStorage) renders content right away.

### Options

```typescript
const PostsSynapse = createSynapseCtx(postsSynapse, {
  loadingComponent: <Spinner />,
  ssr: true, // enable server-rendering of seeded sync stores
})
```

`dehydrate` helper and the Provider prop:

```typescript
// Server helper: collect a serializable store snapshot.
dehydrate(opts?: { initialState?: Partial<TState> }): Promise<TState>

// Provider (any HOC from contextSynapse) accepts the snapshot as a prop:
<Wrapped dehydratedState={snapshot} />
```

### Server: build the snapshot

`dehydrate` creates a **per-request fork** of the module (parallel requests do not share state —
no request bleed), seeds `initialState` via `hydrate`, and returns a serializable snapshot. With
`ssr: true` it additionally warms the main handle with the same snapshot, so a synchronous
`renderToString` gets a ready store on the first render.

```typescript
const feed = await fetchFeed()
const dehydrated = await PostsSynapse.dehydrate({ initialState: { posts: feed } })

const html = renderToString(<PostsFeedWithCtx dehydratedState={dehydrated} />)
// serialize into HTML: window.__SYNAPSE_STATE__ = JSON.stringify(dehydrated)
```

> **RSC / `'use client'` boundary.** `createSynapseCtx` is usually called from a `'use client'`
> module, so its `dehydrate` (a closure) cannot be imported on the server (RSC / `'server only'`).
> For that case there is a **server-safe** `dehydrateModule` from `synapse-storage/utils` — no React
> dependencies, takes the module explicitly. `dehydrate` wraps it (same logic, no duplication):
>
> ```typescript
> import { dehydrateModule } from 'synapse-storage/utils'
>
> // in a server (RSC) file — postsSynapse is imported directly, no 'use client' context
> const dehydrated = await dehydrateModule(postsSynapse, { ssr: true, state: { posts: feed } })
> ```
>
> `state` is merged on top of the fork's `initialState` (shallow, top-level) — you may pass only the
> changed fields; nested objects are replaced wholesale.

### Client: hydrate with the same snapshot

The snapshot arrives as a prop and is seeded into the store **synchronously** before the first
render → the client HTML matches the server → no hydration mismatch. Init/mutations/lazy-load
continue on the client afterwards.

```typescript
const dehydrated = JSON.parse(window.__SYNAPSE_STATE__)

hydrateRoot(container, <PostsFeedWithCtx dehydratedState={dehydrated} />)
```

### Guarantees and limitations

- **Per-request isolation.** `dehydrate` forks the module; `seedHydration` in the Provider re-applies
  exactly the passed `dehydratedState` synchronously before every render — two parallel server renders
  with different snapshots never cross.
- **Effects do not run on the server.** Consumer subscriptions/`mountedEffect` start only on the
  client (via `useEffect`, which `renderToString` does not call) — analogous to `enableStaticRendering`.
- **Async stores (IndexedDB).** No synchronous server content (async init): the server keeps the
  previous `loadingComponent` gate, without crashing and without request bleed; `dehydrate` still
  collects a correct snapshot (it awaits the async `hydrate`).
- **Backward compatibility.** Without `ssr` and without `dehydratedState` the behavior is unchanged
  (lazy start + `loadingComponent`); hook signatures did not change.
