import { ApiClient, ResponseFormat } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'
import { appConfig } from './app.config'
import { Pokemon } from './types'

export interface PokemonSearchParams {
  limit?: number
  offset?: number
}

const storage = await new MemoryStorage({
  name: 'pokemon-api-cache'
}).initialize()

export const api = new ApiClient({
  storage,
  // Или boolean или объект с настройками
  cache: {
    // Время жизни кэша в миллисекундах
    ttl: 5 * 60 * 1000, // 5 минут
    //  Инвалидировать кэш при ошибке
    invalidateOnError: true,
    cleanup: {
      // Включить периодическую очистку
      enabled: true,
      // Интервал очистки в миллисекундах
      interval: 10 * 60 * 1000, // 10 минут
    },
  },
  baseQuery: {
    baseUrl: appConfig.apiBaseUrl,
    timeout: 10000,
    credentials: 'same-origin',
  },
  endpoints: async (create) => ({
    fetchPokemonById: create<{ id: number }, Pokemon>({
      request: (params) => ({
        path: `/pokemon/${params.id}`,
        method: 'GET',
        responseFormat: ResponseFormat.Json,
      }),
      tags: ['pokemon-details'],
    }),
  }),
})
// Инициализация
export const pokemonApi = await api.init()
// Демонтирование
// await pokemonApi.destroy()

// Получение эндпоинтов
export const pokemonEndpoints = pokemonApi.getEndpoints()
