# createSynapseCtx

> [Back to Main](../../README.md)

React Context + HOC for accessing a Synapse module through hooks. A lazy handle is passed in: the factory
starts on the first mount of the Provider (not on import), with an automatic `loadingComponent` during
initialization.

Same domain — the `pokemonSynapse` assembled on the previous pages. This is the "provider" way to hand it
to the tree; the alternative (manual `await` + prop) is [awaitSynapse](./await-synapse.md), which is what
the demo in the module actually uses.

## Creating the context

```typescript
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { pokemonSynapse } from './pokemon.synapse'   // the lazy handle from previous pages

// Pass the handle ITSELF, not a call. The factory starts lazily on the first mount, not on import.
const {
  contextSynapse,       // HOC — wraps a component, providing the context
  useSynapseStorage,    // () => IStorage<PokemonState>
  useSynapseSelectors,  // () => PokemonSelectors
  useSynapseActions,    // () => PokemonDispatcher (actions)
  useSynapseState$,     // () => Observable<PokemonState> (only with effects)
  cleanupSynapse,       // () => Promise<void>
} = createSynapseCtx(pokemonSynapse, {
  loadingComponent: <div>Loading the pokedex...</div>,  // shown while the module isn't ready
})
```

## Using the hooks in child components

```typescript
// Child components are called ONLY inside the contextSynapse HOC

function PokemonGrid() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()

  const filteredList = useSelector(selectors.filteredList)   // reactive values
  const isListLoading = useSelector(selectors.isListLoading)

  return (
    <div>
      {filteredList?.map((p) => (
        <button key={p.id} onClick={() => actions.selectPokemon(p.id)}>{p.name}</button>
      ))}
      {isListLoading && <span>Loading...</span>}
    </div>
  )
}

function SearchInput() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()
  const query = useSelector(selectors.searchQuery)

  return <input value={query ?? ''} onChange={(e) => actions.setSearchQuery(e.target.value)} />
}

function DirectAccess() {
  const storage = useSynapseStorage()
  // Direct access to the storage — e.g. getStateSync(), update(), set()
  const state = storage.getStateSync()
}
```

## HOC contextSynapse()

```typescript
function Pokedex() {
  const actions = useSynapseActions()
  return (
    <div>
      <button onClick={() => actions.loadList()}>Reload</button>
      <SearchInput />
      <PokemonGrid />
    </div>
  )
}

// Wrap it — loadingComponent is shown while the module isn't ready
const PokedexWithContext = contextSynapse(Pokedex)

// Usage in JSX:
<PokedexWithContext />
```

## useSynapseState$ (only with effects)

```typescript
// Available only if effects were passed to the factory (pokemon — yes).
// Returns Observable<PokemonState> for use with RxJS.

const { useSynapseState$ } = createSynapseCtx(pokemonSynapse)

function StateLogger() {
  const state$ = useSynapseState$()

  useEffect(() => {
    const sub = state$.subscribe((state) => console.log('selected:', state.selectedPokemonId))
    return () => sub.unsubscribe()
  }, [state$])
}
```

## Reactive reads in a component

Writes still go through actions, but reading can be reactive — straight from the selector's stream (`.$`):

```typescript
import { useObservable, useSubscription } from 'synapse-storage/react'

function DebouncedSearch() {
  const selectors = useSynapseSelectors()

  const debounced = useObservable(
    () => selectors.searchQuery.$.pipe(debounceTime(300), distinctUntilChanged()),
    '',
    [selectors],
  )

  useSubscription(() => selectors.favoriteCount.$.pipe(skip(1), tap(logFavChange)).subscribe(), [selectors])

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

// 3. With effects (+ state$) — the pokemon case
// Available: + useSynapseState$
const ctx = createSynapseCtx(pokemonSynapse)
```

## SSR — server-rendering seeded sync stores

> Available since **5.0.1**. Classic `renderToString` only (streaming/Suspense is out of scope).
>
> The full runnable cycle (dehydrate → renderToString → hydration) is in
> [`SynapseCtxSsrExample.tsx`](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SynapseCtxSsrExample.tsx)
> (on the Posts domain; below the same mechanics are shown on pokemon).

By default `createSynapseCtx` gates children behind `loadingComponent` until the module is ready —
on the server this yields empty HTML (no SEO, no first paint from server-state). The `ssr: true`
flag enables a mode where a synchronously-ready store (Memory/LocalStorage — like pokemon) renders
content right away.

### Options

```typescript
const PokemonCtx = createSynapseCtx(pokemonSynapse, {
  loadingComponent: <Spinner />,
  ssr: true, // enable server-rendering of seeded sync stores
})
```

The `dehydrate` helper and the Provider prop:

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
// Any data-fetching path (the pokemon ApiClient, etc.) → a snapshot.
const list = await fetchInitialPokemon()
const dehydrated = await PokemonCtx.dehydrate({ initialState: { pokemonList: list } })

