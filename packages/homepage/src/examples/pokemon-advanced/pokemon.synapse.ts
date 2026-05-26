import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import type { PokemonState } from './pokemon.types'
import { initialState } from './pokemon.store'
import { createPokemonSelectors } from './pokemon.selectors'
import { createPokemonDispatcher } from './pokemon.dispatcher'
import { pokemonEffects } from './pokemon.effects'
import { pokemonApiClient, initPokemonApi } from './pokemon.api'

export const synapsePromise = createSynapse({
  setup: async () => {
    await initPokemonApi()
  },

  storage: new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),

  createSelectorsFn: createPokemonSelectors,

  createDispatcherFn: createPokemonDispatcher,

  createEffectConfig: () => ({
    services: { pokemonApi: pokemonApiClient },
  }),

  effects: [pokemonEffects],
})

export type PokemonSynapse = Awaited<typeof synapsePromise>
