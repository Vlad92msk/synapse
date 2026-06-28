# Pokemon Advanced — рецепт: весь слой данных на PokeAPI

> [Назад к оглавлению](./README.md) · [Модуль на GitHub](https://github.com/Vlad92msk/synapse/tree/master/packages/examples/src/examples/pokemon-advanced)

Итоговая страница цепочки. Все предыдущие разделы разбирали по одному кирпичу на этом же домене —
здесь они собираются в **один работающий модуль**: ApiClient с кэшем → мапперы → storage →
селекторы → диспетчер → эффекты → `createSynapse` → React. Это эталон того, как разложить слой
управления данными по файлам-ответственностям и копировать в свой проект.

Каждый раздел ниже ссылается на страницу, где соответствующий кирпич разобран детально.

## Структура модуля

Весь домен живёт в одной папке `pokemon-advanced/`, файл = ответственность:

```
pokemon-advanced/
  pokemon.types.ts       — доменные типы + форма состояния запроса
  pokemon.store.ts       — initialState (форма стора)
  pokemon.settings.ts    — внешнее хранилище настроек (зависимость)
  pokemon.api.ts         — ApiClient (endpoints, cache) + мапперы ответа
  pokemon.selectors.ts   — производные значения (class Selectors)
  pokemon.dispatcher.ts  — намерения (class Dispatcher)
  pokemon.effects.ts     — side-effects на RxJS (class Effects)
  pokemon.synapse.ts     — сборка через createSynapse(factory)
  index.ts               — публичные экспорты
  PokemonAdvancedExample.tsx / PokemonDemo.tsx — UI поверх synapse
  helpers.ts             — мелкие утилиты представления (typeColor)
```

## Поток данных

```
UI (PokemonDemo)
   │  store.actions.loadList() / selectPokemon(id) / setSearchQuery(q) / toggleFavorite(id)
   ▼
dispatcher (намерения)  ──► action$ ──►  effects (RxJS)
   │ apiActions/action/signal             │ ofType → validateMap → fromRequest(api)
   │                                       ▼
   │                                    pokemon.api.ts  (ApiClient + мапперы)
   │                                       │ apiResult(data) → mapListResponse / mapDetailsResponse
   ▼                                       ▼
   └──────────►  applyPokemonList / applyPokemonDetails / loadList.success ──► storage
                                                                                   │
                                              selectors (filteredList, isLoading…) ◄┘
                                                   │  useSelector
                                                   ▼
                                                  UI
```

Связь односторонняя: UI шлёт **намерения** в диспетчер, эффекты делают side-effects и пишут
результат через экшены в storage, селекторы выдают производные значения обратно в UI.

## 1. Типы и форма состояния — `pokemon.types.ts`

Состояние держит и доменные данные, и **протокол запроса** (`api.listRequest`/`detailsRequest`
со статусом). Подробнее про форму состояния запроса — в [create-synapse-effects](./create-synapse-effects.md).

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

`pokemon.store.ts` рядом — это просто `initialState: PokemonState` (оба запроса в `'idle'`,
списки пустые).

## 2. ApiClient + мапперы — `pokemon.api.ts`

→ детально: [api-client](./api-client.md)

ApiClient с кэшем по тегам и двумя эндпоинтами (`getList`/`getDetails`). Сырые типы ответа PokeAPI
не утекают в домен — их разворачивают мапперы.

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

// Мапперы: сырой ответ → доменный тип (id из url, спрайт по id, плоские stats/abilities)
export function mapListResponse(data: PokemonListApiResponse): { list: PokemonBrief[]; hasMore: boolean } { /* … */ }
export function mapDetailsResponse(data: PokemonApiResponse): PokemonDetails { /* … */ }
```

## 3. Внешние настройки — `pokemon.settings.ts`

→ детально: [dependencies](./dependencies.md)

Отдельное сырое хранилище: то, от чего модуль зависит, но чем не владеет (здесь — размер страницы).
В synapse оно входит как зависимость.

```typescript
export const settingsStorage = new MemoryStorage<PokemonSettings>({
  name: 'pokemon-settings',
  initialState: { pageSize: 12 },
})
```

## 4. Селекторы — `pokemon.selectors.ts`

→ детально: [create-synapse-basic](./create-synapse-basic.md), [selector-system](./selector-system.md)

Производные значения. Промежуточный слайс `api` — `private` (наружу не видно, но работает
зависимостью в `combine`). `filteredList` = `pokemonList` × `searchQuery`.

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

## 5. Диспетчер — `pokemon.dispatcher.ts`

→ детально: [create-synapse-dispatcher](./create-synapse-dispatcher.md), [dispatcher-detailed](./dispatcher-detailed.md)

Намерения. `apiActions` раскрывается в жизненный цикл запроса одним полем; `action` — синхронная
запись (payload = return); `signal` — чистое намерение; `watcher` — реактивный наблюдатель.

```typescript
export class PokemonDispatcher extends Dispatcher<PokemonState> {
  readonly loadList = this.apiActions<void>((s) => s.api.listRequest)     // init/loading/success/failure/reset
  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)
  readonly loadMore = this.signal<void>('Подгрузить следующую страницу')

  readonly selectPokemon = this.action((store, id: number | null) => { /* update selectedId */ return id })
  readonly applyPokemonList = this.action((store, data: { list: PokemonBrief[]; hasMore: boolean; append: boolean }) => /* … */)
  readonly applyPokemonDetails = this.action((store, details: PokemonDetails) => /* … */)
  readonly setSearchQuery = this.action((store, query: string) => { store.set('searchQuery', query); return query })
  readonly toggleFavorite = this.action((store, id: number) => { /* toggle in favorites */ return id })

  readonly watchFavoriteCount = this.watcher({ selector: (s) => s.favorites.length, notifyAfterSubscribe: true })
}
```

> `ofType(d.loadList)` в эффекте ловит ТОЛЬКО init. Чтобы реагировать на результат — `ofType(d.loadList.success)`.

## 6. Эффекты — `pokemon.effects.ts`

→ детально: [create-synapse-effects](./create-synapse-effects.md)

Side-effects по экшенам. Сервисы (API-endpoints) и внешний стор (`settings$`) приходят **через
конструктор** и захватываются в замыкание — эффект не лезет за ними в глобальную область.

```typescript
export class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(
    private readonly api: PokemonApiEndpoints,
    private readonly settings$: Observable<PokemonSettings>,
  ) { super() }

  readonly loadList = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadList),                                                   // только init
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

  // loadMore — то же, но offset из стора + append: true; loadDetails — ofType(selectPokemon) → getDetails.
}
```

## 7. Сборка — `pokemon.synapse.ts`

→ детально: [create-synapse-basic](./create-synapse-basic.md), [dependencies](./dependencies.md)

`createSynapse(factory)` связывает всё. Фабрика **async** — есть пролог `initPokemonApi()`.
Возвращается ленивый handle: фабрика стартует при первом `await`/`ready()`, не на импорте.

```typescript
export const pokemonSynapse = createSynapse(async () => {
  await initPokemonApi()                                       // async-пролог

  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })

  return {
    storage,
    dependencies: [settingsStorage],                           // зависимость от стора настроек
    dependencyTimeout: 10000,
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage)),
  }
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
```

## 8. React — `PokemonAdvancedExample.tsx` + `PokemonDemo.tsx`

→ детально: [await-synapse](./await-synapse.md) (ручной подъём), [synapse-ctx](./synapse-ctx.md) (через провайдер)

Ленивый handle поднимается через `awaitSynapse`: awaiter создаётся на уровне модуля, HOC
`withSynapseReady` держит `loadingComponent`, пока storage не готов, затем отдаёт стор синхронно.

```typescript
const pokemonAwaiter = awaitSynapse(pokemonSynapse, {
  loadingComponent: <div>Initializing...</div>,
  errorComponent: (error) => <div>Init failed: {error.message}</div>,
})

