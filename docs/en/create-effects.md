> [🏠 Home](../../README.md)
> [🏠 Журнал изменений](../../CHANGELOG.md)

# Creating Effects
___

```typescript
import { EMPTY, from, mapTo, of, tap } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'

import {
  ofType,           // Listens to 1 event
  ofTypes,          // Listens to multiple events
  createEffect,     // Effect creation function
  combineEffects,   // Combines multiple effects into one
  selectorMap,      // State selection using selectors (returns array)
  selectorObject,   // State selection using selectors (returns object)
  validateMap       // Operator for convenient request handling
} from 'synapse-storage/reactive'
import { pokemonEndpoints } from '../api/pokemon.api'
import { AppConfig } from '../app.config'
import { PokemonDispatcher } from '../pokemon.dispatcher'
import { Pokemon, PokemonState } from '../types'

// Define types for our effects
type DispatcherType = {
  pokemonDispatcher: PokemonDispatcher 
}
type ApiType = { 
  pokemonApi: typeof pokemonEndpoints 
}
type ExternalStorages = {
  core$: typeof coreSynapseIDB.state$
}

type Effect = ReturnType<typeof createEffect<
  AboutUserUserInfo,    // Current storage type
  DispatcherType,       // Dispatcher types
  ApiType,              // API types
  Record<string, void>, // Configuration type
  ExternalStorages     // External storage stream types
>>

// Navigation effect
export const navigationEffect: Effect = createEffect((action$, state$, externalStorages, { pokemonDispatcher }, _, config) =>
  action$.pipe(
    ofTypes([pokemonDispatcher.dispatch.next, pokemonDispatcher.dispatch.prev]),
    switchMap((action) => {
      const { id } = action.payload
      return of(() => pokemonDispatcher.dispatch.loadPokemon(id))
    }),
  ),
)

// Effect for tracking ID changes
export const watchIdEffect: Effect = createEffect((action$, state$, externalStorages, { pokemonDispatcher }) =>
  action$.pipe(
    ofType(pokemonDispatcher.watchers.watchCurrentId),
    withLatestFrom(
          selectorMap(state$,
            (state) => state.value
          //... selectors
        ),
    ),
    mapTo(null),
  ),
)

// Effect for loading pokemon data
export const loadPokemonEffect: Effect = createEffect((
  action$,                // Event stream 
  state$,                 // State stream
  externalStorages,       // External storage streams
  { pokemonDispatcher },  // Dispatchers we passed
  { pokemonApi },         // Various APIs we passed
  config                   // Configuration we passed
  ) =>
  action$.pipe(
    // I use separate action loadPokemon which notifies about intention to make request
    // To avoid setting loading immediately
    ofType(pokemonDispatcher.dispatch.loadPokemon),
    withLatestFrom(
      selectorMap(state$, (s) => s.currentId, (s) => s.currentId),           // |
      selectorMap(pokemon1State$, (s) => s.currentId, (s) => s.currentId),   // | receives stream and selectors, returns array with results
      selectorMap(pokemon1State$, (s) => s.currentId),                       // |
      selectorObject(state$, {                                     // |
        currentId: (s) => s.currentId,                             // | receives stream and returns object with results (for each property, function is called with state of this stream)
        name: (s) => s.currentPokemon?.sprites,                    // |
      }),
    ),
    validateMap({
      apiCall: ([action, [currentId], [externalId, externalId2], [external2Id], externalData]) => {
        const { id } = action.payload

        return from(
          // Use waitWithCallbacks to have access to loading method
          pokemonApi.fetchPokemonById.request({ id }).waitWithCallbacks({
            // Called only when request is actually sent, not taken from cache
            loading: (request) => {
              // At this moment loading will be set and other necessary logic
              pokemonDispatcher.dispatch.loadPokemonRequest(id)
            },
            // Can be used like this:
            // success: (data, request) => {
            //   console.log('SUCCESS', request)
            //   pokemonDispatcher.dispatch.success({ data })
            // },
            // error: (error, request) => {
            //   console.log('ERROR', error, request)
            //   pokemonDispatcher.dispatch.failure(error!)
            // },
          }),
          // Can use more standard way:
        ).pipe(
          switchMap(({ data }) => {
            return of(pokemonDispatcher.dispatch.success({ data }))
          }),
          catchError((err) => of(pokemonDispatcher.dispatch.failure(err))),
        )
      },
    }),
  ),
)

// Combine all effects into one and export
export const pokemonEffects = combineEffects(
  navigationEffect,
  watchIdEffect,
  loadPokemonEffect
)
```
___

## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### Related sections:
- [⚡ Creating Dispatcher](./create-dispatcher.md)
- [⚡ Creating Effects Module](./create-effects-module.md)
- [🌐 API client](./api-client.md)
- [🛠️ createSynapse utility](./create-synapse.md)
