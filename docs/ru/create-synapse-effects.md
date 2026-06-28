# createSynapse (эффекты)

> [Назад к оглавлению](./README.md) · [Эффекты модуля (`pokemon.effects.ts`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/pokemon.effects.ts) · [Песочница (Search)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/CreateSynapseEffectsExample.tsx)

Последний кирпич сборки после [диспетчера](./create-synapse-dispatcher.md): **эффекты** —
RxJS-слой побочных действий. Диспетчер описывает *намерения* (`loadList`, `selectPokemon`,
`loadMore`); эффект слушает их в потоке и превращает в реальные вызовы API, а результат
возвращает в состояние через экшены диспетчера.

Домен тот же — `pokemon-advanced`.

## Эффекты (`pokemon.effects.ts`)

Эффекты — класс над `Effects<State, Dispatcher>`. Каждый эффект объявлен как **поле класса**
через `this.effect(...)`; имя поля = имя эффекта. Сервисы (API-endpoints) и внешние сторы
(`settings$`) приходят **через конструктор** и захватываются в замыкание рецепта.

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
        // гейт: не грузим повторно, пока запрос уже в полёте
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

  // selectPokemon → загрузка деталей выбранного покемона
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

(`loadMore` устроен как `loadList`, только с `offset` из состояния и `append: true` — см.
полный файл.)

## this.effect

`this.effect((action$, state$, ctx) => Observable)` — поле класса; функция-рецепт получает
потоки и контекст, возвращает `Observable`. Поток эмиссий не важен по значению — важны
**побочные эффекты** (вызовы API и диспатч экшенов) внутри пайпа.

```typescript
readonly loadList = this.effect((action$, state$, ctx) => {
  const d = ctx.dispatcher              // типизированный диспетчер этого модуля
  return action$.pipe(
    ofType(d.loadList),                  // фильтрация потока по нужному действию
    // ...обработка, вызовы this.api.*, диспатч d.applyPokemonList(...)
  )
})
```

`ctx` рецепта — это `{ dispatcher, external }`:

- `dispatcher` — инстанс class-диспетчера этого модуля (`ofType(d.x)` + `d.applyPokemonList(...)`);
- `external` — внешние диспетчеры (их экшены уже влиты в общий `action$`), доступны если объявлен
  третий генерик: `class Effects<State, Dispatcher, ExternalDispatchers>`.

> **Правило**: сервис из конструктора (`this.api`) можно *захватывать в замыкание* рецепта, но нельзя
> дереференсить прямо в инициализаторе поля — parameter properties присваиваются ПОСЛЕ инициализаторов
> полей подкласса. Поэтому эффекты — стрелки внутри `this.effect`, а не вычисленные на месте значения.

Опциональный teardown — `override onDestroy()` (закрыть сокеты, отписаться от внешнего источника).

## ofType / ofTypes

```typescript
import { ofType, ofTypes } from 'synapse-storage/reactive'

// ofType — фильтрация потока по одному действию диспетчера
action$.pipe(ofType(d.loadList))

// ofTypes — по нескольким
action$.pipe(ofTypes([d.loadList, d.loadMore]))
```

`ofType` принимает сам экшен (`d.loadList`), а не строку — тип `action.payload` выводится
автоматически. Для `apiActions` фильтр срабатывает на init-вызове группы (`d.loadList()`),
не на `.loading()/.success()` — подробнее в [Dispatcher (подробно)](./dispatcher-detailed.md).

## Чтение состояния в эффекте: selectorObject / selectorMap

Часто перед запросом нужен срез состояния (текущий статус, `offset`, `pageSize`). Берём его
из `state$` через `withLatestFrom` — он подмешивает **последнее** значение без подписки на каждый тик:

```typescript
// selectorObject — именованный срез (ключ → результат)
withLatestFrom(selectorObject(state$, {
  offset: (s) => s.offset,
  hasMore: (s) => s.hasMore,
  listStatus: (s) => s.api.listRequest.status,
}))

// selectorMap — кортеж значений (позиционно)
withLatestFrom(selectorMap(state$, (s) => s.selectedPokemonId, (s) => s.api.detailsRequest.status))
```

Внешние сторы подмешиваются так же — `this.settings$` (из `pokemon.settings`) даёт `pageSize`:

```typescript
withLatestFrom(selectorObject(state$, { listStatus: (s) => s.api.listRequest.status }), this.settings$)
// → значение пайпа: [action, { listStatus }, { pageSize }]
```

## Обработка запросов: `validateMap` (чтение) / `mutationMap` (запись)

Для API-эффектов в библиотеке есть два оператора-близнеца с единым словарём
(`validator` / `loadingAction` / `errorAction` / `apiCall`; успех диспатчится **внутри** `apiCall`
через `apiResult`). Оба оборачивают один пайп: `[validator] → loadingAction → [prepare] → apiCall → success / errorAction`.

`fromRequest` превращает запрос `ApiClient` в отменяемый Observable (на отписке абортит HTTP-запрос);
`apiResult` разворачивает успешный `QueryResult` (или бросает `ApiError`, который ловит `errorAction`).

### `validateMap` — чтение (ресурсы)

Построен на `switchMap` (**последний выигрывает**: новый триггер отменяет устаревший in-flight запрос).
Идеально для загрузки ресурса, где важен только последний результат — как `loadList`/`loadDetails`.

- **`validator`** возвращает `{ conditions, skipAction }`: `conditions` — массив булевых гейтов
  (все должны быть `true`), иначе диспатчится `skipAction` и запрос не идёт. В pokemon это
  «не грузим повторно, пока запрос в полёте» (`listStatus !== 'loading'`) и «есть что грузить»
  (`selectedId !== null`).
- **`loadingAction`** → ставит статус `loading` (через `apiActions`-группу диспетчера).
- **`apiCall`** получает значение пайпа, зовёт `fromRequest(this.api.X.request(...))`, и в `apiResult`
  пишет результат (`d.applyPokemon...`) + `d.X.success()`.
- **`errorAction`** ловит `ApiError` → `d.X.failure(...)`.

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

### `mutationMap` — запись (мутации)

Тот же словарь, плюс два понятия, специфичных для записи:

- **`flatten`** — стратегия конкуренции (rxjs-оператор). У записи нет одного верного варианта, поэтому его
  выбирает вызывающий под смысл операции:
  - `exhaustMap` — одиночная операция (форма create/update): дабл-сабмит **игнорируется**, in-flight
    **не** отменяется;
  - `mergeMap` — операции над разными сущностями (delete/toggle/repost): реальная параллельность;
  - `concatMap` — строго по очереди.
- **`prepare`** — асинхронная сборка тела запроса (FormData, blob'ы, теги) перед `apiCall`; результат приходит
  вторым аргументом в `apiCall`. Нет `prepare` → `body === undefined`.

> **Почему не `validateMap` для записи?** `validateMap` намертво на `switchMap` — он отменяет in-flight запрос
> на новом триггере. Для записи это опасно: дабл-сабмит формы отменил бы первый POST (а он мог уже
> закоммититься на сервере → потеря ответа), а параллельные операции над разными сущностями обрывали бы друг
> друга. Поэтому у мутации стратегию выбирает вызывающий.

```typescript
import { ofType, mutationMap, fromRequest, apiResult } from 'synapse-storage/reactive'
import { exhaustMap, mergeMap } from 'rxjs/operators'

// создание — одиночный сабмит: exhaustMap (игнор дабл-сабмита), async-тело через prepare
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

// удаление — действует на разные посты: mergeMap (параллельность), без тела
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

`validateMap` внутри — это `mutationMap` со стратегией `flatten: switchMap` и без `prepare`: одна и та же
машина, стратегия — единственное концептуальное различие.

> Не каждый эффект — это API-запрос. Для простых случаев (debounce поиска, ретрансляция в другой
> экшен) хватает голого `action$.pipe(...)` с обычными rxjs-операторами — см. [Песочницу (Search)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/CreateSynapseEffectsExample.tsx)
> с `debounceTime` + `switchMap`.

## Сборка

Эффекты подключаются к `createSynapse` так же, как остальные слои, — но их конструктор получает
**сервисы и внешние сторы**: API-endpoints (`pokemonApiClient.getEndpoints()`) и `settings$`
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
  await initPokemonApi()                 // async-пролог: инициализация API-клиента
  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })

  return {
    storage,
    dependencies: [settingsStorage],     // зависимость от другого хранилища
    dependencyTimeout: 10000,
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    // сервисы и внешние сторы — через конструктор эффектов (захват в замыкание)
    effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage)),
  }
})
```

Эффекты запускаются **автоматически** при инициализации модуля (первый `await pokemonSynapse`).
Подробнее про async-фабрику, `dependencies` и `dependencyTimeout` — [Зависимости](./dependencies.md).

## Возвращаемое значение

```typescript
const store = await pokemonSynapse

store.storage     // IStorage<PokemonState>
store.selectors   // экземпляр PokemonSelectors
store.dispatcher  // экземпляр PokemonDispatcher
store.actions     // { loadList, selectPokemon, ... } (алиас store.dispatcher.dispatch)
store.state$      // Observable<PokemonState> — поток состояния (есть всегда)

// Запускаем цепочку намерением — дальше всё ведут эффекты:
store.actions.loadList()      // → effect loadList → API → applyPokemonList → success
store.actions.selectPokemon(25) // → effect loadDetails → API → applyPokemonDetails
```

Как отдать собранный `pokemonSynapse` в React-компоненты — [createSynapseCtx](./synapse-ctx.md).
Полный модуль целиком — [Pokemon (рецепт)](./pokemon-advanced.md).
