# createSynapse (effects)

> [Back to Main](../../README.md)

The last brick after the [dispatcher](./create-synapse-dispatcher.md): **effects** — the RxJS layer
of side actions. The dispatcher describes *intents* (`loadList`, `selectPokemon`, `loadMore`); an
effect listens for them in the stream, turns them into real API calls, and feeds the result back
into state through the dispatcher's actions.

Same domain — `pokemon-advanced`.

## Effects (`pokemon.effects.ts`)

Effects are a class over `Effects<State, Dispatcher>`. Each effect is declared as a **class field**
via `this.effect(...)`; the field name = the effect name. Services (API endpoints) and external
stores (`settings$`) come **through the constructor** and are captured in the recipe's closure.

```typescript
import { Observable, withLatestFrom } from 'rxjs'
import { Effects, apiResult, fromRequest, ofType, selectorMap, selectorObject, validateMap } from 'synapse-storage/reactive'

import { mapDetailsResponse, mapListResponse, type PokemonApiEndpoints } from './pokemon.api'
import type { PokemonSettings } from './pokemon.settings'
import type { PokemonState } from './pokemon.types'
import type { PokemonDispatcher } from './pokemon.dispatcher'

export class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(
    private readonly api: PokemonApiEndpoints,
    private readonly settings$: Observable<PokemonSettings>,
  ) {
    super()
  }

  // loadList (init/idle) → validateMap → loading → API → success/failure
  readonly loadList = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadList),
      withLatestFrom(selectorObject(state$, { listStatus: (s) => s.api.listRequest.status }), this.settings$),
      validateMap({
        // gate: don't refetch while a request is already in flight
        validator: ([, { listStatus }]) => ({
          conditions: [listStatus !== 'loading'],
          skipAction: () => d.loadList.reset(),
        }),
        loadingAction: () => d.loadList.loading(),
        errorAction: (err) => d.loadList.failure(String(err)),
        apiCall: ([, , { pageSize }]) =>
          fromRequest(this.api.getList.request({ limit: pageSize, offset: 0 })).pipe(
            apiResult((data) => {
              d.applyPokemonList({ ...mapListResponse(data), append: false })
              d.loadList.success()
            }),
          ),
      }),
    ),
  )

  // selectPokemon → load the details of the selected pokemon
  readonly loadDetails = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.selectPokemon),
      withLatestFrom(selectorMap(state$, (s) => s.selectedPokemonId, (s) => s.api.detailsRequest.status)),
      validateMap({
        validator: ([, [selectedId, detailsStatus]]) => ({
          conditions: [selectedId !== null, detailsStatus !== 'loading'],
          skipAction: () => d.loadDetails.reset(),
        }),
        loadingAction: () => d.loadDetails.loading(),
        errorAction: (err) => d.loadDetails.failure(String(err)),
        apiCall: ([, [selectedId]]) =>
          fromRequest(this.api.getDetails.request({ id: selectedId! })).pipe(
            apiResult((data) => {
              d.applyPokemonDetails(mapDetailsResponse(data))
              d.loadDetails.success()
            }),
          ),
      }),
    ),
  )
}
```

(`loadMore` is built like `loadList`, only with `offset` from state and `append: true` — see the
full file.)

## this.effect

`this.effect((action$, state$, ctx) => Observable)` — a class field; the recipe function receives the
streams and a context, and returns an `Observable`. The stream's emitted values don't matter — what
matters are the **side effects** (API calls and dispatched actions) inside the pipe.

```typescript
readonly loadList = this.effect((action$, state$, ctx) => {
  const d = ctx.dispatcher              // this module's typed dispatcher
  return action$.pipe(
    ofType(d.loadList),                  // filter the stream by the action we want
    // ...processing, this.api.* calls, dispatching d.applyPokemonList(...)
  )
})
```

The recipe's `ctx` is `{ dispatcher, external }`:

- `dispatcher` — this module's class-dispatcher instance (`ofType(d.x)` + `d.applyPokemonList(...)`);
- `external` — external dispatchers (their actions are already merged into the shared `action$`),
  available if a third generic is declared: `class Effects<State, Dispatcher, ExternalDispatchers>`.

> **Rule**: a service from the constructor (`this.api`) can be *captured in the recipe's closure*, but
> cannot be dereferenced directly in a field initializer — parameter properties are assigned AFTER the
> subclass's field initializers. That's why effects are arrows inside `this.effect`, not values
> computed in place.

