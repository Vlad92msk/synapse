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
