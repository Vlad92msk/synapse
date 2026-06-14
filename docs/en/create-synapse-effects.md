# createSynapse (effects)

> [Back to Main](../../README.md)

Full configuration: storage + selectors + dispatcher + RxJS effects for side effects.

## Creating

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

// Effects — a class over Effects<State, Dispatcher>; services through the constructor
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
    effects: new SearchEffects(searchApi),   // services — through the constructor
  }
})
```

## this.effect

```typescript
// this.effect — a class field; the function receives streams and a context, returns an Observable.
// Services/external stores come through the constructor and are captured in the recipe's closure.
class SearchEffects extends Effects<SearchState, SearchDispatcher> {
  constructor(private readonly api: SearchApi) { super() }

  readonly search$ = this.effect((action$, state$, ctx) => {
    const d = ctx.dispatcher                 // the module's typed dispatcher
    return action$.pipe(
      ofType(d.setQuery),                    // filter by action
      debounceTime(400),
      switchMap((action) => from(this.api(action.payload)).pipe(
        switchMap(async (results) => d.searchSuccess(results)),
      )),
    )
  })

  // Optional teardown — close sockets etc.
  override onDestroy() { /* ... */ }
}
```

The recipe's `ctx` is `{ dispatcher, external }`:

- `dispatcher` — this module's class-dispatcher instance (`ofType(d.x)` + `d.apply(...)`);
- `external` — external dispatchers (their actions are already merged into the shared `action$`), available if a
  third generic is declared: `class Effects<State, Dispatcher, ExternalDispatchers>`.

> **Rule**: a service from the constructor (`this.api`) can be *captured in the recipe's closure*, but cannot be
> dereferenced directly in a field initializer — parameter properties are assigned AFTER the subclass's
> field initializers.

## ofType / ofTypes

```typescript
import { ofType, ofTypes } from 'synapse-storage/reactive'

// ofType — filter the stream by a single action type
action$.pipe(
  ofType(d.setQuery),
)

// ofTypes — filter by several types
action$.pipe(
  ofTypes([d.setQuery, d.searchError]),
)
```

## Return value

```typescript
const store = await searchSynapse

store.storage     // IStorage<SearchState>
store.selectors   // a SearchSelectors instance
store.actions     // { setQuery, searchSuccess, ... }
store.dispatcher  // a SearchDispatcher instance
store.state$      // Observable<SearchState> — the state stream (only with effects!)

// Effects start automatically when the module is initialized
```
