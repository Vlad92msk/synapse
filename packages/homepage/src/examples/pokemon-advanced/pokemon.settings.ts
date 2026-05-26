import { MemoryStorage } from 'synapse-storage/core'

export interface PokemonSettings {
  pageSize: number
}

export const settingsStorage = new MemoryStorage<PokemonSettings>({
  name: 'pokemon-settings',
  initialState: { pageSize: 12 },
})
