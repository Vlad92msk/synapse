# Pokemon Advanced — A Full Architecture Example

> [Back to Main](../../README.md)

A complete example combining all of Synapse's capabilities: storage, selectors, dispatcher, effects, ApiClient, dependencies, and external state.

## Project structure

```
pokemon-class/                — the class-based module
  pokemon.dispatcher.ts        — class Dispatcher (action / signal / apiActions / watcher)
  pokemon.selectors.ts         — class Selectors (select / combine)
  pokemon.effects.ts           — class Effects (this.effect, validateMap/apiResult)
  pokemon.synapse.ts           — createSynapse(factory), wiring it all together

pokemon-advanced/             — reusable files (independent of the API form)
  pokemon.types.ts             — TypeScript interfaces
  pokemon.store.ts             — the initial state
  pokemon.settings.ts          — an external settings storage (a dependency)
  pokemon.api.ts               — ApiClient setup + response mapping
```

## 1. Types

```typescript
export interface PokemonBrief {
  id: number
  name: string
  sprite: string
}

export interface PokemonDetails {
  id: number; name: string; types: string[]
  stats: Array<{ name: string; value: number }>
  abilities: string[]; sprite: string; height: number; weight: number
}

export type ApiStatus = 'idle' | 'loading' | 'success' | 'error' | 'reset'

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

## 2. External settings (a dependency)

```typescript
import { MemoryStorage } from 'synapse-storage/core'

export interface PokemonSettings {
  pageSize: number
}

export const settingsStorage = new MemoryStorage<PokemonSettings>({
  name: 'pokemon-settings',
  initialState: { pageSize: 12 },
})
```

## 3. ApiClient

```typescript
import { ApiClient } from 'synapse-storage/api'

export const pokemonApiClient = new ApiClient({
  storage: new MemoryStorage<Record<string, any>>({
    name: 'pokemon-api-cache',
    initialState: {},
  }),
  baseQuery: { baseUrl: 'https://pokeapi.co/api/v2', timeout: 10000 },
  cache: { ttl: 60000, invalidateOnError: true },
  endpoints: async (create) => ({
    getList: create<{ limit: number; offset: number }, PokemonListApiResponse>({
      request: (params) => ({ path: '/pokemon', method: 'GET', query: params }),
      cache: { ttl: 120000 },
      tags: ['pokemon-list'],
    }),
    getDetails: create<{ id: number }, PokemonApiResponse>({
      request: ({ id }) => ({ path: `/pokemon/${id}`, method: 'GET' }),
      cache: true,
      tags: ['pokemon-details'],
    }),
  }),
})
```

## 4. Selectors (class Selectors)

```typescript
import { Selectors } from 'synapse-storage/core'

export class PokemonSelectors extends Selectors<PokemonState> {
  private readonly api = this.select((s) => s.api)        // private = an intermediate slice

  readonly pokemonList = this.select((s) => s.pokemonList)
  readonly searchQuery = this.select((s) => s.searchQuery)
  readonly favorites = this.select((s) => s.favorites)
  readonly selectedPokemon = this.select((s) => s.selectedPokemon)
  readonly hasMore = this.select((s) => s.hasMore)

  readonly listStatus = this.combine([this.api], (a) => a.listRequest.status)
  readonly isListLoading = this.combine([this.listStatus], (s) => s === 'loading')

  // Composition pokemonList + searchQuery → filteredList
  readonly filteredList = this.combine([this.pokemonList, this.searchQuery], (list, query) =>
    query ? list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : list,
  )

  readonly favoriteCount = this.combine([this.favorites], (favs) => favs.length)
  readonly favoritePokemon = this.combine([this.pokemonList, this.favorites], (list, favs) =>
    list.filter((p) => favs.includes(p.id)),
  )
}
```

## 5. Dispatcher (class Dispatcher: action / signal / apiActions / watcher)

```typescript
import { Dispatcher } from 'synapse-storage/reactive'

export class PokemonDispatcher extends Dispatcher<PokemonState> {
  // apiActions — a callable group: loadList() = init, .loading/.success/.failure/.reset
  readonly loadList = this.apiActions<void>((s) => s.api.listRequest)
  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)

  // signal — a pure intent (the loading status is written via loadList.*)
  readonly loadMore = this.signal<void>('Load the next page')

  readonly selectPokemon = this.action((store, id: number | null) => {
    store.update((s) => {
      s.selectedPokemonId = id
      if (id === null) s.selectedPokemon = null
    })
    return id
  })

  readonly applyPokemonList = this.action((store, data: { list: PokemonBrief[]; hasMore: boolean; append: boolean }) =>
    store.update((s) => {
      s.pokemonList = data.append ? [...s.pokemonList, ...data.list] : data.list
      s.offset = s.pokemonList.length
      s.hasMore = data.hasMore
    }),
  )

  readonly watchFavoriteCount = this.watcher({
    selector: (s) => s.favorites.length,
    notifyAfterSubscribe: true,
  })
}
```

> `ofType(d.loadList)` catches ONLY init. To react to a result — `ofType(d.loadList.success)`.

## 6. Effects (class Effects: validateMap + apiResult)

```typescript
import { Effects, ofType, selectorObject, validateMap, apiResult, fromRequest } from 'synapse-storage/reactive'

// Services (endpoints) and external stores (settings$) — through the constructor, captured in the recipe's closure.
export class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(
    private readonly api: PokemonApiEndpoints,
    private readonly settings$: Observable<PokemonSettings>,
  ) { super() }

  readonly loadList = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadList),                                  // only init
      withLatestFrom(selectorObject(state$, { listStatus: (s) => s.api.listRequest.status }), this.settings$),
      validateMap({
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
}
```

## 7. createSynapse — wiring it all together

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { toObservable } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'

export const pokemonSynapse = createSynapse(async () => {
  await initPokemonApi()  // the async prologue (the former setup)

  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-class', initialState })

  return {
    storage,
    dependencies: [settingsStorage],   // a dependency on another store
    dependencyTimeout: 10000,
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    // services (endpoints) and the external store (settings$) — through the effects constructor
    effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage)),
  }
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
```

## The 5-state request protocol

```
UI dispatch (loadList)  ->  status = 'idle'    (no UI changes)
      |
  effect: validateMap
      |-- validation OK  ->  loadingAction     ->  status = 'loading' (spinner)
      |       |-- API OK  ->  apiResult(success) -> status = 'success' (data)
      |       \-- API ERR ->  errorAction        -> status = 'error'   (error)
      \-- validation FAIL ->  skipAction         -> status = 'reset'   (no UI flicker)
```

## Key utilities

| Utility | Purpose |
|---|---|
| `this.action((store, p) => r)` | an action; payload = the returned value |
| `this.signal<P>(desc)` | a pure intent signal |
| `this.apiActions<P>(accessor)` | a callable group init/loading/success/failure/reset |
| `this.watcher(config)` | a reactive watcher over part of the state |
| `validateMap({...})` | an RxJS operator: validation -> loading -> apiCall -> success/error |
| `apiResult(cb)` | Maps a successful API response to a dispatch |
| `fromRequest(req)` | Converts endpoint.request() into an Observable |
| `selectorObject(state$, {...})` | A named object from state$ for withLatestFrom |
| `selectorMap(state$, ...fns)` | A positional tuple from state$ for withLatestFrom |
```
