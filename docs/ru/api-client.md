# ApiClient — HTTP-клиент с кэшированием

> [Назад к оглавлению](./README.md)

Типизированный HTTP-клиент. Эндпоинты, кэширование на основе тегов, подписки на состояние запросов, отмена.

## Импорты

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { ApiClient } from 'synapse-storage/api'
```

## Создание ApiClient

```typescript
// 1. Хранилище для кэша запросов
const apiCacheStorage = new MemoryStorage<Record<string, any>>({
  name: 'api-cache',
  initialState: {},
})

// 2. Создание клиента
const pokemonApi = new ApiClient({
  storage: apiCacheStorage,         // хранилище кэша (обязательно)

  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,                 // таймаут запроса (мс)
    prepareHeaders: async (headers, context) => {
      headers.set('Accept', 'application/json')
      // headers.set('Authorization', `Bearer ${token}`)
      // context.requestParams — параметры текущего запроса
      // context.getFromStorage('key') — чтение из хранилища
      // context.getCookie('name') — чтение cookie
      return headers
    },
    // fetchFn: customFetch,        // кастомная fetch-функция
    // credentials: 'include',      // CORS credentials
  },

  cache: {
    ttl: 60000,                     // время жизни кэша (мс)
    cleanup: {
      enabled: true,
      interval: 120000,             // интервал автоочистки (мс)
    },
    invalidateOnError: true,        // инвалидировать кэш при ошибке
  },

  endpoints: async (create) => ({
    // GET — список с query-параметрами
    getPokemonList: create<
      { limit?: number; offset?: number },  // тип параметров
      PokemonListResponse                   // тип ответа
    >({
      request: (params) => ({
        path: '/pokemon',
        method: 'GET',
        query: params,              // -> ?limit=5&offset=0
      }),
      cache: { ttl: 120000 },      // кастомный TTL для этого эндпоинта
      tags: ['pokemon-list'],       // теги для инвалидации
    }),

    // GET — один ресурс по ID (параметр в пути)
    getPokemonById: create<{ id: number }, Pokemon>({
      request: ({ id }) => ({
        path: `/pokemon/${id}`,     // -> /pokemon/25
        method: 'GET',
      }),
      cache: true,                  // использует глобальный TTL
      tags: ['pokemon'],
    }),
  }),
})

// 3. Инициализация (обязательна перед использованием)
await apiCacheStorage.initialize()
await pokemonApi.init()
```

## request() — Выполнение запроса

```typescript
// pokemonApi.request(endpointName, params, options?)
// Возвращает Promise<QueryResult<T>>

const result = await pokemonApi.request('getPokemonList', { limit: 5 })

// QueryResult<T>:
// {
//   ok: boolean           — успешен ли запрос
//   data?: T              — данные ответа (типизированные)
//   error?: Error         — ошибка (если ok = false)
//   status: number        — HTTP статус (200, 404, ...)
//   statusText: string    — текст HTTP статуса
//   headers: Headers      — заголовки ответа
//   fromCache?: boolean   — результат из кэша?
// }

if (result.ok) {
  console.log(result.data)        // PokemonListResponse (типизировано)
  console.log(result.fromCache)   // false (первый запрос)
}

// Повторный запрос с теми же параметрами — из кэша
const cached = await pokemonApi.request('getPokemonList', { limit: 5 })
console.log(cached.fromCache)     // true
```

## QueryOptions — Опции запроса

```typescript
// Третий аргумент request() — опции
await pokemonApi.request('getPokemonById', { id: 25 }, {
  disableCache: true,             // обойти кэш
  timeout: 5000,                  // таймаут для этого запроса
  signal: abortController.signal, // сигнал отмены
  headers: new Headers({          // дополнительные заголовки
    'X-Custom': 'value',
  }),
  context: { source: 'user' },   // передаётся в prepareHeaders
})

// prepareHeaders получает context:
prepareHeaders: async (headers, context) => {
  if (context.context?.source === 'admin') {
    headers.set('X-Admin', 'true')
  }
  return headers
}
```

## RequestDefinition — Описание запроса эндпоинта

```typescript
// Полная структура объекта, возвращаемого из request()
request: (params) => ({
  path: '/pokemon',               // путь (добавляется к baseUrl)
  method: 'GET',                  // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body: params,                   // тело запроса (POST/PUT/PATCH)
  query: { limit: 5 },           // query-параметры (?limit=5)
  headers: { 'X-Custom': '1' },  // заголовки для этого запроса
  responseFormat: 'json',         // 'json' | 'blob' | 'arrayBuffer' | 'text' | 'formData' | 'raw'
})

