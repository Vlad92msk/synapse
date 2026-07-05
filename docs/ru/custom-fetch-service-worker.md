# Собственный fetch-перехватывающий ServiceWorker

> [Назад к оглавлению](./README.md)

**Собственный ServiceWorker приложения** (в стиле Workbox), который прозрачно перехватывает `fetch`
и применяет сетевые стратегии по URL: precache, офлайн-роутинг, cache-first / network-first /
stale-while-revalidate. Он живёт **ниже** `ApiClient`, который про него ничего не знает — и его
`baseQuery.fetchFn` **не** трогается.

## Когда это нужно

Свой SW нужен, когда требуется реальный контроль над **сетевым слоем**, а не просто кэш во вкладке:

- **Precache** оболочки приложения / статики, чтобы приложение стартовало без сети.
- **Офлайн-роутинг** — отдать кэшированный ответ (или синтезированный фолбэк), когда сети нет.
- **Стратегии по URL** — cache-first для неизменяемых ассетов, network-first для свежих данных,
  stale-while-revalidate для остального.

Если же нужен только **живой кэш между вкладками** — это [`WorkerCacheStorage`](./worker-cache-storage.md).
Если нужно поменять то, **как** выполняется запрос (auth-retry, метрики, axios, worker-транспорт) —
это [кастомный `baseQuery.fetchFn`](./custom-fetch-fn.md).

## Как это работает

SW — это отдельный скрипт, зарегистрированный приложением. Как только он начинает контролировать
страницу, браузер маршрутизирует **каждый** `fetch` (в том числе те, что `ApiClient` делает
внутри) через `fetch`-обработчик SW. Поскольку перехват происходит **ниже** `fetch`, запрос
по-прежнему доходит до сетевого слоя — и поэтому по-прежнему виден в DevTools → Network, с меткой
`(ServiceWorker)`.

`ApiClient` остаётся полностью обычным: обычный storage, обычный `baseQuery`, без кастомного
`fetchFn`. SW и клиент — два независимых слоя.

## Регистрация ServiceWorker

```typescript
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'

// Полностью обычный клиент — он НЕ знает, что существует ServiceWorker.
const apiClient = new ApiClient({
  storage: new MemoryStorage({ name: 'api-cache', initialState: {} }),
  baseQuery: { baseUrl: 'https://pokeapi.co/api/v2', timeout: 10000 },
  endpoints: async (create) => ({
    getPokemon: create({
      request: ({ id }) => ({ path: `/pokemon/${id}`, method: 'GET' }),
      cache: true,
    }),
  }),
})

// Отдельно регистрируем собственный SW. Это ЕДИНСТВЕННАЯ обвязка, которая ему нужна.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/custom-sw.js')
}
```

## Скрипт ServiceWorker

SW — это написанный руками статический ассет (отдаётся из `public/custom-sw.js`), который вы пишете и
поддерживаете сами — synapse его за вас не генерирует. Precache на install, stale-while-revalidate по URL,
офлайн-фолбэк:

```javascript
const CACHE = 'custom-fetch-demo-v1'
const PRECACHE_URLS = ['/', '/index.html']
const SWR_HOST = 'pokeapi.co'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE_URLS).catch(() => undefined)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.hostname === SWR_HOST) event.respondWith(staleWhileRevalidate(event.request))
})

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone())
      return res
    })
    .catch(() => null)
  if (cached) return cached // отдаём stale, ревалидируем в фоне
  return (await network) ?? offlineFallback(request)
}
```

> **Совет.** `skipWaiting()` + `clients.claim()` позволяют SW сразу начать контролировать открытые
> вкладки. Без них свежезарегистрированный SW начнёт контролировать страницу только после
> следующей перезагрузки.

## Чем это отличается от WorkerCacheStorage

Они решают **разные** задачи и действуют на **разных** слоях:

- [`WorkerCacheStorage`](./worker-cache-storage.md) — это **storage-бэкенд** для `ApiClient`. При
  попадании в кэш клиент короткозамыкается **выше** `fetch` — запроса не происходит вообще, поэтому
  строки в Network **нет**. Это живой кэш между вкладками, а не офлайн-слой.
- Собственный SW — это **сетевой перехватчик**. Он живёт **ниже** `fetch`, поэтому запрос
  по-прежнему виден в Network (с меткой `(ServiceWorker)`), и он может отдавать ответы полностью
  офлайн.

> **Внимание.** SW не связан с `ApiClient.storage`. Storage — это кэш/тег-слой клиента внутри
> вкладки; SW — платформенный сетевой перехватчик. Настройка одного не влияет на другое.

## Поведение в Network

Откуда пришёл ответ — напрямую видно в DevTools → Network:

| Источник                                 | Строка в Network            |
| ---------------------------------------- | --------------------------- |
| Попадание в кэш `WorkerCacheStorage`     | **строки нет** (fetch пропущен) |
| Кэш / офлайн собственного SW             | строка с меткой `(ServiceWorker)` |
| HTTP-кэш браузера (`Cache-Control`)      | строка с меткой `(from disk cache)` |
| Холодный сетевой запрос                  | обычная строка              |

## Когда что использовать

- **Офлайн / контроль сети** (precache, офлайн-роутинг, стратегии по URL) → свой SW, как здесь. Без
  правок библиотеки.
- **Живой кэш между вкладками** (общее состояние в воркере) → [`WorkerCacheStorage`](./worker-cache-storage.md).
- **Замена транспорта** (auth-retry, метрики, axios, worker) → [кастомный `baseQuery.fetchFn`](./custom-fetch-fn.md).
