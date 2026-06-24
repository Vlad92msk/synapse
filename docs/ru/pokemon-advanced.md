# Pokemon Advanced — Полный пример архитектуры

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/tree/master/packages/examples/src/examples/pokemon-advanced)

Полный пример, объединяющий все возможности Synapse: хранилище, селекторы, диспетчер, эффекты, ApiClient, зависимости и внешнее состояние.

## Структура проекта

```
pokemon-class/                — class-based модуль
  pokemon.dispatcher.ts        — class Dispatcher (action / signal / apiActions / watcher)
  pokemon.selectors.ts         — class Selectors (select / combine)
  pokemon.effects.ts           — class Effects (this.effect, validateMap/apiResult)
  pokemon.synapse.ts           — createSynapse(factory), связывающий всё воедино

pokemon-advanced/             — переиспользуемые файлы (не зависят от формы API)
  pokemon.types.ts             — TypeScript-интерфейсы
  pokemon.store.ts             — начальное состояние
  pokemon.settings.ts          — внешнее хранилище настроек (зависимость)
  pokemon.api.ts               — настройка ApiClient + маппинг ответов
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

## 4. Селекторы (class Selectors)

```typescript
import { Selectors } from 'synapse-storage/core'

export class PokemonSelectors extends Selectors<PokemonState> {
  private  api = this.select((s) => s.api)        // private = промежуточный слайс

   pokemonList = this.select((s) => s.pokemonList)
   searchQuery = this.select((s) => s.searchQuery)
   favorites = this.select((s) => s.favorites)
   selectedPokemon = this.select((s) => s.selectedPokemon)
   hasMore = this.select((s) => s.hasMore)

   listStatus = this.combine([this.api], (a) => a.listRequest.status)
   isListLoading = this.combine([this.listStatus], (s) => s === 'loading')

  // Композиция pokemonList + searchQuery → filteredList
   filteredList = this.combine([this.pokemonList, this.searchQuery], (list, query) =>
    query ? list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : list,
  )

   favoriteCount = this.combine([this.favorites], (favs) => favs.length)
   favoritePokemon = this.combine([this.pokemonList, this.favorites], (list, favs) =>
    list.filter((p) => favs.includes(p.id)),
  )
}
```

## 5. Диспетчер (class Dispatcher: action / signal / apiActions / watcher)

```typescript
import { Dispatcher } from 'synapse-storage/reactive'

export class PokemonDispatcher extends Dispatcher<PokemonState> {
  // apiActions — вызываемая группа: loadList() = init, .loading/.success/.failure/.reset
   loadList = this.apiActions<void>((s) => s.api.listRequest)
   loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)

  // signal — чистое намерение (статус подгрузки пишется через loadList.*)
   loadMore = this.signal<void>('Подгрузить следующую страницу')

   selectPokemon = this.action((store, id: number | null) => {
    store.update((s) => {
      s.selectedPokemonId = id
      if (id === null) s.selectedPokemon = null
    })
    return id
  })

   applyPokemonList = this.action((store, data: { list: PokemonBrief[]; hasMore: boolean; append: boolean }) =>
    store.update((s) => {
      s.pokemonList = data.append ? [...s.pokemonList, ...data.list] : data.list
      s.offset = s.pokemonList.length
      s.hasMore = data.hasMore
    }),
  )

   watchFavoriteCount = this.watcher({
    selector: (s) => s.favorites.length,
    notifyAfterSubscribe: true,
  })
}
```

> `ofType(d.loadList)` ловит ТОЛЬКО init. Чтобы среагировать на результат — `ofType(d.loadList.success)`.

## 6. Эффекты (class Effects: validateMap + apiResult)

```typescript
import { Effects, ofType, selectorObject, validateMap, apiResult, fromRequest } from 'synapse-storage/reactive'

// Сервисы (endpoints) и внешние сторы (settings$) — через конструктор, захват в замыкание рецепта.
export class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(
    private  api: PokemonApiEndpoints,
    private  settings$: Observable<PokemonSettings>,
  ) { super() }

   loadList = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadList),                                  // только init
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

## 7. createSynapse — связываем всё воедино

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { toObservable } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'

export const pokemonSynapse = createSynapse(async () => {
  await initPokemonApi()  // async-пролог (бывший setup)

  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-class', initialState })

  return {
    storage,
    dependencies: [settingsStorage],   // зависимость от другого стора
    dependencyTimeout: 10000,
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    // сервисы (endpoints) и внешний стор (settings$) — через конструктор эффектов
    effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage)),
  }
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
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
| `this.action((store, p) => r)` | экшен; payload = возвращённое значение |
| `this.signal<P>(desc)` | чистый сигнал-намерение |
| `this.apiActions<P>(accessor)` | вызываемая группа init/loading/success/failure/reset |
| `this.watcher(config)` | реактивный наблюдатель за частью состояния |
| `validateMap({...})` | RxJS-оператор: валидация -> loading -> apiCall -> success/error |
| `apiResult(cb)` | Маппинг успешного ответа API на dispatch |
| `fromRequest(req)` | Конвертирует endpoint.request() в Observable |
| `selectorObject(state$, {...})` | Именованный объект из state$ для withLatestFrom |
| `selectorMap(state$, ...fns)` | Позиционный кортеж из state$ для withLatestFrom |
