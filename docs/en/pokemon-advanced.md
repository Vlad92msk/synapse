# Pokemon Advanced — the recipe: the whole data layer on PokeAPI

> [Back to Main](../../README.md)

The final page of the chain. Every previous section dissected one brick on this same domain — here
they come together into **one working module**: ApiClient with caching → mappers → storage →
selectors → dispatcher → effects → `createSynapse` → React. This is the reference for how to split a
data-management layer into responsibility files and copy it into your own project.

Each section below links to the page where the corresponding brick is covered in detail.

## Module structure

The whole domain lives in a single `pokemon-advanced/` folder, one file = one responsibility:

```
pokemon-advanced/
  pokemon.types.ts       — domain types + request-state shape
  pokemon.store.ts       — initialState (store shape)
  pokemon.settings.ts    — external settings storage (a dependency)
  pokemon.api.ts         — ApiClient (endpoints, cache) + response mappers
  pokemon.selectors.ts   — derived values (class Selectors)
  pokemon.dispatcher.ts  — intents (class Dispatcher)
  pokemon.effects.ts     — side-effects on RxJS (class Effects)
  pokemon.synapse.ts     — assembly via createSynapse(factory)
  index.ts               — public exports
  PokemonAdvancedExample.tsx / PokemonDemo.tsx — UI on top of the synapse
  helpers.ts             — small presentation utilities (typeColor)
```

## Data flow

```
UI (PokemonDemo)
   │  store.actions.loadList() / selectPokemon(id) / setSearchQuery(q) / toggleFavorite(id)
   ▼
dispatcher (intents)  ──► action$ ──►  effects (RxJS)
   │ apiActions/action/signal             │ ofType → validateMap → fromRequest(api)
   │                                       ▼
   │                                    pokemon.api.ts  (ApiClient + mappers)
   │                                       │ apiResult(data) → mapListResponse / mapDetailsResponse
   ▼                                       ▼
   └──────────►  applyPokemonList / applyPokemonDetails / loadList.success ──► storage
                                                                                   │
                                              selectors (filteredList, isLoading…) ◄┘
                                                   │  useSelector
                                                   ▼
                                                  UI
```

The flow is one-way: the UI sends **intents** to the dispatcher, effects do side-effects and write
the result to storage via actions, and selectors hand derived values back to the UI.

## 1. Types and state shape — `pokemon.types.ts`

State holds both domain data and the **request protocol** (`api.listRequest`/`detailsRequest` with a
status). More on the request-state shape in [create-synapse-effects](./create-synapse-effects.md).

```typescript
export type ApiStatus = 'idle' | 'loading' | 'success' | 'error' | 'reset'

export interface ApiRequestState {
  status: ApiStatus
  error: string | null
}

export interface PokemonState {
  api: {
    listRequest: ApiRequestState
    detailsRequest: ApiRequestState
  }
  pokemonList: PokemonBrief[]
  offset: number
  hasMore: boolean
  selectedPokemonId: number | null
  selectedPokemon: PokemonDetails | null
  searchQuery: string
  favorites: number[]
}
```

`pokemon.store.ts` next to it is just `initialState: PokemonState` (both requests `'idle'`, lists empty).

## 2. ApiClient + mappers — `pokemon.api.ts`

→ in detail: [api-client](./api-client.md)

An ApiClient with tag-based caching and two endpoints (`getList`/`getDetails`). The raw PokeAPI
response types don't leak into the domain — mappers unfold them.

```typescript
export const pokemonApiClient = new ApiClient({
  storage: new MemoryStorage<Record<string, any>>({ name: 'pokemon-advanced-api-cache', initialState: {} }),
  baseQuery: { baseUrl: 'https://pokeapi.co/api/v2', timeout: 10000 },
  cache: { ttl: 60000, invalidateOnError: true },
  endpoints: async (create) => ({
    getList: create<{ limit: number; offset: number }, PokemonListApiResponse>({
      request: (params) => ({ path: '/pokemon', method: 'GET', query: params }),
      cache: { ttl: 120000 }, tags: ['pokemon-list'],
    }),
    getDetails: create<{ id: number }, PokemonApiResponse>({
      request: ({ id }) => ({ path: `/pokemon/${id}`, method: 'GET' }),
      cache: true, tags: ['pokemon-details'],
    }),
  }),
})

export const initPokemonApi = () => pokemonApiClient.init()
export type PokemonApiEndpoints = ReturnType<typeof pokemonApiClient.getEndpoints>

// Mappers: raw response → domain type (id from url, sprite by id, flat stats/abilities)
export function mapListResponse(data: PokemonListApiResponse): { list: PokemonBrief[]; hasMore: boolean } { /* … */ }
export function mapDetailsResponse(data: PokemonApiResponse): PokemonDetails { /* … */ }
```

## 3. External settings — `pokemon.settings.ts`

