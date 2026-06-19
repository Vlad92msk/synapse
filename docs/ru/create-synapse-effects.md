# createSynapse (эффекты)

> [Назад к оглавлению](./README.md)

Полная конфигурация: хранилище + селекторы + диспетчер + RxJS-эффекты для побочных действий.

## Создание

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher, Effects, ofType } from 'synapse-storage/reactive'
import { debounceTime, switchMap } from 'rxjs/operators'
import { from } from 'rxjs'

class SearchSelectors extends Selectors<SearchState> {
  readonly query = this.select((s) => s.query)
  readonly results = this.select((s) => s.results)
}

class SearchDispatcher extends Dispatcher<SearchState> {
  readonly setQuery = this.action((store, query: string) => { store.set('query', query); return query })
  readonly searchSuccess = this.action((store, results: string[]) => { store.set('results', results); return results })
}

// Эффекты — класс над Effects<State, Dispatcher>; сервисы через конструктор
class SearchEffects extends Effects<SearchState, SearchDispatcher> {
  constructor(private readonly api: SearchApi) { super() }

  readonly search$ = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.setQuery),
      debounceTime(400),
      switchMap((action) => from(this.api(action.payload)).pipe(
        switchMap(async (results) => d.searchSuccess(results)),
      )),
    ),
  )
}

const searchSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<SearchState>({ name: 'search', initialState })
  return {
    storage,
    dispatcher: new SearchDispatcher(storage),
    selectors: new SearchSelectors(storage),
    effects: new SearchEffects(searchApi),   // сервисы — через конструктор
  }
})
```

## this.effect

```typescript
// this.effect — поле класса; функция получает потоки и контекст, возвращает Observable.
// Сервисы/внешние сторы приходят через конструктор и захватываются в замыкание рецепта.
class SearchEffects extends Effects<SearchState, SearchDispatcher> {
  constructor(private readonly api: SearchApi) { super() }

  readonly search$ = this.effect((action$, state$, ctx) => {
    const d = ctx.dispatcher                 // типизированный диспетчер модуля
    return action$.pipe(
      ofType(d.setQuery),                    // фильтрация по действию
      debounceTime(400),
      switchMap((action) => from(this.api(action.payload)).pipe(
        switchMap(async (results) => d.searchSuccess(results)),
      )),
    )
  })

  // Опциональный teardown — закрыть сокеты и т.п.
  override onDestroy() { /* ... */ }
}
```

`ctx` рецепта — это `{ dispatcher, external }`:

- `dispatcher` — инстанс class-диспетчера этого модуля (`ofType(d.x)` + `d.apply(...)`);
- `external` — внешние диспетчеры (их экшены уже влиты в общий `action$`), доступны если объявлен
  третий генерик: `class Effects<State, Dispatcher, ExternalDispatchers>`.

> **Правило**: сервис из конструктора (`this.api`) можно *захватывать в замыкание* рецепта, но нельзя
> дереференсить прямо в инициализаторе поля — parameter properties присваиваются ПОСЛЕ инициализаторов
> полей подкласса.

## ofType / ofTypes

```typescript
import { ofType, ofTypes } from 'synapse-storage/reactive'

// ofType — фильтрация потока по одному типу действия
action$.pipe(
  ofType(d.setQuery),
)

// ofTypes — фильтрация по нескольким типам
action$.pipe(
  ofTypes([d.setQuery, d.searchError]),
)
```

## Обработка запросов: `validateMap` (чтение) / `mutationMap` (запись)

Для API-эффектов в библиотеке есть два оператора-близнеца с единым словарём
(`validator` / `loadingAction` / `errorAction` / `apiCall`; успех диспатчится **внутри** `apiCall`
через `apiResult`). Оба оборачивают один пайп: `[validator] → loadingAction → [prepare] → apiCall → success / errorAction`.

`fromRequest` превращает запрос `ApiClient` в отменяемый Observable (на отписке абортит HTTP-запрос);
`apiResult` разворачивает успешный `QueryResult` (или бросает `ApiError`, который ловит `errorAction`).

### `validateMap` — чтение (ресурсы)

Построен на `switchMap` (**последний выигрывает**: новый триггер отменяет устаревший in-flight запрос).
Идеально для загрузки ресурса, где важен только последний результат.

```typescript
import { ofType, validateMap, fromRequest, apiResult } from 'synapse-storage/reactive'

loadPosts$ = this.effect((action$, state$, { dispatcher: d }) =>
  action$.pipe(
    ofType(d.loadPosts),
    withLatestFrom(selectorObject(state$, { status: (s) => s.api.postsRequest.status })),
    validateMap({
      // гейт: не грузим повторно, если запрос уже в полёте
      validator: ([, { status }]) => ({ conditions: [status !== ApiStatus.Loading], skipAction: () => d.loadPosts.reset() }),
      loadingAction: () => d.loadPosts.loading(),
      errorAction: (err) => d.loadPosts.failure(getErrorMessage(err)),
      apiCall: ([action], { chunkRequest, chunkRequestConsistent }) =>
        fromRequest(this.api.getPosts.request(action.payload)).pipe(
          apiResult((page) => { d.applyPosts(page); d.loadPosts.success() }),
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

## Возвращаемое значение

```typescript
const store = await searchSynapse

store.storage     // IStorage<SearchState>
store.selectors   // экземпляр SearchSelectors
store.actions     // { setQuery, searchSuccess, ... }
store.dispatcher  // экземпляр SearchDispatcher
store.state$      // Observable<SearchState> — поток состояния (только с эффектами!)

// Эффекты запускаются автоматически при инициализации модуля
```
