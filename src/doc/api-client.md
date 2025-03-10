## Модуль управления запросами



```tsx
'use client'

import { useCallback, useState } from 'react'
import { ApiClient, ResponseFormat } from 'synapse'

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
  //...
}

export interface PokemonSearchParams {
  limit?: number
  offset?: number
}

export const api = new ApiClient({
  // Перечисляем заголовки которые будут добавлены в локину формирования ключа
  cacheableHeaderKeys: ['X-Global-Header'],
  storageType: 'localStorage',
  storageOptions: {
    name: 'pokemon-api-storage',
    dbName: 'pokemon-api-cache',
    storeName: 'requests',
    dbVersion: 1,
  },
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
    baseUrl: 'https://pokeapi.co/api/v2',
    // Таймаут запроса в миллисекундах
    timeout: 10000,
    prepareHeaders: async (headers, context) => {
      // Устанавливаем заголовки для тестирования
      headers.set('X-Global-Header', 'global-value')
      headers.set('X-BaseQuery-Header', 'basequery-value')

      // Можем получить значение из localStorage / cookies
      const profileId = context.getFromStorage<string>('myProfileId')
      const token = context.getCookie('myToken')

      // context.someParam - можно получить любые параметры которые передаем в свойство context при вызове метода
      return headers
    },
    credentials: 'same-origin',
  },
  // Асинхронная фабрика по созданию эндпоинтов
  endpoints: async (create) => ({
    updatePokemonById: create<{ id: number }, PokemonDetails>({
      // Можно отключить / уточнить для конкретного эндпоинта
      cache: false,
      // Исключить заголовки из формирования ключа
      excludeCacheableHeaderKeys: [],
      // Включить заголовки из формирования ключа
      includeCacheableHeaderKeys: [],
      // Дополнительные уточнения для форпмирования заголовков для конкретного эндпоинта
      prepareHeaders: async (headers) => headers,
      tags: [],
      invalidatesTags: [],
      // Значения в контексте могут быть те, которые передаем в свойство context при вызове метода
      request: (id, context) => ({
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
    }),
  }),
})
// Инициализация
export const pokemonApi = await api.init()
// Демонтирование
// await pokemonApi.destroy()

// Получение эндпоинтов
export const pokemonEndpoints = pokemonApi.getEndpoints()

export function Example1() {
  const [currentPokemon, setCurrentPokemon] = useState<PokemonDetails | undefined>(undefined)

  const onPokemon = useCallback(async (id: number) => {
    // Создаем запрос
    const request = pokemonEndpoints.getPokemonById.request(
      { id },
      {
        // Можно передать дополнительные свойства в контекст
        context: {
          someKey: 'someValue',
        },
        // Можно отключить кэш для конкретного вызова
        disableCache: true,
        // Можно указать заголовки которые будут участвовать в формирование ключа (перетирают все остальные настройки)
        cacheableHeaderKeys: ['header-key'],
        // и тд...
        // Некоторые аспекты еще буду дорабатывать
      },
    )

    // Создаем подписки
    request.subscribe((state) => {
      switch (state.status) {
        case 'idle': {
          console.log('запрос неактивен')
          break
        }
        case 'loading': {
          console.log('запрос loading')
          break
        }
        case 'success': {
          console.log('запрос success')
          setCurrentPokemon(state.data)
          break
        }
        case 'error': {
          console.log('запрос error')
          break
        }
      }
    }, { autoUnsubscribe: true })

    // Вызываем запрос и получаем response
    const response = await request.wait()
    console.log('response', response)

    // Альтернативный вариант вместо подписок
    request.waitWithCallbacks({
      idle: (request) => {},
      loading: (request) => {},
      success: (data, request) => {},
      error: (error, request) => {},
    }).catch(console.error)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h2>{currentPokemon?.name}</h2>
      <img src={currentPokemon?.sprites.front_default} alt={currentPokemon?.name} />
      <div>
        Types:
        {' '}
        {currentPokemon?.types.map((t) => t.type.name).join(', ')}
      </div>
      <div>
        <button
          onClick={() => onPokemon((currentPokemon?.id || 0) + 1)}
        >
          Next
        </button>
        <span>
          Pokemon #
          {currentPokemon?.id}
        </span>
        <button
          onClick={() => onPokemon((currentPokemon?.id || 0) - 1)}
        >
          Previous
        </button>
      </div>
    </div>
  )
}
```
