# Pokemon Advanced — Полный пример архитектуры

> [Назад к оглавлению](./README.md)

Полный пример, объединяющий все возможности Synapse: хранилище, селекторы, диспетчер, эффекты, ApiClient, зависимости и внешнее состояние.

## Структура проекта

```
pokemon-advanced/
  pokemon.types.ts       — TypeScript-интерфейсы
  pokemon.store.ts       — начальное состояние
  pokemon.settings.ts    — внешнее хранилище настроек (зависимость)
  pokemon.api.ts         — настройка ApiClient + маппинг ответов
  pokemon.selectors.ts   — селекторы с внешними зависимостями
  pokemon.dispatcher.ts  — диспетчер с defineAction/defineWatcher + createApiActions
  pokemon.effects.ts     — RxJS-эффекты (validateMap, apiResult, combineEffects)
  pokemon.synapse.ts     — createSynapse, связывающий всё воедино
```

## 1. Типы

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

## 2. Внешние настройки (зависимость)

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

## 4. Селекторы с внешними зависимостями

```typescript
import type { ISelectorModule, IStorageBase } from 'synapse-storage/core'

type ExternalSelectors = { settings: IStorageBase<PokemonSettings> }

export function createPokemonSelectors(sm: ISelectorModule<PokemonState>, ext: ExternalSelectors) {
  const pokemonList = sm.createSelector((s) => s.pokemonList)
  const searchQuery = sm.createSelector((s) => s.searchQuery)
  const favorites = sm.createSelector((s) => s.favorites)

  // Комбинированный селектор — композиция pokemonList + searchQuery
  const filteredList = sm.createSelector(
    [pokemonList, searchQuery],
    (list, query) => {
      if (!query) return list
      return list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    },
  )

  // Производные данные
  const favoriteCount = sm.createSelector([favorites], (favs) => favs.length)
  const favoritePokemon = sm.createSelector(
    [pokemonList, favorites],
    (list, favs) => list.filter((p) => favs.includes(p.id)),
  )

  return { pokemonList, searchQuery, favorites, filteredList, favoriteCount, favoritePokemon, ... }
}
```

## 5. Диспетчер с defineAction / defineWatcher / createApiActions

```typescript
import { createDispatcher } from 'synapse-storage/reactive'
import { createApiActions, defineAction, defineWatcher } from 'synapse-storage'

export const createPokemonDispatcher = (storage: IStorage<PokemonState>) => {
  const action = defineAction<PokemonState>()
  const watcher = defineWatcher<PokemonState>()

  // createApiActions — генерирует действия init/loading/success/failure/reset для поля API-состояния
  const listRequest = createApiActions<PokemonState>((draft) => draft.api.listRequest)
  const detailsRequest = createApiActions<PokemonState>((draft) => draft.api.detailsRequest)

  const loadList = action({
    meta: { description: 'Намерение загрузить список покемонов' },
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
    // ... другие действия
    watchFavoriteCount,
  })
}
```

## 6. Эффекты (validateMap + apiResult + combineEffects)

```typescript
import { ofType, combineEffects, selectorObject, selectorMap, validateMap, apiResult, fromRequest } from 'synapse-storage/reactive'

// Три уровня абстракции для API-вызовов в эффектах:

// Уровень 1: Нативный RxJS — полный контроль
// action$.pipe(ofType(...), switchMap(() => from(api.request(...)).pipe(tap(...), catchError(...))))

// Уровень 2: waitWithCallbacks — жизненный цикл управляется запросом
// endpoint.request(params).waitWithCallbacks({ loading, success, error })

// Уровень 3: validateMap + apiResult — полный протокол с валидацией
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

// Объединение нескольких эффектов в один
export const pokemonEffects = combineEffects(loadListEffect, loadMoreEffect, loadDetailsEffect)
```

## 7. createSynapse — связываем всё воедино

```typescript
import { createSynapse } from 'synapse-storage/utils'

export const synapsePromise = createSynapse({
  // Setup — вызывается перед инициализацией хранилища, после зависимостей
  setup: async () => {
    await initPokemonApi()
  },

  // Хранилище
  storage: new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),

  // Зависимости — должны быть готовы перед инициализацией
  dependencies: [settingsStorage],
  dependencyTimeout: 10000,

  // Селекторы с внешними зависимостями
  createSelectorsFn: createPokemonSelectors,
  externalSelectors: { settings: settingsStorage },

  // Диспетчер
  createDispatcherFn: createPokemonDispatcher,

  // Эффекты с сервисами и внешними состояниями
  createEffectConfig: () => ({
    services: { pokemonApi: pokemonApiClient.getEndpoints() },
    externalStates: {
      settings: settingsStorage,  // IStorageBase -> автоматически конвертируется в Observable
    },
  }),
  effects: [pokemonEffects],
})
```

## Протокол запроса с 5 состояниями

```
UI dispatch (loadList)  ->  status = 'idle'    (без изменений в UI)
      |
  effect: validateMap
      |-- валидация OK   ->  loadingAction     ->  status = 'loading' (спиннер)
      |       |-- API OK  ->  apiResult(success) -> status = 'success' (данные)
      |       \-- API ERR ->  errorAction        -> status = 'error'   (ошибка)
      \-- валидация FAIL ->  skipAction         -> status = 'reset'   (без мерцания UI)
```

## Ключевые утилиты

| Утилита | Назначение |
|---|---|
| `defineAction<T>()` | Типобезопасная фабрика действий (краткий синтаксис) |
| `defineWatcher<T>()` | Типобезопасная фабрика наблюдателей (краткий синтаксис) |
| `createApiActions<T>(accessor)` | Генерирует init/loading/success/failure/reset для поля API-состояния |
| `validateMap({...})` | RxJS-оператор: валидация -> loading -> apiCall -> success/error |
| `apiResult(cb)` | Маппинг успешного ответа API на dispatch |
| `fromRequest(req)` | Конвертирует endpoint.request() в Observable |
| `selectorObject(state$, {...})` | Именованный объект из state$ для withLatestFrom |
| `selectorMap(state$, ...fns)` | Позиционный кортеж из state$ для withLatestFrom |
| `combineEffects(...effects)` | Объединяет несколько эффектов в один |
