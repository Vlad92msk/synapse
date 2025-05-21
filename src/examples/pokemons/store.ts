import { createSynapse } from '@vlad92msk/synapse/utils'

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
    api: {
      pokemonApi: pokemonEndpoints,
    },
  }),
  effects: [pokemonEffects],
})