Optional teardown — `override onDestroy()` (close sockets, unsubscribe from an external source).

## ofType / ofTypes

```typescript
import { ofType, ofTypes } from 'synapse-storage/reactive'

// ofType — filter the stream by a single dispatcher action
action$.pipe(ofType(d.loadList))

// ofTypes — by several
action$.pipe(ofTypes([d.loadList, d.loadMore]))
```

`ofType` takes the action itself (`d.loadList`), not a string — the type of `action.payload` is
inferred automatically. For `apiActions` the filter fires on the group's init call (`d.loadList()`),
not on `.loading()/.success()` — more in [Dispatcher (detailed)](./dispatcher-detailed.md).

## Reading state in an effect: selectorObject / selectorMap

Often, before a request, you need a slice of state (the current status, `offset`, `pageSize`). Take it
from `state$` via `withLatestFrom` — it folds in the **latest** value without subscribing on every tick:

```typescript
// selectorObject — a named slice (key → result)
withLatestFrom(selectorObject(state$, {
  offset: (s) => s.offset,
  hasMore: (s) => s.hasMore,
  listStatus: (s) => s.api.listRequest.status,
}))

// selectorMap — a tuple of values (positional)
withLatestFrom(selectorMap(state$, (s) => s.selectedPokemonId, (s) => s.api.detailsRequest.status))
```

External stores are folded in the same way — `this.settings$` (from `pokemon.settings`) gives `pageSize`:

```typescript
withLatestFrom(selectorObject(state$, { listStatus: (s) => s.api.listRequest.status }), this.settings$)
// → the pipe's value: [action, { listStatus }, { pageSize }]
```

## Handling requests: `validateMap` (reads) / `mutationMap` (writes)

For API effects the library ships two sibling operators with one shared vocabulary
(`validator` / `loadingAction` / `errorAction` / `apiCall`; success is dispatched **inside** `apiCall`
via `apiResult`). They wrap one pipe: `[validator] → loadingAction → [prepare] → apiCall → success / errorAction`.

`fromRequest` turns an `ApiClient` request into a cancellable Observable (aborts the HTTP request on
unsubscribe); `apiResult` unwraps a successful `QueryResult` (or throws `ApiError`, caught by `errorAction`).

### `validateMap` — reads (resources)

Built on `switchMap` (**last wins**: a new trigger aborts the stale in-flight request). Perfect for
loading a resource where only the latest result matters — like `loadList`/`loadDetails`.

- **`validator`** returns `{ conditions, skipAction }`: `conditions` is an array of boolean gates (all
  must be `true`), otherwise `skipAction` is dispatched and no request is made. In pokemon that's
  "don't refetch while a request is in flight" (`listStatus !== 'loading'`) and "there is something to
  load" (`selectedId !== null`).
- **`loadingAction`** → sets the `loading` status (via the dispatcher's `apiActions` group).
- **`apiCall`** receives the pipe's value, calls `fromRequest(this.api.X.request(...))`, and inside
  `apiResult` writes the result (`d.applyPokemon...`) + `d.X.success()`.
- **`errorAction`** catches `ApiError` → `d.X.failure(...)`.

```typescript
readonly loadDetails = this.effect((action$, state$, { dispatcher: d }) =>
  action$.pipe(
    ofType(d.selectPokemon),
    withLatestFrom(selectorMap(state$, (s) => s.selectedPokemonId, (s) => s.api.detailsRequest.status)),
    validateMap({
      validator: ([, [selectedId, detailsStatus]]) => ({
        conditions: [selectedId !== null, detailsStatus !== 'loading'],
        skipAction: () => d.loadDetails.reset(),
      }),
      loadingAction: () => d.loadDetails.loading(),
      errorAction: (err) => d.loadDetails.failure(String(err)),
      apiCall: ([, [selectedId]]) =>
        fromRequest(this.api.getDetails.request({ id: selectedId! })).pipe(
          apiResult((data) => {
            d.applyPokemonDetails(mapDetailsResponse(data))
            d.loadDetails.success()
          }),
        ),
    }),
  ),
)
```

### `mutationMap` — writes (mutations)

Same vocabulary, plus two write-specific concepts:

- **`flatten`** — the concurrency strategy (an rxjs operator). Writes have no single right answer, so the
  caller picks it by meaning:
  - `exhaustMap` — a single operation (create/update form): a double-submit is **ignored**, the in-flight
    request is **not** aborted;
  - `mergeMap` — operations over different entities (delete/toggle/repost): real parallelism;
  - `concatMap` — strictly one after another.
- **`prepare`** — async request-body assembly (FormData, blobs, tags) before `apiCall`; its result arrives as
  the second argument of `apiCall`. No `prepare` → `body` is `undefined`.

> **Why not `validateMap` for writes?** `validateMap` is locked to `switchMap`, which aborts the in-flight
> request on a new trigger. On a write that's a hazard: a double-submit would cancel the first POST (which may
> have already committed server-side → lost response), and parallel ops over different entities would abort each
> other. So a mutation lets the caller choose the strategy.

