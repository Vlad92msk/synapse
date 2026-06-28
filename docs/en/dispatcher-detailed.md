# Dispatcher (in detail)

> [Back to Main](../../README.md)

The full surface of the `Dispatcher` class. The [assembly page](./create-synapse-dispatcher.md) shows
the minimum; here are all the factories (`action` / `signal` / `apiActions` / `keyedApiActions` /
`watcher`), the `ofType` rule for `apiActions`, and standalone use without `createSynapse`.

Same domain — `pokemon-advanced`. **Action/watcher name = class field name.**

## Standalone use

`Dispatcher` works without `createSynapse` too — an `IStorage` is enough. In standalone mode the
instance is finalized lazily: names are assigned on the first call of any action or on the first access
to the `dispatch`/`watchers` registries.

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { initialState } from './pokemon.store'
import { PokemonDispatcher } from './pokemon.dispatcher'
import type { PokemonState } from './pokemon.types'

const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })
await storage.initialize()

const dispatcher = new PokemonDispatcher(storage)
dispatcher.selectPokemon(25)            // actions — typed instance fields
```

## Dispatcher surface

| Factory field                       | What it creates                                                              |
|-------------------------------------|------------------------------------------------------------------------------|
| `this.action(fn)`                   | an action with a handler `(store, params) => result`; payload = the returned value |
| `this.signal<P>(desc)`              | a pure intent signal: `(_store, p) => p`, writes nothing to the store        |
| `this.apiActions<P>(accessor)`      | a callable group for an API request lifecycle                                |
| `this.keyedApiActions<P>(accessor)` | the same, but status is stored per key (`Record<string, ApiRequestState>`)   |
| `this.watcher(config)`              | a reactive watcher over part of the state                                    |

## this.action

`this.action((store, params) => result)` — a handler in the "recipe" signature. **The action's payload =
the handler's return value.**

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  // With a parameter: return = payload (effects catch it — e.g. loadDetails on selectPokemon)
  readonly selectPokemon = this.action((store, id: number | null) => {
    store.update((s) => {
      s.selectedPokemonId = id
      if (id === null) s.selectedPokemon = null
    })
    return id
  })

  // A write with no returned payload (applying a request result) — payload = void
  readonly applyPokemonDetails = this.action((store, details: PokemonDetails) =>
    store.update((s) => { s.selectedPokemon = details }),
  )

  // With meta — arbitrary metadata (2nd argument of this.action)
  readonly toggleFavorite = this.action(
    (store, id: number) => {
      store.update((s) => {
        const idx = s.favorites.indexOf(id)
        if (idx >= 0) s.favorites.splice(idx, 1)
        else s.favorites.push(id)
      })
      return id
    },
    { meta: { description: 'Add/remove from favorites' } },
  )

  // With memoize — a repeated call with the same argument is skipped (doesn't trigger search needlessly)
  readonly setSearchQuery = this.action(
    (store, query: string) => { store.set('searchQuery', query); return query },
    { memoize: (current, previous) => current === previous },
  )
}
```

## this.signal

A pure intent: writes nothing to the store, the payload is passed further to effects. `description`
goes into `meta`. In pokemon that's how `loadMore` is built — the signal itself doesn't change state,
the `loadMore` effect picks it up (and drives the status through `loadList.*`).

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  readonly loadMore = this.signal<void>('Load the next page')
}
```

## this.apiActions (callable group + lifecycle)

`apiActions` returns a **callable group**. Calling the group itself is `init` (an intent): it resets the
status to `idle` and passes the payload to effects. The lifecycle — through field-methods. The
`accessor` points to the `ApiRequestState` cell in the state.

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  readonly loadList = this.apiActions<void>((s) => s.api.listRequest)
  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)
}

// Usage:
d.loadList()             // init: listRequest status → idle, the intent goes to effects
d.loadList.loading()     // status → loading
d.loadList.success()     // status → success
d.loadList.failure('msg')// status → error, error = 'msg'
d.loadList.reset()       // status → reset
```

In the pokemon effects the group is used exactly like this: `ofType(d.loadList)` starts the request,
`d.loadList.loading()` / `.success()` / `.failure()` drive the status — see [Effects](./create-synapse-effects.md).

### Rule: `ofType(d.loadList)` catches ONLY init

```typescript
// In an effect: we react to the INTENT to load (init), not to statuses
action$.pipe(ofType(d.loadList), /* ... start the request ... */)

// To react to a RESULT — listen for the specific phase explicitly:
action$.pipe(ofType(d.loadList.success), /* ... */)
action$.pipe(ofType(d.loadList.failure), /* ... */)
```

`keyedApiActions` works the same way, but status is stored **per key**
(`Record<string, ApiRequestState>`), and `init`/`loading`/`success`/`reset` accept a `key`, while
`failure` accepts `{ key, error }`. Handy when a single endpoint loads in parallel for different
entities (e.g. details of several pokemon with a status per `id`):

```typescript
// hypothetical cell: api.detailsByIdRequest: Record<string, ApiRequestState>
readonly loadDetailsById = this.keyedApiActions<{ key: string }>((s) => s.api.detailsByIdRequest)

d.loadDetailsById({ key: '25' })            // init under key '25'
d.loadDetailsById.loading('25')
d.loadDetailsById.failure({ key: '25', error: 'msg' })
```

## this.watcher

A reactive watcher over a slice of state, returning an RxJS `Observable`. In pokemon —
`watchFavoriteCount` (with `meta` and `notifyAfterSubscribe`).

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  // Basic + notifyAfterSubscribe (fire immediately on subscribe) + meta
  readonly watchFavoriteCount = this.watcher({
    selector: (state) => state.favorites.length,
    notifyAfterSubscribe: true,
    meta: { description: 'tracking the number of favorites' },
  })

  // With shouldTrigger — filtering out false triggers
  readonly watchSelected = this.watcher({
    selector: (state) => state.selectedPokemonId,
    shouldTrigger: (prev, current) => prev !== current,
  })
}

// Subscribe — through the watchers registry (calling the factory → Observable)
const sub = dispatcher.watchers.watchFavoriteCount().subscribe((action) => {
  console.log('favorites:', action.payload)
})
sub.unsubscribe()
```

## Reserved field names

The names `storage`, `action$`, `actions`, `dispatch`, `watchers`, `use`, `destroy` are members of the
base class, they **cannot** be used as action/watcher names. A field-alias (one action under two names)
is rejected at finalization with a clear error.

## Usage

```typescript
// Calling actions — through the instance's typed fields
dispatcher.selectPokemon(25)
dispatcher.setSearchQuery('pika')
dispatcher.loadMore()

// Or through the dispatch registry
dispatcher.dispatch.selectPokemon.actionType  // '[pokemon-advanced]selectPokemon'
dispatcher.dispatch.toggleFavorite.meta       // { description: 'Add/remove from favorites' }

// Subscribing to watchers (RxJS Observable)
const sub = dispatcher.watchers.watchFavoriteCount().subscribe((action) => {
  console.log('favorites:', action.payload)
})
sub.unsubscribe()

// Subscribing to ALL actions (effects are built on this stream)
dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})

// Cleanup
dispatcher.destroy()
```

> In a `createSynapse` assembly the dispatcher is available as `store.dispatcher`, and `store.actions`
> is an alias of `store.dispatcher.dispatch`. See [createSynapse (dispatcher)](./create-synapse-dispatcher.md).
