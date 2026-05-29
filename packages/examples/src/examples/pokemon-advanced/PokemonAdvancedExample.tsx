import { useState, useEffect } from 'react'
import { cardStyle, codeBlock, sectionTitle } from '../styles'
import { synapsePromise, type PokemonSynapse } from './pokemon.synapse'
import { PokemonDemo } from './PokemonDemo'

export function PokemonAdvancedExample() {
  const [store, setStore] = useState<PokemonSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    synapsePromise.then((s) => {
      if (!cancelled) {
        setStore(s)
        s.actions.loadList()
      }
    })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>Pokemon Pokedex (advanced)</h2>
      <p>
        Продвинутый пример: декомпозиция на модули, несколько API-запросов,
        effects с RxJS, составные селекторы, watcher.
      </p>

      {/* ─── Декомпозиция ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Декомпозиция на файлы</h3>
      <pre style={codeBlock}>{`pokemon/
  pokemon.types.ts       — типы и интерфейсы
  pokemon.api.ts         — ApiClient + endpoints + response mappers
  pokemon.store.ts       — state shape + initialState
  pokemon.selectors.ts   — createPokemonSelectors(selectorModule)
  pokemon.dispatcher.ts  — createPokemonDispatcher(storage)
  pokemon.effects.ts     — loadListEffect, loadDetailsEffect, ...
  pokemon.synapse.ts     — assembly: initApi → createSynapse({ ... })
  helpers.ts             — утилиты (typeColor, ...)
  index.ts               — re-export`}</pre>

      {/* ─── Store ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Store с API-статусами</h3>
      <pre style={codeBlock}>{`// pokemon.store.ts
interface PokemonState {
  api: {
    listRequest: { status: ApiStatus; error: string | null }
    detailsRequest: { status: ApiStatus; error: string | null }
  }
  pokemonList: PokemonBrief[]
  offset: number
  hasMore: boolean
  selectedPokemonId: number | null
  selectedPokemon: PokemonDetails | null
  searchQuery: string
  favorites: number[]
}

// Фабрика для async-создания (например, с middleware)
export async function createPokemonStorage() {
  return new MemoryStorage<PokemonState>({
    name: 'pokemon',
    initialState,
    middlewares: () => [broadcastMiddleware({ ... })],
  }).initialize()
}`}</pre>

      {/* ─── Dispatcher ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Dispatcher с action-группами</h3>
      <pre style={codeBlock}>{`// pokemon.dispatcher.ts
export function createPokemonDispatcher(storage: IStorage<PokemonState>) {
  return createDispatcher({ storage }, (_, { createAction, createWatcher }) => {

    // Группа: загрузка списка
    const loadList = createAction({
      type: 'loadList',
      meta: { description: 'Инициализация загрузки' },
      action: () => {
        storage.update((s) => { s.api.listRequest.status = 'loading' })
        return { offset: 0 }
      },
    })
    const loadMore = createAction({ type: 'loadMore', ... })
    const loadListSuccess = createAction({ type: 'loadListSuccess', ... })
    const loadListError = createAction({ type: 'loadListError', ... })

    // Группа: детали покемона
    const selectPokemon = createAction({ type: 'selectPokemon', ... })
    const loadDetailsSuccess = createAction({ type: 'loadDetailsSuccess', ... })
    const loadDetailsError = createAction({ type: 'loadDetailsError', ... })

    // Watcher — реактивное отслеживание
    const watchFavoriteCount = createWatcher({
      type: 'watchFavoriteCount',
      selector: (s) => s.favorites.length,
      notifyAfterSubscribe: true,
    })

    return { loadList, loadMore, ..., watchFavoriteCount }
  })
}`}</pre>

      {/* ─── Selectors ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Селекторы с композицией</h3>
      <pre style={codeBlock}>{`// pokemon.selectors.ts
export function createPokemonSelectors(sm: ISelectorModule<PokemonState>) {
  const api = sm.createSelector((s) => s.api)
  const pokemonList = sm.createSelector((s) => s.pokemonList)
  const searchQuery = sm.createSelector((s) => s.searchQuery)
  const favorites = sm.createSelector((s) => s.favorites)

  // Производные от api
  const listStatus = sm.createSelector([api], (a) => a.listRequest.status)
  const isListLoading = sm.createSelector([listStatus], (s) => s === 'loading')

  // Композиция: pokemonList + searchQuery → filteredList
  const filteredList = sm.createSelector(
    [pokemonList, searchQuery],
    (list, query) => query
      ? list.filter((p) => p.name.includes(query.toLowerCase()))
      : list,
  )

  // Композиция: pokemonList + favorites → favoritePokemon
  const favoritePokemon = sm.createSelector(
    [pokemonList, favorites],
    (list, favs) => list.filter((p) => favs.includes(p.id)),
  )

  return { filteredList, isListLoading, favoritePokemon, ... }
}`}</pre>

      {/* ─── API Client ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>API Client (ApiClient)</h3>
      <pre style={codeBlock}>{`// pokemon.api.ts
import { MemoryStorage } from 'synapse-storage/core'
import { ApiClient } from 'synapse-storage/api'

const apiCacheStorage = new MemoryStorage<Record<string, any>>({
  name: 'pokemon-api-cache',
  initialState: {},
})

export const pokemonApiClient = new ApiClient({
  storage: apiCacheStorage,
  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,
  },
  cache: { ttl: 60000, invalidateOnError: true },

  endpoints: async (create) => ({
    getList: create<{ limit: number; offset: number }, PokemonListApiResponse>({
      request: (params) => ({ path: '/pokemon', method: 'GET', query: params }),
      cache: { ttl: 120000 },
      tags: ['pokemon-list'],
    }),
    getDetails: create<{ id: number }, PokemonApiResponse>({
      request: ({ id }) => ({ path: \`/pokemon/\${id}\`, method: 'GET' }),
      cache: true,
      tags: ['pokemon-details'],
    }),
  }),
})

export async function initPokemonApi() {
  await apiCacheStorage.initialize()
  await pokemonApiClient.init()
}

// Response mappers: raw API → domain types
export function mapListResponse(data: PokemonListApiResponse) { ... }
export function mapDetailsResponse(data: PokemonApiResponse) { ... }`}</pre>

      {/* ─── Effects ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Effects с ApiClient</h3>
      <pre style={codeBlock}>{`// pokemon.effects.ts
import { type pokemonApiClient, mapListResponse, mapDetailsResponse } from './pokemon.api'

type Dispatchers = { pokemonDispatcher: PokemonDispatcher }
type Services = { pokemonApi: typeof pokemonApiClient }

// Effect 1: загрузка списка через ApiClient
const loadListEffect = createEffect(
  (action$, state$, _ext, { pokemonDispatcher }, { pokemonApi: api }) =>
    action$.pipe(
      ofType(pokemonDispatcher.dispatch.loadList),
      switchMap(() =>
        // api.request() возвращает QueryResult с { ok, data, error, fromCache }
        from(api.request('getList', { limit: 12, offset: 0 })).pipe(
          tap((result) => {
            if (result.ok && result.data) {
              pokemonDispatcher.dispatch.loadListSuccess({
                ...mapListResponse(result.data), append: false,
              })
            } else {
              pokemonDispatcher.dispatch.loadListError(String(result.error))
            }
          }),
          catchError((err) => {
            pokemonDispatcher.dispatch.loadListError(String(err))
            return EMPTY
          }),
        ),
      ),
    ),
)

// Effect 2: подгрузка (withLatestFrom + selectorObject)
const loadMoreEffect = createEffect(
  (action$, state$, _ext, { pokemonDispatcher }, { pokemonApi: api }) =>
    action$.pipe(
      ofType(pokemonDispatcher.dispatch.loadMore),
      withLatestFrom(
        selectorObject(state$, { offset: (s) => s.offset }),
      ),
      switchMap(([_, { offset }]) =>
        from(api.request('getList', { limit: 12, offset })).pipe(
          tap((result) => {
            if (result.ok && result.data) {
              pokemonDispatcher.dispatch.loadListSuccess({
                ...mapListResponse(result.data), append: true,
              })
            } else {
              pokemonDispatcher.dispatch.loadListError(String(result.error))
            }
          }),
          catchError(...)
        ),
      ),
    ),
)

// Effect 3: загрузка деталей
const loadDetailsEffect = createEffect(
  (action$, _, _ext, { pokemonDispatcher }, { pokemonApi: api }) =>
    action$.pipe(
      ofType(pokemonDispatcher.dispatch.selectPokemon),
      switchMap((action) => {
        if (action.payload === null) return EMPTY
        return from(api.request('getDetails', { id: action.payload })).pipe(
          tap((result) => {
            if (result.ok && result.data) {
              pokemonDispatcher.dispatch.loadDetailsSuccess(
                mapDetailsResponse(result.data),
              )
            } else {
              pokemonDispatcher.dispatch.loadDetailsError(String(result.error))
            }
          }),
          catchError(...)
        )
      }),
    ),
)

export const pokemonEffects = combineEffects(
  loadListEffect, loadMoreEffect, loadDetailsEffect,
)`}</pre>

      {/* ─── Assembly ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Assembly (createSynapse)</h3>
      <pre style={codeBlock}>{`// pokemon.synapse.ts
import { createSynapse } from 'synapse-storage/utils'
import { pokemonApiClient, initPokemonApi } from './pokemon.api'

// setup вызывается до инициализации хранилища — удобно для API-клиентов
export const synapsePromise = createSynapse({
  setup: initPokemonApi,

  storage: new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),

  createSelectorsFn: createPokemonSelectors,
  createDispatcherFn: createPokemonDispatcher,

  createEffectConfig: (dispatcher) => ({
    dispatchers: { pokemonDispatcher: dispatcher },
    api: { pokemonApi: pokemonApiClient },
  }),

  effects: [pokemonEffects],
})

export type PokemonSynapse = Awaited<typeof synapsePromise>`}</pre>

      {/* ─── Demo ──────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Demo</h3>
      <PokemonDemo store={store} />
    </div>
  )
}