→ in detail: [dependencies](./dependencies.md)

A separate raw storage: something the module depends on but doesn't own (here — the page size). In
the synapse it comes in as a dependency.

```typescript
export const settingsStorage = new MemoryStorage<PokemonSettings>({
  name: 'pokemon-settings',
  initialState: { pageSize: 12 },
})
```

## 4. Selectors — `pokemon.selectors.ts`

→ in detail: [create-synapse-basic](./create-synapse-basic.md), [selector-system](./selector-system.md)

Derived values. The intermediate `api` slice is `private` (not visible outside, but works as a
dependency in `combine`). `filteredList` = `pokemonList` × `searchQuery`.

```typescript
export class PokemonSelectors extends Selectors<PokemonState> {
  private readonly api = this.select((s) => s.api)

  readonly pokemonList = this.select((s) => s.pokemonList)
  readonly searchQuery = this.select((s) => s.searchQuery)
  readonly favorites = this.select((s) => s.favorites)

  readonly listStatus = this.combine([this.api], (a) => a.listRequest.status)
  readonly isListLoading = this.combine([this.listStatus], (s) => s === 'loading')

  readonly filteredList = this.combine([this.pokemonList, this.searchQuery], (list, query) =>
    query ? list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : list,
  )
  readonly favoriteCount = this.combine([this.favorites], (favs) => favs.length)
}
```

## 5. Dispatcher — `pokemon.dispatcher.ts`

→ in detail: [create-synapse-dispatcher](./create-synapse-dispatcher.md), [dispatcher-detailed](./dispatcher-detailed.md)

Intents. `apiActions` unfolds into the request lifecycle in a single field; `action` is a synchronous
write (payload = return); `signal` is a pure intent; `watcher` is a reactive observer.

```typescript
export class PokemonDispatcher extends Dispatcher<PokemonState> {
  readonly loadList = this.apiActions<void>((s) => s.api.listRequest)     // init/loading/success/failure/reset
  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)
  readonly loadMore = this.signal<void>('Load the next page')

  readonly selectPokemon = this.action((store, id: number | null) => { /* update selectedId */ return id })
  readonly applyPokemonList = this.action((store, data: { list: PokemonBrief[]; hasMore: boolean; append: boolean }) => /* … */)
  readonly applyPokemonDetails = this.action((store, details: PokemonDetails) => /* … */)
  readonly setSearchQuery = this.action((store, query: string) => { store.set('searchQuery', query); return query })
  readonly toggleFavorite = this.action((store, id: number) => { /* toggle in favorites */ return id })

  readonly watchFavoriteCount = this.watcher({ selector: (s) => s.favorites.length, notifyAfterSubscribe: true })
}
```

> `ofType(d.loadList)` in an effect catches ONLY init. To react to the result — `ofType(d.loadList.success)`.

## 6. Effects — `pokemon.effects.ts`

→ in detail: [create-synapse-effects](./create-synapse-effects.md)

Side-effects per action. Services (API endpoints) and the external store (`settings$`) arrive
**through the constructor** and are captured in a closure — the effect doesn't reach into the global
scope for them.

```typescript
export class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(
    private readonly api: PokemonApiEndpoints,
    private readonly settings$: Observable<PokemonSettings>,
  ) { super() }

  readonly loadList = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadList),                                                   // init only
      withLatestFrom(selectorObject(state$, { listStatus: (s) => s.api.listRequest.status }), this.settings$),
      validateMap({
        validator: ([, { listStatus }]) => ({ conditions: [listStatus !== 'loading'], skipAction: () => d.loadList.reset() }),
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

  // loadMore — the same, but offset from the store + append: true; loadDetails — ofType(selectPokemon) → getDetails.
}
```

## 7. Assembly — `pokemon.synapse.ts`

→ in detail: [create-synapse-basic](./create-synapse-basic.md), [dependencies](./dependencies.md)

`createSynapse(factory)` ties everything together. The factory is **async** — it has an
`initPokemonApi()` prologue. It returns a lazy handle: the factory starts on the first `await`/`ready()`,
not on import.

```typescript
export const pokemonSynapse = createSynapse(async () => {
  await initPokemonApi()                                       // async prologue

  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })

  return {
    storage,
    dependencies: [settingsStorage],                           // dependency on the settings store
    dependencyTimeout: 10000,
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage)),
  }
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
```

## 8. React — `PokemonAdvancedExample.tsx` + `PokemonDemo.tsx`

→ in detail: [await-synapse](./await-synapse.md) (manual lift), [synapse-ctx](./synapse-ctx.md) (via provider)

`pokemonSynapse` from step 7 is a **lazy handle** (essentially a `Promise` of the ready module), so
in React you first have to *await* it: `loadingComponent` stays on screen while storage initializes.
Three working approaches below — pick per use case. All copy-paste as-is; you only need
`pokemonSynapse` and `PokemonDemo`.

