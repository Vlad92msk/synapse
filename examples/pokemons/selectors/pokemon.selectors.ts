import { ISelectorModule } from 'synapse-storage/core'

import { PokemonState } from '../types'

export const createPokemonSelectors = (selectorModule: ISelectorModule<PokemonState>) => {
  const sprites = selectorModule.createSelector((state) => state.currentPokemon?.sprites)

  return {
    sprites,
  }
}
