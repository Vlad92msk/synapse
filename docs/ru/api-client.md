# ApiClient — HTTP-клиент с кэшированием

> [Назад к оглавлению](./README.md) · [Канонический модуль (`pokemon.api.ts`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/pokemon.api.ts) · [Интерактивная песочница](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/ApiClientExample.tsx)

Типизированный HTTP-клиент: эндпоинты, кэширование на основе тегов, подписки на состояние запросов, отмена.

Эта страница построена вокруг **реального файла `pokemon.api.ts`** из примера
[`pokemon-advanced`](./pokemon-advanced.md). Тот же `pokemonApiClient` дальше используется
в эффектах (см. [Effects](./create-synapse-effects.md)) — это первый кирпич слоя данных.

## Импорты

```typescript
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'
```

## Создание ApiClient (`pokemon.api.ts`)

`pokemon.api.ts` — это **отдельная ответственность модуля**: настройка клиента, описание
эндпоинтов и мапперы сырого ответа в доменные типы. Ничего лишнего.

```typescript
// ─── Сырые типы ответа API ────────────────────────────────────────────────
// Описывают форму, которую отдаёт PokeAPI, — её мы прячем за мапперами.

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

// ─── ApiClient ──────────────────────────────────────────────────────────────

export const pokemonApiClient = new ApiClient({
  // Хранилище кэша запросов (обязательно).
  storage: new MemoryStorage<Record<string, any>>({
    name: 'pokemon-advanced-api-cache',
    initialState: {},
  }),

  baseQuery: {
    baseUrl: 'https://pokeapi.co/api/v2',
    timeout: 10000,                       // таймаут запроса (мс)
  },

  cache: {
    ttl: 60000,                           // глобальное время жизни кэша (мс)
    invalidateOnError: true,              // инвалидировать кэш при ошибке
  },

  endpoints: async (create) => ({
    // GET — список с query-параметрами
    getList: create<{ limit: number; offset: number }, PokemonListApiResponse>({
      request: (params) => ({
        path: '/pokemon',
        method: 'GET',
        query: params,                    // -> ?limit=12&offset=0
      }),
      cache: { ttl: 120000 },             // свой TTL для этого эндпоинта
      tags: ['pokemon-list'],             // теги для инвалидации
    }),

    // GET — один ресурс по ID (параметр в пути)
    getDetails: create<{ id: number }, PokemonApiResponse>({
      request: ({ id }) => ({
        path: `/pokemon/${id}`,           // -> /pokemon/25
        method: 'GET',
      }),
      cache: true,                        // использует глобальный TTL
      tags: ['pokemon-details'],
    }),
  }),
})

// Инициализация клиента (см. ниже «Жизненный цикл»).
export const initPokemonApi = () => pokemonApiClient.init()

// Тип набора эндпоинтов — отдаётся в эффекты как сервис.
export type PokemonApiEndpoints = ReturnType<typeof pokemonApiClient.getEndpoints>
```

## Мапперы ответа

Эндпоинты возвращают **сырой** ответ API. Мапперы превращают его в доменные типы
(`PokemonBrief` / `PokemonDetails` из [`pokemon.types.ts`](./pokemon-advanced.md)),
чтобы дальше слой данных работал только с чистой доменной формой.

```typescript
import type { PokemonBrief, PokemonDetails } from './pokemon.types'

export function mapListResponse(data: PokemonListApiResponse): { list: PokemonBrief[]; hasMore: boolean } {
  const list: PokemonBrief[] = data.results.map((p) => {
    // PokeAPI не отдаёт id в списке — достаём его из url.
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
```

> **Почему мапперы здесь, а не в эффектах:** форма ответа API — деталь транспорта.
> Держа мапперы рядом с эндпоинтами, мы локализуем знание о PokeAPI в одном файле;
> эффекты и селекторы видят только доменные типы.

## request() — выполнение запроса

```typescript
// pokemonApiClient.request(endpointName, params, options?)
// Возвращает Promise<QueryResult<T>>

const result = await pokemonApiClient.request('getList', { limit: 12, offset: 0 })

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
  console.log(result.data)        // PokemonListApiResponse (типизировано)
  console.log(result.fromCache)   // false (первый запрос)
}

// Повторный запрос с теми же параметрами — из кэша
const cached = await pokemonApiClient.request('getList', { limit: 12, offset: 0 })
console.log(cached.fromCache)     // true
```

## QueryOptions — опции запроса

```typescript
// Третий аргумент request() — опции
await pokemonApiClient.request('getDetails', { id: 25 }, {
  disableCache: true,             // обойти кэш
  timeout: 5000,                  // таймаут для этого запроса
  signal: abortController.signal, // сигнал отмены
  headers: new Headers({          // дополнительные заголовки
    'X-Custom': 'value',
  }),
  context: { source: 'user' },   // передаётся в prepareHeaders
})

// prepareHeaders получает context:
baseQuery: {
  baseUrl: 'https://pokeapi.co/api/v2',
  prepareHeaders: async (headers, context) => {
    headers.set('Accept', 'application/json')
    if (context.context?.source === 'admin') headers.set('X-Admin', 'true')
    // context.requestParams        — параметры текущего запроса
    // context.getFromStorage('key') — чтение из хранилища
    // context.getCookie('name')     — чтение cookie
    return headers
  },
}
```

## RequestDefinition — описание запроса эндпоинта

```typescript
// Полная структура объекта, возвращаемого из request()
request: (params) => ({
  path: '/pokemon',               // путь (добавляется к baseUrl)
  method: 'GET',                  // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body: params,                   // тело запроса (POST/PUT/PATCH)
  query: { limit: 12 },          // query-параметры (?limit=12)
  headers: { 'X-Custom': '1' },  // заголовки для этого запроса
  responseFormat: 'json',         // 'json' | 'blob' | 'arrayBuffer' | 'text' | 'formData' | 'raw'
})

// Пример мутации (POST с body + инвалидация кэша):
createPokemon: create<{ name: string; type: string }, PokemonApiResponse>({
  request: (params) => ({
    path: '/pokemon',
    method: 'POST',
    body: params,                 // сериализуется в JSON
  }),
  invalidatesTags: ['pokemon-list'],  // при успехе сбрасывает кэш списка
  cache: false,                       // мутации не кэшируем
})
```

## Кэширование и теги

```typescript
// Глобальный кэш (для всех эндпоинтов)
cache: {
  ttl: 60000,                            // 60 секунд
  invalidateOnError: true,
}

// Кэш для конкретного эндпоинта (перекрывает глобальный)
getList: create<...>({
  cache: { ttl: 120000 },               // 2 минуты для списка
})

// Отключить кэш для эндпоинта
createPokemon: create<...>({
  cache: false,
})

// Отключить кэш для конкретного запроса
await pokemonApiClient.request('getDetails', { id: 1 }, {
  disableCache: true,                    // принудительный сетевой запрос
})

// --- Теги ---
// Эндпоинт помечен тегом:
getList: create<...>({
  tags: ['pokemon-list'],
})

// Мутация инвалидирует теги при успехе:
createPokemon: create<...>({
  invalidatesTags: ['pokemon-list'],     // сбрасывает кэш всех эндпоинтов
                                         // с тегом 'pokemon-list'
})
```

## getEndpoints() — прямой доступ к эндпоинтам

Это та форма, которую слой данных отдаёт в эффекты: `pokemonApiClient.getEndpoints()`
возвращает объект с типизированными эндпоинтами (`getList`, `getDetails`), а тип
`PokemonApiEndpoints` прокидывается в `PokemonEffects` через конструктор.

```typescript
const endpoints = pokemonApiClient.getEndpoints()

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
const req = endpoints.getDetails.request({ id: 25 })

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
  //   data?: PokemonApiResponse
  //   error?: Error
  //   fromCache: boolean
  //   requestParams: { id: number }
  // }
  console.log(state.status)       // 'loading' -> 'success'
  console.log(state.data)         // PokemonApiResponse | undefined
})

// Ожидание результата
const result = await req.wait()
console.log(result.data)          // PokemonApiResponse
```

> В эффектах этот же эндпоинт оборачивается в `fromRequest(this.api.getDetails.request(...))`
> — RxJS-обёртку над `RequestResponseModify`. Подробнее — в [Effects](./create-synapse-effects.md).

## waitWithCallbacks() — колбэки по статусам

```typescript
const endpoints = pokemonApiClient.getEndpoints()
const req = endpoints.getDetails.request({ id: 25 })

const result = await req.waitWithCallbacks({
  idle: (state) => console.log('Ожидание'),
  loading: (state) => console.log('Загрузка...'),
  success: (data, state) => console.log('Данные:', data),
  error: (error, state) => console.log('Ошибка:', error),
})

// result — тот же QueryResult<T>
```

## abort() — отмена запроса

```typescript
// Способ 1: через эндпоинт
const endpoints = pokemonApiClient.getEndpoints()
const req = endpoints.getDetails.request({ id: 25 })
req.abort()  // отменяет запрос через AbortController

// Способ 2: через AbortController в опциях
const controller = new AbortController()
const result = pokemonApiClient.request('getDetails', { id: 25 }, {
  signal: controller.signal,
})
controller.abort()  // отменяет запрос
```

## subscribe() — подписка на состояние эндпоинта

```typescript
const endpoints = pokemonApiClient.getEndpoints()

// Подписка на общее состояние эндпоинта (не конкретного запроса)
const unsub = endpoints.getDetails.subscribe((state) => {
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
// Инициализация (обязательна перед использованием).
// В модуле она спрятана в initPokemonApi() и вызывается из async-фабрики createSynapse:
await initPokemonApi()              // = pokemonApiClient.init()

// Уничтожение (очищает кэш, подписки, эндпоинты)
await pokemonApiClient.destroy()
```

> **Где это собирается вместе:** `pokemonApiClient` создаётся в `pokemon.api.ts`,
> инициализируется в async-прологе фабрики (`pokemon.synapse.ts`), а его эндпоинты
> прокидываются в `PokemonEffects`. Полная сборка — на странице
> [Pokemon пример](./pokemon-advanced.md).

> **Используете React?** `ApiClient` самодостаточен (RxJS/`createSynapse` не нужны), но в
> `synapse-storage/react` есть тонкие хуки поверх эндпоинтов — чтобы не собирать `request()` /
> `subscribe()` руками. Они вынесены на отдельные страницы: **[useApiQuery](./api-use-query.md)** (GET) и
> **[useApiMutation](./api-use-mutation.md)** (мутации). Разделы ниже описывают **нативную** поверхность
> эндпоинта/клиента, на которой построены эти хуки.

## Шина инвалидации кэша: `endpoint.onCacheInvalidate()`

Когда мутация успешно отрабатывает с `invalidatesTags`, соответствующие записи кэша удаляются **и**
эмитится событие инвалидации. Эндпоинты, чьи `tags` пересекаются с инвалидированными, получают
уведомление — именно на этом построен авто-рефетч `useApiQuery` (паритет с React Query: после мутации
активные запросы «оживают», а не ждут истечения TTL).

```typescript
const endpoints = pokemonApiClient.getEndpoints()

// Сделать что-то при инвалидации кэша эндпоинта
const unsub = endpoints.getList.onCacheInvalidate(() => {
  console.log('Кэш списка инвалидирован — рефетчим')
})

// Срабатывает, например, на мутации с invalidatesTags: ['PokemonList']
unsub()
```

## Синхронное чтение кэша: `endpoint.getCachedSync()`

`getCachedSync(params)` читает результат из кэша **синхронно**, без сетевого запроса и без async-тика —
поэтому хук может вернуть серверные данные уже на первом рендере (без вспышки loading после гидрации).
Работает только когда:

- хранилище синхронное (`MemoryStorage` / `LocalStorage`);
- у эндпоинта нет заголовков, влияющих на ключ кэша (иначе ключ нельзя воспроизвести синхронно —
  заголовки готовятся асинхронно);
- кэширование для эндпоинта включено и запись не протухла.

В остальных случаях возвращает `undefined`, и вызывающий откатывается на обычный async-`request()`.
`useApiQuery` использует это автоматически для первого рендера.

```typescript
const cached = endpoints.getDetails.getCachedSync({ id: 25 })
if (cached?.ok) console.log(cached.data) // мгновенно, из кэша
```

## SSR: `dehydrate()` / `hydrate()`

Клиент **не ограничен браузером** — серверный путь реален. На сервере используйте `MemoryStorage`, на
клиенте — любой стор. Метки времени кэша абсолютные (`expiresAt = now + ttl`), поэтому переживают перенос
сервер → клиент, а индекс тегов перестраивается при гидрации.

```typescript
// --- server ---
const api = new ApiClient({ storage: () => new MemoryStorage({ name: 'api-cache' }), baseQuery, endpoints })
await api.init()
await api.request('getList', { limit: 12, offset: 0 }) // прогрев кэша
const dehydrated = await api.dehydrate()                // → сериализовать в HTML
await api.destroy()

// --- client ---
const api = new ApiClient({ storage: () => new MemoryStorage({ name: 'api-cache' }), baseQuery, endpoints })
await api.hydrate(dehydrated) // ДО init → засевает кэш (init не перезатрёт)
await api.init()
// первый request('getList', sameParams) попадёт в кэш — без сетевого запроса
```

- `dehydrate(): Promise<TCacheState>` — снимок кэша (симметрия с `dehydrateModule` для синапс-модулей).
- `hydrate(state)` — засев кэша. Вызванная **до** `init()`, запоминает снапшот и применяет его сразу
  после создания хранилища (чтобы `init()` не перезатёр серверное состояние); вызванная **после**
  `init()`, немедленно заменяет состояние кэша и перестраивает индекс тегов.
- `getStorage()` — доступ к экземпляру кэш-хранилища (ручные сценарии SSR/отладки).

> **Стабильность ключа кэша сервер ↔ клиент.** Ключ кэша включает `cacheableHeaderKeys`. Если набор
> влияющих на кэш заголовков на сервере и клиенте различается (например, auth), ключи разойдутся и
> гидрация «не попадёт». Для SSR-эндпоинтов исключайте такие заголовки из ключа через
> `excludeCacheableHeaderKeys`.
