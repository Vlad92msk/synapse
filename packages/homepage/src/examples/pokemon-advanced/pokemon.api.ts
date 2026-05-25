import { MemoryStorage } from 'synapse-storage/core'
import { ApiClient } from 'synapse-storage/api'
import type { PokemonBrief, PokemonDetails } from './pokemon.types'

// ─── Raw API response types ─────────────────────────────────────────────────

interface PokemonListApiResponse {
  count: number
  next: string | null
  results: Array<{ name: string; url: string }>
}

interface PokemonApiResponse {
  id: number
  name: string
  types: Array<{ type: { name: string } }>
  stats: Array<{ stat: { name: string }; base_stat: number }>
  abilities: Array<{ ability: { name: string } }>
  sprites: { front_default: string }
  height: number
  weight: number
}

// ─── ApiClient ───────────────────────────────────────────────────────────────

const apiCacheStorage = new MemoryStorage<Record<string, any>>({
  name: 'pokemon-advanced-api-cache',
  initialState: {},
})

export const pokemonApiClient = new ApiClient({
  storage: apiCacheStorage as any,

  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,
  },

  cache: {
    ttl: 60000,
    invalidateOnError: true,
  },

  endpoints: async (create) => ({
    getList: create<{ limit: number; offset: number }, PokemonListApiResponse>({
      request: (params) => ({
        path: '/pokemon',
        method: 'GET',
        query: params,
      }),
      cache: { ttl: 120000 },
      tags: ['pokemon-list'],
    }),

    getDetails: create<{ id: number }, PokemonApiResponse>({
      request: ({ id }) => ({
        path: `/pokemon/${id}`,
        method: 'GET',
      }),
      cache: true,
      tags: ['pokemon-details'],
    }),
  }),
})

export async function initPokemonApi() {
  await apiCacheStorage.initialize()
  await pokemonApiClient.init()
}

// ─── Response mappers ────────────────────────────────────────────────────────

export function mapListResponse(data: PokemonListApiResponse): { list: PokemonBrief[]; hasMore: boolean } {
  const list: PokemonBrief[] = data.results.map((p) => {
    const id = parseInt(p.url.split('/').filter(Boolean).pop()!)
    return {
      id,
      name: p.name,
      sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
    }
  })
  return { list, hasMore: !!data.next }
}

export function mapDetailsResponse(data: PokemonApiResponse): PokemonDetails {
  return {
    id: data.id,
    name: data.name,
    types: data.types.map((t) => t.type.name),
    stats: data.stats.map((s) => ({ name: s.stat.name, value: s.base_stat })),
    abilities: data.abilities.map((a) => a.ability.name),
    sprite: data.sprites.front_default,
    height: data.height,
    weight: data.weight,
  }
}
