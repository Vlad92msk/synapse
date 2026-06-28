# createSynapse (basic)

> [Back to Main](../../README.md)

`createSynapse(factory)` assembles the **data-management layer** into a single lazy module. The
minimal form is **storage + selectors**, with no dispatcher or effects: changes go through storage
directly. We'll add the dispatcher and effects on the next pages
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

## Assembly: createSynapse(factory)

`createSynapse(factory)` returns a **lazy handle**. The factory runs once — on the first `await` /
`ready()`, not on import (this matters for SSR and for keeping a module import from hitting the
network).

The minimal form — storage + selectors only:

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

import { PokemonSelectors } from './pokemon.selectors'
import { initialState } from './pokemon.store'
import type { PokemonState } from './pokemon.types'

const pokemonSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })
  return {
    storage,
    selectors: new PokemonSelectors(storage),
    // dispatcher / effects — we'll add them on the next pages
  }
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
```

## The return value

```typescript
// The handle is thenable: await runs the factory and returns the assembled module
const store = await pokemonSynapse

// The result (basic — no dispatcher):
store.storage    // IStorage<PokemonState> — the storage
store.selectors  // a PokemonSelectors instance — fields = SelectorAPI
store.state$     // Observable<PokemonState> — the state stream (ALWAYS present, even without effects)
store.dispatcher // undefined (no dispatcher)
store.actions    // undefined (the dispatcher alias)

// The handle itself:
pokemonSynapse.ready()        // Promise<store> — same as await
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

## Async initialization in the factory

The factory is a plain `async` function, so any prologue (fetching seed data, an API client's
`init()`) is done right inside it, before assembling the module:

```typescript
const pokemonSynapse = createSynapse(async () => {
  // the async prologue runs once on the first await
  const seed = await fetch('https://pokeapi.co/api/v2/pokemon?limit=12').then((r) => r.json())

  const storage = new MemoryStorage<PokemonState>({
    name: 'pokemon-advanced',
    initialState: { ...initialState, /* ...prepared seed... */ },
  })
  return {
    storage,
    selectors: new PokemonSelectors(storage),
  }
})
```

> In the full module this prologue is `await initPokemonApi()` (initializing `pokemonApiClient`). How
> it looks together with the dispatcher, effects, and dependencies — [Pokemon example](./pokemon-advanced.md).
