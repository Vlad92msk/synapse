import { createSynapse } from 'synapse-storage/utils'

import { pokemonEndpoints } from '../api'
import { createPokemonDispatcher } from './pokemon.dispatcher'
import { pokemonEffects } from './pokemon.effects'
import { createPokemonStorage } from './pokemon.storage'
import { createPokemonSelectors } from './selectors/pokemon.selectors'

export const pokemon1Synapse = await createSynapse({
  createStorageFn: createPokemonStorage,
  createDispatcherFn: createPokemonDispatcher,
  createSelectorsFn: createPokemonSelectors,
  createEffectConfig: (dispatcher) => ({
    dispatchers: {
      pokemonDispatcher: dispatcher,
    },
    api: {
      pokemonApi: pokemonEndpoints,
    },
  }),
  effects: [pokemonEffects],
})


export const {
  storage: pokemon1Storage,
  state$: pokemon1State$,
  actions: pokemon1Actions,
  selectors: pokemon1Selectors,
} = pokemon1Synapse
