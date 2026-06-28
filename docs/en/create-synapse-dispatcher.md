# createSynapse (dispatcher)

> [Back to Main](../../README.md)

The next brick after the [basic assembly](./create-synapse-basic.md): we add the **dispatcher**. It
describes **intents** — named actions that change state — and **watchers** for reactive tracking.
Effects (API calls per action) are on the [next page](./create-synapse-effects.md).

Same domain — `pokemon-advanced`.

## Dispatcher (`pokemon.dispatcher.ts`)

Actions and watchers are declared as **class fields**, the action name = the field name. The assembler
finalizes the dispatcher (generates `actionType` from the field names) before start.

```typescript
import { Dispatcher } from 'synapse-storage/reactive'
import type { PokemonBrief, PokemonDetails, PokemonState } from './pokemon.types'

export class PokemonDispatcher extends Dispatcher<PokemonState> {
  // apiActions — a callable request-lifecycle group (see dispatcher-detailed)
  readonly loadList = this.apiActions<void>((s) => s.api.listRequest)
  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)

  // signal — a pure intent signal with no state write (an effect handles it)
  readonly loadMore = this.signal<void>('Load the next page')

  // action — an intent that changes state itself
  readonly selectPokemon = this.action((store, id: number | null) => {
    store.update((s) => {
      s.selectedPokemonId = id
      if (id === null) s.selectedPokemon = null
    })
    return id
  })

  readonly setSearchQuery = this.action((store, query: string) => {
    store.set('searchQuery', query)
    return query
  })

  readonly toggleFavorite = this.action((store, id: number) => {
    store.update((s) => {
      const idx = s.favorites.indexOf(id)
      if (idx >= 0) s.favorites.splice(idx, 1)
      else s.favorites.push(id)
    })
    return id
  })

  // Actions an effect uses to write the request result into state
  readonly applyPokemonList = this.action((store, data: { list: PokemonBrief[]; hasMore: boolean; append: boolean }) =>
    store.update((s) => {
      s.pokemonList = data.append ? [...s.pokemonList, ...data.list] : data.list
      s.offset = s.pokemonList.length
      s.hasMore = data.hasMore
    }),
  )

  readonly applyPokemonDetails = this.action((store, details: PokemonDetails) =>
    store.update((s) => {
      s.selectedPokemon = details
    }),
  )

  // watcher — reactively tracks a slice of state
  readonly watchFavoriteCount = this.watcher({
    selector: (s) => s.favorites.length,
    meta: { description: 'tracking the favorites count' },
    notifyAfterSubscribe: true,
  })
}
```

## this.action

`this.action((store, params) => result)` — a handler in the "recipe" signature. **The action's
payload = the handler's return value** (that's why `selectPokemon` returns `id`, and `toggleFavorite`
returns `id`: their payload is later caught by effects).

```typescript
// Call through store.actions (action name = field name)
store.actions.selectPokemon(25)
store.actions.setSearchQuery('pika')
store.actions.toggleFavorite(25)

// actionType is generated from the field name at finalization
store.actions.selectPokemon.actionType  // '[pokemon-advanced]selectPokemon'
```

> `store.actions.X` is shorthand for `store.dispatcher.dispatch.X`.

## this.watcher

`this.watcher` reactively tracks state changes and returns an RxJS `Observable`:

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  readonly watchFavoriteCount = this.watcher({
    selector: (state) => state.favorites.length,    // what to track
    notifyAfterSubscribe: true,                      // fire immediately on subscribe
    shouldTrigger: (prev, curr) => prev !== curr,    // filter (optional)
  })
}

// Subscribe — through the watchers registry (calling the factory → Observable)
const sub = store.dispatcher.watchers.watchFavoriteCount().subscribe((action) => {
  console.log('favorites:', action.payload)
})

sub.unsubscribe()
```

## signal and apiActions

`this.signal<T>(description?)` — a pure signal `(_store, payload) => payload`: writes nothing to
state, only throws an intent into the stream (an effect picks it up — like `loadMore`).

`this.apiActions(accessor)` — a callable request-lifecycle **group**. The call itself (`loadList()`) =
init (status `idle`), while `.loading()` / `.success()` / `.failure(error)` / `.reset()` write the
status at the given state path. The full surface and the `ofType` rule —
[Dispatcher (detailed)](./dispatcher-detailed.md).

## Assembly

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

import { PokemonDispatcher } from './pokemon.dispatcher'
import { PokemonSelectors } from './pokemon.selectors'
import { initialState } from './pokemon.store'
import type { PokemonState } from './pokemon.types'

const pokemonSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })
  return {
    storage,
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    // effects — on the next page
  }
})
```

## The return value

```typescript
const store = await pokemonSynapse

store.storage     // IStorage<PokemonState>
store.selectors   // a PokemonSelectors instance
store.dispatcher  // a PokemonDispatcher instance (dispatch, watchers, action$)
store.actions     // an alias of store.dispatcher.dispatch: { selectPokemon, setSearchQuery, ... }

// store.actions.selectPokemon === store.dispatcher.dispatch.selectPokemon

// The stream of all actions (an RxJS Observable) — effects are built on it
store.dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})
```

## React (createSynapseCtx)

```typescript
import { createSynapseCtx } from 'synapse-storage/react'

// Pass the handle ITSELF (not a call) — the factory starts lazily on the Provider's first mount
export const { contextSynapse, useSynapseSelectors, useSynapseActions } =
  createSynapseCtx(pokemonSynapse, { loadingComponent: <div>Loading...</div> })
```

More — [createSynapseCtx](./synapse-ctx.md). How intents turn into real API calls —
[Effects](./create-synapse-effects.md).
