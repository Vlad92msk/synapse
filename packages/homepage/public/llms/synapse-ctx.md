<!-- source: docs/en/synapse-ctx.md · canonical: https://synapse-homepage.web.app/docs/synapse-ctx · part of https://synapse-homepage.web.app/llms-full.txt -->

# createSynapseCtx


**TL;DR.** `createSynapseCtx(module, options?)` wraps a Synapse module in a React Context + HOC:
child components take `storage`/`selectors`/`actions`/`state$` through hooks, without threading a prop
by hand. You pass the **handle itself** (not a call) — since v6 the C-form is synchronous, so the store
is ready for the first frame (SSR by construction), and `loadingComponent` is only a **fallback**
render for an async store that couldn't be built synchronously.

Same domain — the `pokemonSynapse` assembled on the previous pages. This is the "provider" way to hand it
to the tree; the alternative (manual `await` + prop) is [awaitSynapse](./await-synapse.md), which is what
the demo in the module actually uses.

## When to use it

- The module is needed by **many components of a subtree**, and you don't want to thread it as a prop by hand.
- You need **SSR with seeded data**: `dehydrate` + the `dehydratedState` prop (section below).
- A "background" provider wraps a large subtree (the app shell) and must not block SSR.

## When you don't need it

- The module goes to **one or two** components → [awaitSynapse](./await-synapse.md) is simpler
  (manual `await` + prop, no Context).