const html = renderToString(<PokedexWithContext dehydratedState={dehydrated} />)
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
> // in a server (RSC) file — pokemonSynapse is imported directly, no 'use client' context
> const dehydrated = await dehydrateModule(pokemonSynapse, { ssr: true, state: { pokemonList: list } })
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

hydrateRoot(container, <PokedexWithContext dehydratedState={dehydrated} />)
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

## SSR — data-less "background" providers (`ssrShell`)

> Available since **5.4.0**.

The section above server-renders a store that **has server data** (`dehydratedState`). But some providers
wrap a large subtree (the app shell) yet have **no server data of their own** — presence, relations, a
media-player. Their store is built by an **async factory** (`await getCoreSynapse()`, a socket, …), so it
is never synchronously ready on the server. Without help such a provider hits the `loadingComponent` gate
on the server and renders nothing — **cutting off the entire subtree below it**, including a correctly
seeded feed two levels deeper.

`ssrShell` gives the module a way to build a **synchronous "empty" store from `initialState`** — bypassing
the async factory, its dependencies and effects — so the provider renders `children` on the server. The
full store (with dependencies and effects) is assembled on the client afterwards, and the context switches
to it seamlessly.

### Declaring the shell

`createSynapse` takes an optional second argument. The shell factory is **synchronous** and returns a
subset of the config — `{ storage, dispatcher?, selectors? }`, **without** `effects`/`dependencies`. Its
`storage` must be synchronous (`MemoryStorage`/`LocalStorage`).

```ts
import { createSynapse } from 'synapse-storage/utils'
import { MemoryStorage } from 'synapse-storage/core'

export const presenceSynapse = createSynapse(
  // async factory — the real store (deps + effects), client only
  async () => {
    const core = await getCoreSynapse()
    const storage = new MemoryStorage<PresenceState>({ name: 'presence', initialState })
    return {
      storage,
      dependencies: [core],
      dispatcher: new PresenceDispatcher(storage),
      selectors: new PresenceSelectors(storage),
      effects: new PresenceEffects(/* … */),
    }
  },
  // sync SSR shell — no deps, no effects; renders children with initialState on the server
  {
    ssrShell: () => {
      const storage = new MemoryStorage<PresenceState>({ name: 'presence', initialState })
      return { storage, selectors: new PresenceSelectors(storage), dispatcher: new PresenceDispatcher(storage) }
    },
  },
)
```

> **Avoiding duplication.** The shell repeats only the sync part (storage + selectors + dispatcher).
> Extract a `buildSyncCore()` helper and call it from both the factory and the shell if you want a single
> source of truth.

### The provider

Turn on `ssr: true` — nothing else changes at the call site. A background provider is usually just a
pass-through:

```tsx
export const { contextSynapse: withPresence } =
  createSynapseCtx(presenceSynapse, { ssr: true, loadingComponent: null })

export const PresenceProvider = withPresence(({ children }) => <>{children}</>)
```

On the server `PresenceProvider` now renders its `children` (the whole subtree reaches the HTML); on the
client the first frame renders the same empty shell (matching the server — no hydration mismatch), then
upgrades to the real store.

### How it works

- **Server.** With `ssr: true` and a not-yet-ready store, the Provider builds the shell
  (`module.buildSyncShell()`) and renders `children`. It does **not** touch the shared client awaiter on
  the server — so the async factory / effects / WebSocket never run there, and the module singleton can't
  leak between requests. The empty `initialState` is constant → **request isolation for free**.
- **Client hydration.** The first frame builds the same shell (empty state) → identical to the server →
  no mismatch. Then, in `useEffect`, the real async store is assembled; once ready the context swaps to it
  and the shell is destroyed.
- **`ssr` is no longer a no-op.** Previously the render gate ignored `ssr` entirely (it was only read by
  `dehydrate`), so `{ ssr: true }` without `dehydratedState` still showed `loadingComponent`. Now
  `ssr: true` enables the shell path. Without an `ssrShell` the flag is a no-op (the old
  `loadingComponent` gate) — backward compatible.

### `dehydrate` vs `ssrShell`

| Situation | Use |
|---|---|
| Store **has** server data (a feed, a first page) | `dehydrate` / `dehydrateModule` + `dehydratedState` prop (section above) |
| Provider has **no** server data but must not block SSR (app shell) | `ssrShell` + `{ ssr: true }` |
| Client-only, no SSR | neither — the default lazy `loadingComponent` gate |

They compose: a page can seed a feed via `dehydratedState` while a `presence` shell two levels up uses
`ssrShell` — without the shell, the gate would cut the seeded feed out of the HTML anyway.

The full pokemon module — [Pokemon (recipe)](./pokemon-advanced.md).
