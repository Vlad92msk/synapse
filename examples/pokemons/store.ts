import { createSynapse } from 'synapse-storage/utils'

import { pokemonEndpoints } from './api'
import { createPokemonDispatcher } from './dispatchers/pokemon.dispatcher'
import { pokemonEffects } from './effects/pokemon.effects'
import { createPokemonSelectors } from './selectors/pokemon.selectors'
import { createPokemonStorage } from './storages/pokemon.storage'

export const {
  storage: pokemonStorage,
  state$: pokemonState$,
  actions: pokemonActions,
  selectors: pokemonSelectors,
} = await createSynapse({
  createStorageFn: createPokemonStorage,
  createDispatcherFn: createPokemonDispatcher,
  createSelectorsFn: createPokemonSelectors,
  createEffectConfig: (dispatcher) => ({
    dispatchers: {
      pokemonDispatcher: dispatcher,
    },
    // Внешние потоки хранилищ
    externalStates: {
      // ...
    },
    api: {
      pokemonApi: pokemonEndpoints,
    },
  }),
  effects: [pokemonEffects],
})