- You need a bare **storage inside a component** without selectors/actions → [useCreateStorage](./hook-memory.md).
- Logic lives **outside React** (effects, utilities, Node) → the programmatic
  [createSynapseAwaiter](./synapse-awaiter.md).

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
  loadingComponent: <div>Loading the pokedex...</div>,  // FALLBACK render: only if the store couldn't be
                                                        // built synchronously (normally the C-form is ready at once)
})
```

`options` — the only optional argument:

| Field | Type | Default | Description |
|---|---|---|---|
| `loadingComponent` | `React.ReactNode` | `<div>Initializing the context...</div>` | **Fallback** render if the store couldn't be built synchronously (normally the C-form is ready for the first frame; on the server only an async store degrades this way). |

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

// Wrap it. Normally the store is synchronously ready for the first frame; loadingComponent is just a fallback render.
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

> Since **6.0.0** SSR is **enabled by construction** — there is no separate `ssr` flag anymore (removed).
> The C-form construction is synchronous, so on the server the Provider builds a fresh shell per render
> (`buildSyncShell`) and synchronously seeds its `dehydratedState`. Classic `renderToString` only
> (streaming/Suspense is out of scope).
>
> The full runnable cycle (dehydrate → renderToString → hydration) is in
> [`SynapseCtxSsrExample.tsx`](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SynapseCtxSsrExample.tsx)
> (on the Posts domain; below the same mechanics are shown on pokemon).

Previously `createSynapseCtx` gated children behind `loadingComponent` until the module was ready, and
server rendering was enabled by the `ssr: true` flag. Now the store is always synchronously ready for the
first frame, so server-rendering seeded content is the default behavior, and `loadingComponent` remains
only a fallback render (an async store that couldn't be built synchronously).

### Options

```typescript
const PokemonCtx = createSynapseCtx(pokemonSynapse, {
  loadingComponent: <Spinner />, // fallback render (normally the C-form is ready for the first frame)
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
no request bleed), seeds `initialState` via `hydrate`, and returns a serializable snapshot. On the
server the Provider then builds a fresh shell per render and synchronously seeds it with this snapshot,
so `renderToString` returns ready content on the first render (the main singleton is left untouched —
request isolation by construction).

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
> const dehydrated = await dehydrateModule(pokemonSynapse, { state: { pokemonList: list } })
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
- **Without `dehydratedState`.** A data-less background provider renders an empty shell from
  `initialState` (see the section below); hook signatures did not change.

## SSR — data-less "background" providers

> Since **6.0.0** the SSR shell is derived **by the C-form itself** — the manual `ssrShell`, the object
> form with `wire`, and the functional factory have been **removed**. The only form is the synchronous
> config (see [createSynapse](./create-synapse-basic.md)).

The section above server-renders a store that **received server data** (`dehydratedState`). But some
providers wrap a large subtree (the app shell) yet have **no server data of their own** — presence,
relations, a media-player. Previously their store was built by an async factory and wasn't synchronously
ready on the server, so the provider hit the `loadingComponent` gate and rendered nothing — **cutting off
the entire subtree below it**, including a correctly seeded feed two levels deeper.

Now construction is **synchronous by construction**: `storage`/`dispatcher`/`selectors` are built from
`initialState` in a single tick, while everything async (deps, endpoints, WS) lives in the `effects`
factory, which **does not run on the server**. So **every** C-form module with a synchronous storage has
`buildSyncShell()` — a way to synchronously bring up an "empty" store from `initialState` so the provider
renders `children` on the server. The full store (with dependencies and effects) is assembled on the
client afterwards, after which the context switches to it seamlessly.

### Nothing special to declare

The shell is derived from the sync core — just write a plain C-form and keep everything async in `effects`:

```ts
import { createSynapse } from 'synapse-storage/utils'
import { MemoryStorage } from 'synapse-storage/core'

export const presenceSynapse = createSynapse({
  // sync core — the library builds the SSR shell from it automatically
  storage: () => new MemoryStorage<PresenceState>({ name: 'presence', initialState }),
  dispatcher: (s) => new PresenceDispatcher(s),
  selectors: (s) => new PresenceSelectors(s),
  dependencies: [coreSynapse],                       // gate for the START of effects (not construction)
  // async — client only (endpoints / WS); does not run on the server
  effects: async () => new PresenceEffects(await getPresenceEndpoints(), coreSynapse.state$),
})
```

- Zero SSR boilerplate: the shell = `{ storage(), dispatcher(storage), selectors(storage) }`.
- One source of truth for `name`/`initialState` (no sync/async drift → no hydration bug).
- `effects` never runs on the server → WS/IndexedDB/effects don't reach it by construction.
- `storage` must be synchronous (`MemoryStorage`/`LocalStorage`). For an async store (IndexedDB) there's no
  synchronous shell → the provider degrades to `loadingComponent` (see the gotchas).

> **Server-safe storage.** If the storage is client-only (`LocalStorage` needs `localStorage`, a media-player
> reads `tabId`/broadcast) — wrap the factory in `browserStorage(config, { client })` (exported from
> `synapse-storage/core`): `MemoryStorage` on the server, `client(config)` in the browser. Both branches are a
> sync store of the same shape, and the type is inferred without manual generics. See [SSR hydration](./ssr-hydration.md).

### The provider

Nothing to turn on — the call site is a plain `createSynapseCtx`. A background provider simply passes its
children through:

```tsx
export const { contextSynapse: withPresence } =
  createSynapseCtx(presenceSynapse, { loadingComponent: null })

export const PresenceProvider = withPresence(({ children }) => <>{children}</>)
```

On the server `PresenceProvider` renders its `children` (the whole subtree reaches the HTML); on the
client the first frame renders the same empty shell (matching the server — no hydration mismatch), then
upgrades to the real store.

### How it works

- **Server.** The Provider renders a **fresh shell per render** (`buildSyncShell()`) — for both the
  background store and a store with `dehydratedState` — and never touches the shared client awaiter /
  main singleton. So the `effects` factory / WebSocket never run on the server, and no request state is
  written to a process-global object → **request isolation by construction, safe even under streaming SSR**
  (Next App Router streams by default).
- **Client hydration.** The first frame builds the same shell (empty state) → identical to the server → no
  mismatch. Then, in `useEffect`, the real store's effects start; once ready the context swaps to it and the
  shell is destroyed.

### Gotchas

- **`storage`/`dispatcher`/`selectors` run on the server** (they build the shell). Keep them SSR-safe —
  no `window`/`document`/`localStorage` in their constructors. If you need client-only construction, wrap
  `storage` in `browserStorage(config, { client })`, and pass client-only `dispatcher`/`selectors` args
  under an env guard (`isServer ? undefined : getTabId()`).
- **Shell-phase interactions are discarded on upgrade.** The shell is a throwaway display store for the
  first frame; when the real store swaps in, any actions dispatched against the shell before the upgrade
  are lost. Treat the shell subtree as display-only until it upgrades (for a data store the real store is
  re-seeded from `dehydratedState`, so its data is not lost — only pre-upgrade user actions).
- **Async storage (IndexedDB) can't do a sync shell.** If a module's `storage` is async, there's no sync
  shell; the provider **degrades to `loadingComponent`** on the server (no crash) and logs a one-time
  dev-warning. Such a background provider yields no server content — this is expected.

### `dehydrate` + the shell

| Situation | Use |
|---|---|
| Store **has** server data (a feed, a first page) | `dehydrate` / `dehydrateModule` + `dehydratedState` prop (section above) |
| Provider has **no** server data but must not block SSR (app shell) | nothing — the shell is derived from the sync core |
| Client-only (async store, IndexedDB) | no server shell → `loadingComponent` gate |

They compose on two levels:

- **Across the tree:** a page seeds a feed via `dehydratedState` while a `presence` shell two levels up
  renders its own shell (by construction); without the shell, the gate would cut the seeded feed out of the HTML.
- **On one store:** a data store gets **both** `dehydratedState` **and** a shell (the C-form derives it).
  Then on the first client frame, if the real store isn't ready yet, the shell is **seeded with the snapshot** →
  frame 1 renders the same content as the server → no hydration mismatch (and no subtree regeneration, which can
  otherwise re-run inline `<head>` scripts and drop your theme/CSS).

The full pokemon module — [Pokemon (recipe)](./pokemon-advanced.md).
