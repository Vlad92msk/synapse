// Интерфейс для покемона
export interface Pokemon {
  id: number
  name: string
  types: Array<{ type: { name: string } }>
  sprites: {
    front_default: string
    other?: {
      'official-artwork'?: {
        front_default?: string
      }
    }
  }
  height: number
  weight: number
}

// Состояние хранилища покемонов
export interface PokemonState {
  currentPokemon: Pokemon | null | undefined
  loading: boolean
  error: string | null
  currentId: number
}
