# Custom baseQuery.fetchFn

> [Назад к оглавлению](../../README.md)

`ApiClient` принимает кастомный транспорт через `baseQuery.fetchFn?: typeof fetch`. Он заменяет **то,
КАК** клиент выполняет запрос — обёртка над axios, auth-retry, сбор метрик или мост через
`postMessage` в Web Worker для тяжёлого парсинга. Это **транспорт**, а не перехват ServiceWorker'ом
(для этого см. [Собственный fetch-перехватывающий ServiceWorker](./custom-fetch-service-worker.md)).

> **Библиотеку расширять НЕ нужно.** `fetchFn` — встроенное поле `baseQuery`. Исходники библиотеки не
> трогаются: вы передаёте свою функцию, и клиент использует её как есть.

## When it makes sense

- **Auth-retry** — добавить заголовок `Authorization` и сделать один тихий `refresh → retry` при
  ответе `401`, чтобы остальное приложение не видело истечения токена.
- **Метрики / трассировка** — замерять каждый запрос, подставлять trace id, репортить ошибки.
- **axios (или любой клиент)** — переиспользовать существующий инстанс axios со всеми интерсепторами,
  адаптировав его ответ обратно в стандартный `Response`.
- **Worker-транспорт** — вынести `fetch` + тяжёлый парсинг в `Worker` через `postMessage` и вернуть
  готовый `Response`, не нагружая главный поток.

## Configuration

```typescript
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'

// Кастомный fetchFn точно соответствует сигнатуре `typeof fetch`.
const customFetch: typeof fetch = async (input, init) => {
  // ...делаем всё, что нужно транспорту, и возвращаем Response
  return fetch(input, init)
}

const client = new ApiClient({
  storage: new MemoryStorage({ name: 'api-cache', initialState: {} }),
  baseQuery: {
    baseUrl: 'https://api.example.com',
    fetchFn: customFetch, // ← заменяет транспорт; всё остальное без изменений
  },
  cache: { ttl: 60_000 },
  endpoints: async (create) => ({
    getNotes: create({ request: () => ({ path: '/notes', method: 'GET' }), tags: ['notes'] }),
  }),
})
```

`fetchFn` обязан соответствовать `typeof fetch`: `(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>`.
Клиент вызывает его с уже собранным URL и `RequestInit` (метод, заголовки, сериализованное тело,
`signal`, `credentials`) и читает возвращённый `Response` ровно так же, как нативный.

## Auth-retry example

`fetchFn`, который добавляет bearer-токен и делает ровно один тихий refresh-then-retry при `401`:

```typescript
let sessionToken = getToken()

const customFetch: typeof fetch = async (input, init) => {
  const send = (token: string) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  }

  let res = await send(sessionToken)
  if (res.status === 401) {
    // ApiClient сверху вообще не видит 401 — ему приходит уже повторённый результат.
    sessionToken = await refreshToken()
    res = await send(sessionToken)
  }
  return res
}
```

Вся обработка `401` живёт внутри транспорта. `ApiClient` — его эндпоинты, кэш и теги — ничего не знает
о ретрае: он отдаёт запрос и получает обратно успешный `Response`.

## Cache and tags work on top

Кастомный транспорт находится **ниже** слоя кэша/тегов, поэтому кэширование, TTL, теги и инвалидация
по тегам продолжают работать без изменений:

```typescript
endpoints: async (create) => ({
  // GET — кэшируется и тегируется
  getNotes: create({ request: () => ({ path: '/notes', method: 'GET' }), cache: true, tags: ['notes'] }),
  // POST — инвалидирует тег при успехе
  addNote: create({
    request: (body) => ({ path: '/notes', method: 'POST', body }),
    cache: false,
    invalidatesTags: ['notes'],
  }),
})

await client.request('getNotes', {})   // → идёт через customFetch
await client.request('getNotes', {})   // → отдаётся из кэша, customFetch НЕ вызывается
await client.request('addNote', { title: 'x' }) // → инвалидирует 'notes'
await client.request('getNotes', {})   // → снова рефетчит через customFetch
```

> **Кэш короткозамыкается выше транспорта.** Попадание в кэш вообще не доходит до `fetchFn` — вызова
> транспорта нет. `fetchFn` срабатывает только при промахе кэша или инвалидированном теге.

## No library extension needed

Обе оси контроля fetch доступны без правок `synapse-storage`:

- **Замена транспорта** (эта страница) → `baseQuery.fetchFn`, встроено.
- **Прозрачный перехват `fetch`** → собственный [ServiceWorker](./custom-fetch-service-worker.md),
  который живёт ниже клиента и не связан с его storage.

## When to use

- Нужно изменить, **как** отправляется запрос (auth, ретраи, метрики, axios, worker) → `fetchFn`.
- Нужно прозрачно перехватывать `fetch` для precache / офлайна / стратегий по URL → 
  [собственный ServiceWorker](./custom-fetch-service-worker.md), а не `fetchFn`.
- Нужен живой кросс-табный кэш ответов → [`WorkerCacheStorage`](./worker-cache-storage.md), это
  storage-бэкенд, не связанный с транспортом.
