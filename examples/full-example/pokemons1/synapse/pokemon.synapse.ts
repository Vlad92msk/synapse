import { createSynapse } from 'synapse-storage/utils'

import { pokemonEndpoints } from '../api'
import { createPokemonDispatcher } from './pokemon.dispatcher'
import { pokemonEffects } from './pokemon.effects'
import { createPokemonStorage } from './pokemon.storage'
import { createPokemonSelectors } from './selectors/pokemon.selectors'
import { pokemon1State$ } from '../../pokemons/synapse/pokemon.synapse'

export const pokemon2Synapse = await createSynapse({
  createStorageFn: createPokemonStorage,
  createDispatcherFn: createPokemonDispatcher,
  createSelectorsFn: createPokemonSelectors,
  createEffectConfig: (dispatcher) => ({
    externalStates: {
      pokemon1State$,
    },
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
  storage: pokemon2Storage,
  state$: pokemon2State$,
  actions: pokemon2Actions,
  selectors: pokemon2Selectors,
} = pokemon2Synapse
