# Pokemon Advanced — Full Architecture Example

> [Back to Main](../../README.md)

Complete example combining all Synapse features: storage, selectors, dispatcher, effects, ApiClient, dependencies, and external state.

## Project Structure

```
pokemon-advanced/
  pokemon.types.ts       — TypeScript interfaces
  pokemon.store.ts       — initial state
  pokemon.settings.ts    — external settings storage (dependency)
  pokemon.api.ts         — ApiClient setup + response mappers
  pokemon.selectors.ts   — selectors with external dependencies
  pokemon.dispatcher.ts  — dispatcher with defineAction/defineWatcher + createApiActions
  pokemon.effects.ts     — RxJS effects (validateMap, apiResult, combineEffects)
  pokemon.synapse.ts     — createSynapse wiring everything together
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

## 2. External Settings (Dependency)

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

## 4. Selectors with External Dependencies

```typescript
import type { ISelectorModule, IStorageBase } from 'synapse-storage/core'

type ExternalSelectors = { settings: IStorageBase<PokemonSettings> }

export function createPokemonSelectors(sm: ISelectorModule<PokemonState>, ext: ExternalSelectors) {
  const pokemonList = sm.createSelector((s) => s.pokemonList)
  const searchQuery = sm.createSelector((s) => s.searchQuery)
  const favorites = sm.createSelector((s) => s.favorites)

  // Combined selector — composition of pokemonList + searchQuery
  const filteredList = sm.createSelector(
    [pokemonList, searchQuery],
    (list, query) => {
      if (!query) return list
      return list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    },
  )

  // Derived data
  const favoriteCount = sm.createSelector([favorites], (favs) => favs.length)
  const favoritePokemon = sm.createSelector(
    [pokemonList, favorites],
    (list, favs) => list.filter((p) => favs.includes(p.id)),
  )

  return { pokemonList, searchQuery, favorites, filteredList, favoriteCount, favoritePokemon, ... }
}
```

## 5. Dispatcher with defineAction / defineWatcher / createApiActions

```typescript
import { createDispatcher } from 'synapse-storage/reactive'
import { createApiActions, defineAction, defineWatcher } from 'synapse-storage'

export const createPokemonDispatcher = (storage: IStorage<PokemonState>) => {
  const action = defineAction<PokemonState>()
  const watcher = defineWatcher<PokemonState>()

  // createApiActions — generates init/loading/success/failure/reset actions for an API field
  const listRequest = createApiActions<PokemonState>((draft) => draft.api.listRequest)
  const detailsRequest = createApiActions<PokemonState>((draft) => draft.api.detailsRequest)

  const loadList = action({
    meta: { description: 'Intent to load pokemon list' },
    action: (storage) => {
      storage.update((s) => { s.api.listRequest = { status: 'idle', error: null } })
    },
  })

  const selectPokemon = action({
    action: (storage, id: number | null) => {
      storage.update((s) => {
        s.selectedPokemonId = id
        if (id === null) s.selectedPokemon = null
      })
      return id
    },
  })

  const watchFavoriteCount = watcher({
    selector: (s) => s.favorites.length,
    notifyAfterSubscribe: true,
  })

  return createDispatcher({ storage }, {
    loadList, selectPokemon,
    loadListInit: listRequest.init,
    loadListLoading: listRequest.loading,
    loadListSuccess: listRequest.success,
    loadListFailure: listRequest.failure,
    // ... other actions
    watchFavoriteCount,
  })
}
```

## 6. Effects (validateMap + apiResult + combineEffects)

```typescript
import { ofType, combineEffects, selectorObject, selectorMap, validateMap, apiResult, fromRequest } from 'synapse-storage/reactive'

// Three levels of abstraction for API calls in effects:

// Level 1: Native RxJS — full control
// action$.pipe(ofType(...), switchMap(() => from(api.request(...)).pipe(tap(...), catchError(...))))

// Level 2: waitWithCallbacks — lifecycle managed by request
// endpoint.request(params).waitWithCallbacks({ loading, success, error })

// Level 3: validateMap + apiResult — full protocol with validation
const loadListEffect: PokemonEffect = (action$, state$, { dispatcher, services, externalStates }) =>
  action$.pipe(
    ofType(dispatcher.dispatch.loadList),
    withLatestFrom(
      selectorObject(state$, {
        listStatus: (s) => s.api.listRequest.status,
      }),
      settings,
    ),
    validateMap({
      validator: ([_action, { listStatus }]) => ({
        conditions: [listStatus !== 'loading'],
        skipAction: () => dispatcher.dispatch.loadListReset(),
      }),
      loadingAction: () => dispatcher.dispatch.loadListLoading(),
      errorAction: (err) => dispatcher.dispatch.loadListFailure(String(err)),
      apiCall: ([_action, _state, { pageSize }]) =>
        fromRequest(getList.request({ limit: pageSize, offset: 0 })).pipe(
          apiResult((data) => {
            dispatcher.dispatch.applyPokemonList({ ...mapListResponse(data), append: false })
            dispatcher.dispatch.loadListSuccess()
          }),
        ),
    }),
  )

// Combine multiple effects into one
export const pokemonEffects = combineEffects(loadListEffect, loadMoreEffect, loadDetailsEffect)
```

## 7. createSynapse — Wiring Everything Together

```typescript
import { createSynapse } from 'synapse-storage/utils'

export const synapsePromise = createSynapse({
  // Setup — called before storage init, after dependencies
  setup: async () => {
    await initPokemonApi()
  },

  // Storage
  storage: new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),

  // Dependencies — must be ready before init
  dependencies: [settingsStorage],
  dependencyTimeout: 10000,

  // Selectors with external dependencies
  createSelectorsFn: createPokemonSelectors,
  externalSelectors: { settings: settingsStorage },

  // Dispatcher
  createDispatcherFn: createPokemonDispatcher,

  // Effects with services and external states
  createEffectConfig: () => ({
    services: { pokemonApi: pokemonApiClient.getEndpoints() },
    externalStates: {
      settings: settingsStorage,  // IStorageBase → auto-converted to Observable
    },
  }),
  effects: [pokemonEffects],
})
```

## 5-State Request Protocol

```
UI dispatch (loadList)  →  status = 'idle'    (no UI change)
      │
  effect: validateMap
      ├─ validation OK   →  loadingAction     →  status = 'loading' (spinner)
      │       ├─ API OK  →  apiResult(success) → status = 'success' (data)
      │       └─ API ERR →  errorAction        → status = 'error'   (error)
      └─ validation FAIL →  skipAction         → status = 'reset'   (no UI flicker)
```

## Key Utilities

| Utility | Purpose |
|---|---|
| `defineAction<T>()` | Type-safe action factory (short syntax) |
| `defineWatcher<T>()` | Type-safe watcher factory (short syntax) |
| `createApiActions<T>(accessor)` | Generates init/loading/success/failure/reset for API state field |
| `validateMap({...})` | RxJS operator: validate → loading → apiCall → success/error |
| `apiResult(cb)` | Maps successful API response data to dispatch |
| `fromRequest(req)` | Converts endpoint.request() to Observable |
| `selectorObject(state$, {...})` | Named object from state$ for withLatestFrom |
| `selectorMap(state$, ...fns)` | Positional tuple from state$ for withLatestFrom |
| `combineEffects(...effects)` | Merges multiple effects into one |
