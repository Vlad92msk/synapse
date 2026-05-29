# createSynapse (effects)

> [Back to Main](../../README.md)

Full configuration: storage + selectors + dispatcher + RxJS effects for side-effects.

## Creating

```typescript
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher, ofType, createEffect } from 'synapse-storage/reactive'
import { debounceTime, switchMap, tap } from 'rxjs/operators'
import { of } from 'rxjs'

const synapsePromise = createSynapse({
  storage: new MemoryStorage<SearchState>({ name: 'search', initialState }),

  createSelectorsFn: (sm) => ({ ... }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction }) => {
      const setQuery = createAction({ type: 'setQuery', action: (q: string) => { ... } })
      const searchSuccess = createAction({ type: 'searchSuccess', action: ... })
      return { setQuery, searchSuccess }
    }),

  // Dispatcher is passed automatically
  createEffectConfig: () => ({
    // services?: {},            // services (API clients, etc.)
    // config?: {},              // configuration for effects
    // externalDispatchers?: {}, // dispatchers from other synapse
  }),

  // Array of effects
  effects: [ ... ],
})
```

## createEffect

```typescript
import { createEffect, ofType } from 'synapse-storage/reactive'

// Effect — function receiving streams and context, returning an Observable
createEffect((action$, state$, { dispatcher, services, config }) =>
  action$.pipe(
    ofType(dispatcher.dispatch.setQuery),  // filter by action
    debounceTime(400),
    switchMap((action) => {
      const query = action.payload as string
      return of(query).pipe(
        switchMap(async (q) => {
          const results = await fetchResults(q)
          dispatcher.dispatch.searchSuccess(results)
        }),
      )
    }),
  ),
)

// Arguments:
// action$  — Observable of all dispatched actions
// state$   — Observable of current state
// context  — { dispatcher, externalDispatchers, services, config }
```

## ofType / ofTypes

```typescript
import { ofType, ofTypes } from 'synapse-storage/reactive'

// ofType — filter stream by one action type
action$.pipe(
  ofType(dispatcher.dispatch.setQuery),
)

// ofTypes — filter by multiple types
action$.pipe(
  ofTypes([
    dispatcher.dispatch.setQuery,
    dispatcher.dispatch.searchError,
  ]),
)
```

## Return Value

```typescript
const store = await synapsePromise

store.storage     // IStorage<SearchState>
store.selectors   // { query, results, isLoading, error }
store.actions     // { setQuery, searchSuccess, searchError }
store.dispatcher  // Dispatcher
store.state$      // Observable<SearchState> — state stream (only with effects!)
store.destroy()   // () => Promise<void>

// Effects start automatically on initialization
```
