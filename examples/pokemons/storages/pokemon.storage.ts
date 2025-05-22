import { MemoryStorage } from 'synapse-storage/core'

import { PokemonState } from '../types'

export async function createPokemonStorage() {
  return new MemoryStorage<PokemonState>({
    name: 'pokemon-store',
    initialState: {
      currentPokemon: null,
      loading: true,
      error: null,
      currentId: 1,
    },
  }).initialize()
}

export type PokemonStorage = Awaited<ReturnType<typeof createPokemonStorage>>