```typescript
import { ofType, mutationMap, fromRequest, apiResult } from 'synapse-storage/reactive'
import { exhaustMap, mergeMap } from 'rxjs/operators'

// create — single submit: exhaustMap (ignore double-submit), async body via prepare
createPost$ = this.effect((action$, _state$, { dispatcher: d }) =>
  action$.pipe(
    ofType(d.createPost),
    mutationMap({
      flatten: exhaustMap,
      loadingAction: () => d.createPost.loading(),
      errorAction: (err) => d.createPost.failure(getErrorMessage(err)),
      prepare: (payload) => buildCreateBody(this.api, payload),
      apiCall: (_payload, body) =>
        fromRequest(this.api.createPost.request({ body })).pipe(
          apiResult((post) => { d.createPost.success(); d.prependPost(post) }),
        ),
    }),
  ),
)

// delete — acts on different posts: mergeMap (parallel), no body
removePost$ = this.effect((action$, _state$, { dispatcher: d }) =>
  action$.pipe(
    ofType(d.removePost),
    mutationMap({
      flatten: mergeMap,
      errorAction: (err, id) => d.removePost.failure(getErrorMessage(err)),
      apiCall: (id) =>
        fromRequest(this.api.removePost.request({ id })).pipe(
          apiResult(() => d.dropPost(id)),
        ),
    }),
  ),
)
```

`validateMap` is internally just `mutationMap` with `flatten: switchMap` and no `prepare` — the same
machine, the strategy is the only conceptual difference.

> Not every effect is an API request. For simple cases (debouncing search, relaying into another action)
> a bare `action$.pipe(...)` with ordinary rxjs operators is enough — see the [Search sandbox](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/CreateSynapseEffectsExample.tsx)
> with `debounceTime` + `switchMap`.

## Assembly

Effects plug into `createSynapse` like the other layers — but their constructor receives **services and
external stores**: the API endpoints (`pokemonApiClient.getEndpoints()`) and `settings$`
(`toObservable(settingsStorage)`).

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { toObservable } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'

import { initPokemonApi, pokemonApiClient } from './pokemon.api'
import { settingsStorage } from './pokemon.settings'
import { initialState } from './pokemon.store'
import type { PokemonState } from './pokemon.types'
import { PokemonDispatcher } from './pokemon.dispatcher'
import { PokemonEffects } from './pokemon.effects'
import { PokemonSelectors } from './pokemon.selectors'

export const pokemonSynapse = createSynapse(async () => {
  await initPokemonApi()                 // async prologue: initialize the API client
  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })

  return {
    storage,
    dependencies: [settingsStorage],     // dependency on another storage
    dependencyTimeout: 10000,
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    // services and external stores — through the effects' constructor (captured in the closure)
    effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage)),
  }
})
```

Effects start **automatically** when the module is initialized (the first `await pokemonSynapse`).
More on the async factory, `dependencies` and `dependencyTimeout` — [Dependencies](./dependencies.md).

## Return value

```typescript
const store = await pokemonSynapse

store.storage     // IStorage<PokemonState>
store.selectors   // a PokemonSelectors instance
store.dispatcher  // a PokemonDispatcher instance
store.actions     // { loadList, selectPokemon, ... } (alias of store.dispatcher.dispatch)
store.state$      // Observable<PokemonState> — the state stream (always present)

// Kick off the chain with an intent — the effects drive the rest:
store.actions.loadList()        // → effect loadList → API → applyPokemonList → success
store.actions.selectPokemon(25) // → effect loadDetails → API → applyPokemonDetails
```

How to hand the assembled `pokemonSynapse` to React components — [createSynapseCtx](./synapse-ctx.md).
The full module — [Pokemon (recipe)](./pokemon-advanced.md).
