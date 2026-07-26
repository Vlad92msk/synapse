# createSynapse (basic)

> [Back to Main](../../README.md)

`createSynapse(config)` assembles the **data-management layer** into a single lazy module. The
only form is a **synchronous config object** (C-form): `storage` (a factory for synchronous
storage), optionally `dispatcher` / `selectors` / `dependencies` / `effects`. Core construction is
synchronous; everything async (endpoints, sockets, dependency readiness) moves into the effects
lifecycle. The minimal form is **storage + selectors**, with no dispatcher or effects: changes go
through storage directly. We'll add the dispatcher and effects on the next pages
([Dispatcher](./create-synapse-dispatcher.md), [Effects](./create-synapse-effects.md)).

Everything on one domain — `pokemon-advanced` (see the [Pokemon example](./pokemon-advanced.md)).
Here we take exactly two bricks from it: `pokemon.store.ts` and `pokemon.selectors.ts`.

## Storage and state (`pokemon.store.ts`)

```typescript
import type { PokemonState } from './pokemon.types'

export const initialState: PokemonState = {
  api: {
    listRequest: { status: 'idle', error: null },
    detailsRequest: { status: 'idle', error: null },
  },
  pokemonList: [],
  offset: 0,
  hasMore: true,
  selectedPokemonId: null,
  selectedPokemon: null,
  searchQuery: '',
  favorites: [],
}
```

## Selectors (`pokemon.selectors.ts`)

Selectors are derived values. Class fields become real `SelectorAPI`s right after construction
(eager), the selector name = the field name. Intermediate slices can be kept `private` — invisible
from outside, but they work as dependencies in `combine`.

```typescript
import { Selectors } from 'synapse-storage/core'
import type { PokemonState } from './pokemon.types'

export class PokemonSelectors extends Selectors<PokemonState> {
  // private = an intermediate slice, not exported outside
  private readonly api = this.select((s) => s.api)

  // Simple selectors — a single state field
  readonly pokemonList = this.select((s) => s.pokemonList)
  readonly searchQuery = this.select((s) => s.searchQuery)
  readonly favorites = this.select((s) => s.favorites)

  // Combined ones — depend on other selectors and are recomputed memoized
  readonly isListLoading = this.combine([this.api], (a) => a.listRequest.status === 'loading')

  // Filter the list by the search string
  readonly filteredList = this.combine([this.pokemonList, this.searchQuery], (list, query) =>
    query ? list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : list,
  )

  // Favorites — the intersection of the list and the ids in favorites
  readonly favoriteCount = this.combine([this.favorites], (favs) => favs.length)
  readonly favoritePokemon = this.combine([this.pokemonList, this.favorites], (list, favs) =>
    list.filter((p) => favs.includes(p.id)),
  )
}
```

> The full set of selectors (statuses and errors of both requests, `selectedPokemon`, `hasMore`) is
> in `pokemon.selectors.ts`. More on selectors themselves — [Selectors](./selector-system.md).

## Assembly: createSynapse(config)

`createSynapse(config)` returns a **lazy handle**. The factories (`storage`/`dispatcher`/
`selectors`) run lazily — on the first `await` / `ready()` (or on the first synchronous access to
`.storage`/`.selectors`), not on import (this matters for SSR and for keeping a module import from
hitting the network). Yet core construction itself is **synchronous**: `storage` is driven to
`READY` in a single tick, and `state$` is always present — even before `await`.

The minimal form — storage + selectors only:

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

import { PokemonSelectors } from './pokemon.selectors'
import { initialState } from './pokemon.store'
import type { PokemonState } from './pokemon.types'

