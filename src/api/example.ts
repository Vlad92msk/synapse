import { ApiClient } from './api.module'
import { ResponseFormat } from './types/api.interface'

// Типы данных для PokeAPI
export interface PokemonListResponse {
  count: number
  next: string | null
  previous: string | null
  results: {
    name: string
    url: string
  }[]
}

export interface PokemonDetails {
  id: number
  name: string
  height: number
  weight: number
  sprites: {
    front_default: string
    back_default: string
    other?: {
      'official-artwork'?: {
        front_default: string
      }
    }
  }
  types: {
    slot: number
    type: {
      name: string
      url: string
    }
  }[]
  abilities: {
    ability: {
      name: string
      url: string
    }
    is_hidden: boolean
    slot: number
  }[]
  stats: {
    base_stat: number
    effort: number
    stat: {
      name: string
      url: string
    }
  }[]
}

export interface PokemonSearchParams {
  limit?: number
  offset?: number
}

export const api = new ApiClient({
  cacheableHeaderKeys: ['X-Global-Header'],
  storageType: 'localStorage',
  storageOptions: {
    name: 'pokemon-api-storage',
    dbName: 'pokemon-api-cache',
    storeName: 'requests',
    dbVersion: 1,
  },
  // Кэширование может быть включено/отключено при создании
  cache: true,
  // Базовый запрос
  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,
    prepareHeaders: async (headers, context) => {
      // Устанавливаем заголовки для тестирования
      headers.set('X-Global-Header', 'global-value')
      headers.set('X-BaseQuery-Header', 'basequery-value')
      return headers
    },
    credentials: 'same-origin',
  },
  // Типизированные endpoints
  endpoints: async (create) => ({
    updatePokemonById: create<{ id: number }, PokemonDetails>({
      request: ({ id }) => ({
        path: `/pokemon/${id}`,
        method: 'PUT',
        body: {},
      }),
    }),
    // Запрос деталей покемона по ID (с явно включенным кэшированием)
    getPokemonById: create<{ id: number }, PokemonDetails>({
      request: (params) => ({
        path: `/pokemon/${params.id}`,
        method: 'GET',
        responseFormat: ResponseFormat.Json,
      }),
      // Включаем кэширование с настройками по умолчанию
      // cache: {},
      tags: ['pokemon-details'],
    }),
    // Запрос списка покемонов (без кэширования)
    getPokemonList: create<PokemonSearchParams, PokemonListResponse>({
      request: (
        params = {
          limit: 20,
          offset: 0,
        },
      ) => ({
        path: '/pokemon',
        method: 'GET',
        query: params,
        responseFormat: ResponseFormat.Json,
      }),
      // Явное отключение кэша для этого эндпоинта
      // cache: false,
    }),
  }),
})
console.log('Starting API initialization...')
export const pokemonApi = await api.init()
export const pokemonEndpoints = pokemonApi.getEndpoints()
export const getPokemonById = pokemonEndpoints.getPokemonById.request

// const t = pokemonEndpoints.getPokemonById.request({ id: 1 }, { disableCache: true })
console.log('Endpoints received')