function PokemonContent() {
  const store = pokemonAwaiter.getStoreIfReady()!          // готов — доступен синхронно
  useEffect(() => { store.actions.loadList() }, [store])   // первичная загрузка
  return <PokemonDemo store={store} />
}

export const PokemonAdvancedExample = pokemonAwaiter.withSynapseReady(PokemonContent)
```

`PokemonDemo` читает через `useSelector(store.selectors.X)`, шлёт намерения через
`store.actions.X(...)`, а `watchFavoriteCount` подключает через `store.dispatcher.watchers.watchFavoriteCount()`.

## Протокол запроса с 5 состояниями

Ядро связки dispatcher↔effects: каждый запрос проходит фиксированный жизненный цикл, а UI читает
его через `status`-селекторы.

```
UI dispatch (loadList)  ->  status = 'idle'    (без изменений в UI)
      |
  effect: validateMap
      |-- валидация OK   ->  loadingAction     ->  status = 'loading' (спиннер)
      |       |-- API OK  ->  apiResult(success) -> status = 'success' (данные)
      |       \-- API ERR ->  errorAction        -> status = 'error'   (ошибка)
      \-- валидация FAIL ->  skipAction         -> status = 'reset'   (без мерцания UI)
```

## Карта: возможность → страница

| Возможность | Файл модуля | Страница |
|---|---|---|
| ApiClient (cache/tags), мапперы | `pokemon.api.ts` | [api-client](./api-client.md) |
| storage + selectors, минимальный createSynapse | `pokemon.store.ts`, `pokemon.selectors.ts` | [create-synapse-basic](./create-synapse-basic.md) |
| dispatcher (action/signal/apiActions/watcher) | `pokemon.dispatcher.ts` | [create-synapse-dispatcher](./create-synapse-dispatcher.md), [dispatcher-detailed](./dispatcher-detailed.md) |
| effects (validateMap/apiResult/fromRequest) | `pokemon.effects.ts` | [create-synapse-effects](./create-synapse-effects.md) |
| зависимости (settingsStorage, async-фабрика) | `pokemon.settings.ts`, `pokemon.synapse.ts` | [dependencies](./dependencies.md) |
| React: ручной подъём / провайдер | `PokemonAdvancedExample.tsx` | [await-synapse](./await-synapse.md), [synapse-ctx](./synapse-ctx.md) |
| фреймворк-независимый awaiter, SSR fast-path | — | [synapse-awaiter](./synapse-awaiter.md) |
| шина событий между модулями | — | [event-bus](./event-bus.md) |