// POST с body + инвалидация кэша
createPokemon: create<{ name: string; type: string }, Pokemon>({
  request: (params) => ({
    path: '/pokemon',
    method: 'POST',
    body: params,                 // сериализуется в JSON
  }),
  invalidatesTags: ['pokemon-list'],  // при успехе сбрасывает кэш
  cache: false,                       // не кэшировать мутации
})
```

## Кэширование и теги

```typescript
// Глобальный кэш (для всех эндпоинтов)
cache: {
  ttl: 60000,                            // 60 секунд
  cleanup: { enabled: true, interval: 120000 },
  invalidateOnError: true,
}

// Кэш для конкретного эндпоинта (перекрывает глобальный)
getPokemonById: create<...>({
  cache: { ttl: 300000 },               // 5 минут для этого эндпоинта
})

// Отключить кэш для эндпоинта
createPokemon: create<...>({
  cache: false,
})

// Отключить кэш для конкретного запроса
await pokemonApi.request('getPokemonById', { id: 1 }, {
  disableCache: true,                    // принудительный сетевой запрос
})

// --- Теги ---
// Эндпоинт помечен тегом:
getPokemonList: create<...>({
  tags: ['pokemon-list'],
})

// Мутация инвалидирует теги при успехе:
createPokemon: create<...>({
  invalidatesTags: ['pokemon-list'],     // сбрасывает кэш всех эндпоинтов
                                         // с тегом 'pokemon-list'
})
```

## getEndpoints() — Прямой доступ к эндпоинтам

```typescript
const endpoints = pokemonApi.getEndpoints()

// Объект эндпоинта:
// {
//   fetchCounts: number              — количество выполненных запросов
//   request(params, options?)        — выполнить запрос (возвращает RequestResponseModify)
//   subscribe(callback)              — подписка на состояние эндпоинта
//   reset()                          — сброс счётчика
//   meta: { name, tags, invalidatesTags, cache }
//   destroy()                        — очистка
// }

// request() через эндпоинт возвращает RequestResponseModify:
const req = endpoints.getPokemonById.request({ id: 25 })

// RequestResponseModify:
// {
//   id: string                       — уникальный ID запроса
//   subscribe(listener)              — подписка на состояние запроса
//   wait()                           — Promise<QueryResult>
//   waitWithCallbacks({ idle, loading, success, error })
//   abort()                          — отмена запроса
//   then/catch/finally               — Promise API (можно await)
// }

// Подписка на состояние запроса
req.subscribe((state) => {
  // RequestState<T>:
  // {
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   data?: Pokemon
  //   error?: Error
  //   fromCache: boolean
  //   requestParams: { id: number }
  // }
  console.log(state.status)       // 'loading' -> 'success'
  console.log(state.data)         // Pokemon | undefined
})

// Ожидание результата
const result = await req.wait()
console.log(result.data)          // Pokemon
```

## waitWithCallbacks() — Колбэки по статусам

```typescript
const endpoints = pokemonApi.getEndpoints()
const req = endpoints.getPokemonById.request({ id: 25 })

const result = await req.waitWithCallbacks({
  idle: (state) => console.log('Ожидание'),
  loading: (state) => console.log('Загрузка...'),
  success: (data, state) => console.log('Данные:', data),
  error: (error, state) => console.log('Ошибка:', error),
})

// result — тот же QueryResult<T>
```

## abort() — Отмена запроса

```typescript
// Способ 1: через эндпоинт
const endpoints = pokemonApi.getEndpoints()
const req = endpoints.getPokemonById.request({ id: 25 })
req.abort()  // отменяет запрос через AbortController

// Способ 2: через AbortController в опциях
const controller = new AbortController()
const result = pokemonApi.request('getPokemonById', { id: 25 }, {
  signal: controller.signal,
})
controller.abort()  // отменяет запрос
```

## subscribe() — Подписка на состояние эндпоинта

```typescript
const endpoints = pokemonApi.getEndpoints()

// Подписка на общее состояние эндпоинта (не конкретного запроса)
const unsub = endpoints.getPokemonById.subscribe((state) => {
  // EndpointState:
  // {
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   error?: Error
  //   fetchCounts: number
  //   meta: { name, tags, invalidatesTags, cache }
  //   cacheableHeaders: string[]
  // }
  console.log('Статус эндпоинта:', state.status, 'запросов:', state.fetchCounts)
})

// Отписка
unsub()
```

## Жизненный цикл

```typescript
// Инициализация (обязательна)
await apiCacheStorage.initialize()  // сначала хранилище
await pokemonApi.init()             // затем клиент

// Уничтожение (очищает кэш, подписки, эндпоинты)
await pokemonApi.destroy()
```
