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

## Handling requests: `validateMap` (reads) / `mutationMap` (writes)

For API effects the library ships two sibling operators with one shared vocabulary
(`validator` / `loadingAction` / `errorAction` / `apiCall`; success is dispatched **inside** `apiCall`
via `apiResult`). They wrap one pipe: `[validator] → loadingAction → [prepare] → apiCall → success / errorAction`.

`fromRequest` turns an `ApiClient` request into a cancellable Observable (aborts the HTTP request on
unsubscribe); `apiResult` unwraps a successful `QueryResult` (or throws `ApiError`, caught by `errorAction`).

### `validateMap` — reads (resources)

Built on `switchMap` (**last wins**: a new trigger aborts the stale in-flight request). Perfect for loading
a resource where only the latest matters.

```typescript
import { ofType, validateMap, fromRequest, apiResult } from 'synapse-storage/reactive'

loadPosts$ = this.effect((action$, state$, { dispatcher: d }) =>
  action$.pipe(
    ofType(d.loadPosts),
    withLatestFrom(selectorObject(state$, { status: (s) => s.api.postsRequest.status })),
    validateMap({
      // gate: don't refetch while a request is already in flight
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

### `mutationMap` — writes (mutations)

Same vocabulary, plus two write-specific concepts:

- **`flatten`** — the concurrency strategy (an rxjs operator). Writes have no single right answer, so the
  caller picks it by meaning:
  - `exhaustMap` — a single operation (create/update form): a double-submit is **ignored**, the in-flight
    request is **not** aborted;
  - `mergeMap` — operations over different entities (delete/toggle/repost): real parallelism;
  - `concatMap` — strictly one after another.
- **`prepare`** — async request-body assembly (FormData, blobs, tags) before `apiCall`; its result arrives as
  the second argument of `apiCall`. No `prepare` → `body` is `undefined`.

> **Why not `validateMap` for writes?** `validateMap` is locked to `switchMap`, which aborts the in-flight
> request on a new trigger. On a write that's a hazard: a double-submit would cancel the first POST (which may
> have already committed server-side → lost response), and parallel ops over different entities would abort each
> other. So a mutation lets the caller choose the strategy.

```typescript
import { ofType, mutationMap, fromRequest, apiResult } from 'synapse-storage/reactive'
import { exhaustMap, mergeMap } from 'rxjs/operators'

// create — single submit: exhaustMap (ignore double-submit), async body via prepare
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

// delete — acts on different posts: mergeMap (parallel), no body
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

`validateMap` is internally just `mutationMap` with `flatten: switchMap` and no `prepare` — same machine,
the strategy is the only conceptual difference.

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