export const pokemonSynapse = createSynapse({
  // storage — a factory for SYNCHRONOUS storage (Memory/LocalStorage); TState is inferred from it
  storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  selectors: (s) => new PokemonSelectors(s),
  // dispatcher / effects — we'll add them on the next pages
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
```

> `TState` (the `PokemonState` type) is **inferred** from the `storage` factory — no need to spell
> out generics by hand. If the type is awkward to infer from the factory, there's an explicit form
> `createSynapse.of<State, Dispatcher, Selectors>({ … })`.

## The return value

```typescript
// The handle is thenable: await starts effects and returns the assembled module
const store = await pokemonSynapse

// The result (basic — no dispatcher):
store.storage    // IStorage<PokemonState> — the storage
store.selectors  // a PokemonSelectors instance — fields = SelectorAPI
store.state$     // Observable<PokemonState> — the state stream (ALWAYS present, even without effects)
store.dispatcher // undefined (no dispatcher)
store.actions    // undefined (the dispatcher alias)

// The C-form exposes the main core SYNCHRONOUSLY (no await) — the basis of cross-store DI:
pokemonSynapse.storage        // IStorage<PokemonState> — available immediately
pokemonSynapse.selectors      // PokemonSelectors — can be passed into other selectors' constructors
pokemonSynapse.state$         // Observable<PokemonState>

// The handle itself:
pokemonSynapse.ready()        // Promise<store> — same as await (starts effects)
pokemonSynapse.isReady()      // boolean
pokemonSynapse.getSnapshot()  // store | undefined — synchronous access (needed for SSR)
pokemonSynapse.destroy()      // Promise<void> — cleanup + memoization reset (the handle is recreatable)
```

## Usage in React

Without a dispatcher we read through `useSelector` and write through storage **directly**:

```typescript
import { useSelector } from 'synapse-storage/react'

const filteredList = useSelector(store.selectors.filteredList)
const favoriteCount = useSelector(store.selectors.favoriteCount)
const searchQuery = useSelector(store.selectors.searchQuery)

// State change — directly through storage
store.storage.set('searchQuery', 'pika')

store.storage.update((s) => {
  const i = s.favorites.indexOf(25)
  if (i >= 0) s.favorites.splice(i, 1)
  else s.favorites.push(25)
})
```

> Direct `storage.set/update` is fine for simple state. As soon as named intents and side-effects
> (loading from an API) appear — that's the job of [Dispatcher](./create-synapse-dispatcher.md) and
> [Effects](./create-synapse-effects.md).

## Async lives in the `effects` factory

Core construction is **synchronous**, so everything async lives in the `effects` factory: it can be
`async` and lazily resolves browser-only resources (an API client's `init()`, endpoints, the `ApiClient`
IndexedDB cache, sockets) — after the core is built, and only on the client:

```typescript
export const pokemonSynapse = createSynapse({
  storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  selectors: (s) => new PokemonSelectors(s),
  // async — only here; core construction and rendering don't touch it
  effects: async () => new PokemonEffects(await getPokemonEndpoints()),
})
```

> Server and client build the store identically from `initialState`, the SSR shell is inferred
> automatically (see [SSR](./ssr-hydration.md)), and a module import doesn't hit the network. How
> `effects` looks together with the dispatcher and dependencies — [Effects](./create-synapse-effects.md)
> and the [Pokemon example](./pokemon-advanced.md).

## Full shape — every config field

You usually need 2–3 fields, but here is the **entire surface** of the C-form at once (commented-out
fields are optional), so you can see what it can do:

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

export const pokemonSynapse = createSynapse(
  {
    // 1. storage — the ONLY required field. A factory for a synchronous storage
    //    (MemoryStorage/LocalStorage). TState is inferred from its type.
    storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),

    // 2. dispatcher — a factory for the class dispatcher (intents + store updates). Gets storage.
    dispatcher: (s) => new PokemonDispatcher(s),

    // 3. selectors — a factory for the class selectors. Gets storage; this is also where
    //    cross-store DI goes (ANOTHER module's selectors are available synchronously):
    //    new X(s, coreSynapse.selectors).
    selectors: (s) => new PokemonSelectors(s),

    // 4. dependencies — the gate for STARTING effects (not construction): the core is built
    //    immediately, effects wait for these stores/modules to be ready. An item is an IStorage,
    //    a synapse handle, or any PromiseLike<{ storage }>.
    dependencies: [settingsStorage],

    // 5. dependencyTimeout — the dependencies wait timeout, ms (defaults to 30000).
    dependencyTimeout: 10000,

    // 6. externalDispatchers — foreign dispatchers whose actions are merged into the shared
    //    action$ (communication pattern 3). A lazy slot-function is preferred — it doesn't force
    //    eager construction of the foreign store on import; resolved when effects start.
    externalDispatchers: () => ({ settings: settingsSynapse.dispatcher }),

    // 7. effects — an effects factory; MAY be async (the whole async prologue goes here).
    //    ctx = { storage, dispatcher, selectors, deps }. Returns Effects instance(s) /
    //    effect functions / undefined.
    effects: async ({ selectors }) =>
      new PokemonEffects(await getPokemonEndpoints(), selectors),
  },
  {
    // 8. The SECOND argument — options. postConstruct: a synchronous hook after core construction
    //    (storage READY, dispatcher finalized), BEFORE the first render. The home for normalizing
    //    persisted state (clearing transient flags).
    postConstruct: ({ actions }) => actions.resetTransient(),
  },
)
```

## Extras (DX)

- **`browserStorage(config, { client })`** (exported from `synapse-storage/core`) — a server-safe
  storage factory: `MemoryStorage` on the server (no `window`), `client(config)` in the browser.
  Removes the manual `const isServer = typeof window === …` + branch; add client-only middleware
  (`syncBroadcastMiddleware`) inside `client`. Both branches are a sync store of the same shape, and
  the type is inferred without manual generics.
  ```typescript
  // browserStorage(...) itself returns a factory () => ISyncStorage — pass it as-is
  storage: browserStorage(
    { name: 'draft', initialState },
    { client: (cfg) => new LocalStorage(cfg) },
  )
  ```
- **`postConstruct` — the second argument** `createSynapse(config, { postConstruct })`. A synchronous
  hook after core construction (storage `READY`, dispatcher finalized), BEFORE the first render — for
  normalizing persisted state (clearing transient flags). A separate argument (not a config field) so
  the callback is contextually typed with the already-inferred `TDispatcher`:
  ```typescript
  export const accounts = createSynapse(
    {
      storage: () => new LocalStorage<AccountsState>({ name: 'accounts', initialState }),
      dispatcher: (s) => new AccountsDispatcher(s),
    },
    // persisted state from localStorage may have kept transient flags (isSubmitting, etc.) —
    // clear them synchronously BEFORE the first render. `actions` is typed as AccountsDispatcher.
    { postConstruct: ({ actions }) => actions.resetTransient() },
  )
  ```
- **`createSynapse.of<State, Dispatcher, Selectors>(config, options?)`** — the explicitly-typed C-form,
  for when `TState` is awkward to infer from the `storage` factory (manual generics without falling
  through to a constraint error):
  ```typescript
  // generics set manually; config fields and the second argument are the same as createSynapse
  export const accounts = createSynapse.of<AccountsState, AccountsDispatcher, AccountsSelectors>(
    {
      storage: () => new LocalStorage({ name: 'accounts', initialState }),
      dispatcher: (s) => new AccountsDispatcher(s),
      selectors: (s) => new AccountsSelectors(s),
    },
    { postConstruct: ({ actions }) => actions.resetTransient() },
  )
  ```
