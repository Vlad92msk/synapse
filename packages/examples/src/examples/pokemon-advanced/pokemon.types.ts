export interface PokemonBrief {
  id: number
  name: string
  sprite: string
}

export interface PokemonDetails {
  id: number
  name: string
  types: string[]
  stats: Array<{ name: string; value: number }>
  abilities: string[]
  sprite: string
  height: number
  weight: number
}

export type ApiStatus = 'idle' | 'loading' | 'success' | 'error' | 'reset'

export interface ApiRequestState {
  status: ApiStatus
  error: string | null
}

export interface PokemonState {
  api: {
    listRequest: ApiRequestState
    detailsRequest: ApiRequestState
  }
  pokemonList: PokemonBrief[]
  offset: number
  hasMore: boolean
  selectedPokemonId: number | null
  selectedPokemon: PokemonDetails | null
  searchQuery: string
  favorites: number[]
}
