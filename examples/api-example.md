## Отдельно покажу более детальную настройку ApiClient
```tsx
'use client'

import { CSSProperties, useCallback, useState } from 'react'
import { ApiClient, ResponseFormat } from 'synapse-storage/api'

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

const storage = await new MemoryStorage({
  name: 'pokemon-api-cache'
}).initialize()

export const api = new ApiClient({
  // Перечисляем заголовки которые будут добавлены в локину формирования ключа
  cacheableHeaderKeys: ['X-Global-Header'],
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

// Стили
const btn: CSSProperties = { background: '#c7c6c6', color: 'black', padding: '5px', borderRadius: '5px' }
const flexColumn: CSSProperties = { display: 'flex', flexDirection: 'column' }
const img: CSSProperties = { position: 'absolute', objectFit: 'contain' }
const contentContainer: CSSProperties = { ...flexColumn, position: 'relative', width: '400px', height: '400px', marginTop: '10px' }
const actionContainer: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }


export function SimplePokemonViewer() {
  const [currentId, setCurrentId] = useState(1)
  const [state, setCurrentPokemon] = useState<PokemonDetails | undefined>(undefined)
  const [status, setStatus] = useState<'idl'| 'loading' | 'success' | 'error'>('idl')

  const onPokemon = useCallback(async (id: number) => {
    setCurrentId(id)
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
          setStatus('loading')
          console.log('запрос loading')
          break
        }
        case 'success': {
          console.log('запрос success')
          setStatus('success')
          setCurrentPokemon(state.data)
          break
        }
        case 'error': {
          setStatus('error')
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
    <div style={flexColumn}>
      {status === 'loading' ? (
        <p>Loading Pokémon...</p>
      ) : state ? (
        <div style={contentContainer}>
          <h2>{`Name: ${state.name}`}</h2>

          <div style={{ ...flexColumn, marginTop: '10px' }}>
            <p>{`Height: ${state.height / 10}`}</p>
            <p>{`Weight: ${state.weight / 10}`}</p>
          </div>
          <img
            style={img}
            src={state.sprites.other?.['official-artwork']?.front_default || state.sprites.front_default}
            alt={state.name}
          />
        </div>
      ) : null}

      <div style={actionContainer}>
        <button style={btn} onClick={() => onPokemon(currentId - 1)}>{'<--'}</button>
        <strong>{`#${state?.id}`}</strong>
        <button style={btn} onClick={() => onPokemon(currentId + 1)}>{'-->'}</button>
      </div>
    </div>
  )
}
```