**Option A — HOC `withSynapseReady` (as in the repo example).** The awaiter is created once at
module level; the HOC keeps `loadingComponent` until storage is ready, then hands the store over
synchronously — inside, `getStoreIfReady()!` is guaranteed non-`undefined`:

```typescript
import { useEffect } from 'react'
import { awaitSynapse } from 'synapse-storage/react'
import { pokemonSynapse } from './pokemon.synapse'
import { PokemonDemo } from './PokemonDemo'

const pokemonAwaiter = awaitSynapse(pokemonSynapse, {
  loadingComponent: <div>Initializing…</div>,
  errorComponent: (error) => <div>Init failed: {error.message}</div>,
})

function PokemonContent() {
  const store = pokemonAwaiter.getStoreIfReady()!          // ready — available synchronously
  useEffect(() => { store.actions.loadList() }, [store])   // initial load
  return <PokemonDemo store={store} />
}

export const PokemonAdvancedExample = pokemonAwaiter.withSynapseReady(PokemonContent)
```

**Option B — `useSynapseReady` hook.** No HOC: gate loading/error right in the component, `store`
comes from the hook (`undefined` until ready):

```typescript
const pokemonAwaiter = awaitSynapse(pokemonSynapse)

export function PokemonAdvancedExample() {
  const { isPending, isError, error, store } = pokemonAwaiter.useSynapseReady()

  useEffect(() => { store?.actions.loadList() }, [store])

  if (isError) return <div>Error: {error?.message}</div>
  if (isPending || !store) return <div>Initializing…</div>
  return <PokemonDemo store={store} />
}
```

**Option C — `createSynapseCtx` provider.** When the store is needed in deeply nested components
without prop drilling. Wrap the tree once, children pull `selectors` / `actions` / `storage` /
`state$` from context hooks:

```typescript
import { useEffect } from 'react'
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { pokemonSynapse } from './pokemon.synapse'

const pokemonCtx = createSynapseCtx(pokemonSynapse, {
  loadingComponent: <div>Initializing…</div>,
})

// The component knows nothing about module creation — it only consumes it from context.
function PokemonPanel() {
  const selectors = pokemonCtx.useSynapseSelectors()       // = store.selectors
  const actions = pokemonCtx.useSynapseActions()           // = store.actions
  const list = useSelector(selectors.filteredList)
  const query = useSelector(selectors.searchQuery)

  useEffect(() => { actions.loadList() }, [actions])
  return <input value={query ?? ''} onChange={(e) => actions.setSearchQuery(e.target.value)} /* …UI… */ />
}

// contextSynapse lifts the module and wraps the component in a Provider.
export const PokemonAdvancedExample = pokemonCtx.contextSynapse(PokemonPanel)
```

Inside `PokemonDemo` reads/writes are identical across all options: read through
`useSelector(store.selectors.X)` (from `synapse-storage/react`), send intents through
`store.actions.X(...)`, and wire up `watchFavoriteCount` via
`store.dispatcher.watchers.watchFavoriteCount()`.

## The 5-state request protocol

The core of the dispatcher↔effects link: every request goes through a fixed lifecycle, and the UI
reads it through `status` selectors.

```
UI dispatch (loadList)  ->  status = 'idle'    (no UI change)
      |
  effect: validateMap
      |-- validation OK  ->  loadingAction     ->  status = 'loading' (spinner)
      |       |-- API OK  ->  apiResult(success) -> status = 'success' (data)
      |       \-- API ERR ->  errorAction        -> status = 'error'   (error)
      \-- validation FAIL ->  skipAction        ->  status = 'reset'   (no UI flicker)
```

## Map: capability → page

| Capability | Module file | Page |
|---|---|---|
| ApiClient (cache/tags), mappers | `pokemon.api.ts` | [api-client](./api-client.md) |
| storage + selectors, minimal createSynapse | `pokemon.store.ts`, `pokemon.selectors.ts` | [create-synapse-basic](./create-synapse-basic.md) |
| dispatcher (action/signal/apiActions/watcher) | `pokemon.dispatcher.ts` | [create-synapse-dispatcher](./create-synapse-dispatcher.md), [dispatcher-detailed](./dispatcher-detailed.md) |
| effects (validateMap/apiResult/fromRequest) | `pokemon.effects.ts` | [create-synapse-effects](./create-synapse-effects.md) |
| dependencies (settingsStorage, async factory) | `pokemon.settings.ts`, `pokemon.synapse.ts` | [dependencies](./dependencies.md) |
| React: manual lift / provider | `PokemonAdvancedExample.tsx` | [await-synapse](./await-synapse.md), [synapse-ctx](./synapse-ctx.md) |
| framework-independent awaiter, SSR fast-path | — | [synapse-awaiter](./synapse-awaiter.md) |
| event bus between modules | — | [event-bus](./event-bus.md) |
```
