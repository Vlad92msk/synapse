# Pokémon SSR — серверный рендер + клиентская пагинация

> [Назад на главную](../../README.md)

Практический рецепт: запросить **первую страницу на сервере**, перенести кэш на клиент, отрисовать без
вспышки loading, а **пагинацию продолжить уже на клиенте** от этих данных. Построен на том же Pokémon API,
что и страницы [ApiClient](./api-client.md) и [useApiQuery](./api-use-query.md).

`ApiClient` server-safe: сетевой слой работает на глобальном `fetch` (настраивается через `fetchFn`), а
все обращения к `window`/`document`/`localStorage` спрятаны за `typeof ... !== 'undefined'`. На сервере
используйте `MemoryStorage`; на клиенте подойдёт любой стор (синхронный — `Memory`/`LocalStorage` — даёт
мгновенный первый рендер).

## Идея

Ключ кэша — это **имя эндпоинта + параметры**, поэтому каждая страница (`offset`) — отдельная запись кэша:

- `offset: 0` запросили на сервере → она в кэше → первый рендер на клиенте мгновенный;
- `offset: 12` не запрашивали → cache miss → обычный сетевой запрос **на клиенте**;
- вернулись к `offset: 0` (пока жив TTL) → снова мгновенно из кэша.

## Общая фабрика API

Используйте **фабрику** (по свежему инстансу на каждый серверный запрос — нельзя делить один клиент между
запросами). `storage` тоже фабрика, чтобы каждый `init()` получал чистый стор.

```typescript
// pokemon.api.ts
import { ApiClient } from 'synapse-storage/api'
import { MemoryStorage } from 'synapse-storage/core'

interface PokemonListApiResponse {
  count: number
  next: string | null
  results: Array<{ name: string; url: string }>
}

export function createPokemonApi() {
  return new ApiClient({
    storage: () => new MemoryStorage<Record<string, any>>({ name: 'pokemon-api-cache', initialState: {} }),
    baseQuery: { baseUrl: 'https://pokeapi.co/api/v2', timeout: 10000 },
    cache: { ttl: 120000 },
    endpoints: async (create) => ({
      getList: create<{ limit: number; offset: number }, PokemonListApiResponse>({
        request: (params) => ({ path: '/pokemon', method: 'GET', query: params }),
        tags: ['pokemon-list'],
      }),
    }),
  })
}

export type PokemonApiEndpoints = ReturnType<ReturnType<typeof createPokemonApi>['getEndpoints']>
```

## Сервер: прогрев кэша и дегидрация

```tsx
// server.tsx
import { renderToString } from 'react-dom/server'
import { createPokemonApi } from './pokemon.api'
import { App } from './App'

const PAGE_SIZE = 12

export async function renderApp() {
  const api = createPokemonApi() // инстанс на конкретный запрос
  await api.init()

  // Прогреваем кэш первой страницей
  await api.request('getList', { limit: PAGE_SIZE, offset: 0 })

  // Рендер: useApiQuery читает кэш синхронно → данные попадают в HTML
  const html = renderToString(<App endpoints={api.getEndpoints()} />)

  // Снимок кэша для клиента
  const state = await api.dehydrate()
  await api.destroy()

  return { html, state }
}

// В HTML-шаблоне встройте снапшот:
//   <script>window.__POKEMON_API_STATE__ = ${JSON.stringify(state)}</script>
```

## Клиент: гидрация и рендер

```tsx
// client.tsx
import { hydrateRoot } from 'react-dom/client'
import { createPokemonApi } from './pokemon.api'
import { App } from './App'

async function bootstrap() {
  const api = createPokemonApi()
  await api.hydrate(window.__POKEMON_API_STATE__) // ДО init → засевает кэш
  await api.init()

  hydrateRoot(document.getElementById('root')!, <App endpoints={api.getEndpoints()} />)
}

bootstrap()
```

## Компонент: первая страница из кэша, пагинация на клиенте

```tsx
// App.tsx
import { useState } from 'react'
import { useApiQuery } from 'synapse-storage/react'
import type { PokemonApiEndpoints } from './pokemon.api'

const PAGE_SIZE = 12

export function App({ endpoints }: { endpoints: PokemonApiEndpoints }) {
  const [offset, setOffset] = useState(0)

  // offset=0 → мгновенно из гидрированного кэша (без вспышки loading).
  // offset=12 → cache miss → сетевой запрос на клиенте.
  const { data, isLoading, fromCache } = useApiQuery(endpoints.getList, { limit: PAGE_SIZE, offset })

  const items = data?.results ?? []
  const hasMore = !!data?.next

  return (
    <div>
      <ul>{items.map((p) => <li key={p.name}>{p.name}</li>)}</ul>

      {isLoading && <span>Загрузка…</span>}
      {fromCache && <small>из кэша</small>}

      <button disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>Назад</button>
      <button disabled={!hasMore} onClick={() => setOffset((o) => o + PAGE_SIZE)}>Дальше</button>
    </div>
  )
}
```

Первая страница рендерится одинаково на сервере и на первом клиентском пейнте (поэтому React-гидрация
совпадает — без warning о mismatch). Клик **Дальше** меняет `offset` — это новый ключ кэша → клиент грузит
следующую страницу; **Назад** возвращает к ещё закэшированной странице → мгновенно.

## Прогрев нескольких страниц

Прогрейте на сервере не одну страницу — все попадут в снапшот:

```typescript
await Promise.all([
  api.request('getList', { limit: PAGE_SIZE, offset: 0 }),
  api.request('getList', { limit: PAGE_SIZE, offset: PAGE_SIZE }),
])
```

Теперь `offset: 0` **и** `offset: 12` мгновенные на клиенте.

## Подводные камни

- **Без вспышки loading нужен sync-стор на клиенте.** Мгновенный первый рендер `useApiQuery` использует
  [`getCachedSync()`](./api-client.md#synchronous-cache-read-endpointgetcachedsync), а он работает только
  на `MemoryStorage`/`LocalStorage`. С `IndexedDB` данные тоже придут из кэша, но через один async-тик
  (короткий `loading`).
- **Стабильность ключа сервер ↔ клиент.** Ключ включает `cacheableHeaderKeys`. Если влияющий на кэш
  заголовок (например, auth) на сервере и клиенте различается, ключи разойдутся и гидрация «не попадёт».
  Исключайте такие заголовки для SSR-эндпоинтов через `excludeCacheableHeaderKeys`.
- **Один инстанс на запрос на сервере.** Никогда не делите один клиент между запросами — используйте
  фабрику, чтобы у каждого запроса был свой кэш.

## Next.js (App Router)

Логика та же: на сервере (Server Component или route handler) создаёте api с `MemoryStorage`, вызываете
`request()` для прогрева, затем `dehydrate()`. Снапшот прокидываете в Client Component, который вызывает
`hydrate()` **до** `init()` и рендерит хуки. (`dehydrate`/`hydrate` не зависят от React, поэтому их можно
звать из `'server only'`-кода — по аналогии с `dehydrateModule` для синапс-модулей.)

## Смотрите также

- [ApiClient](./api-client.md) — `dehydrate()`/`hydrate()`, `getCachedSync()`, кэширование и теги.
- [useApiQuery](./api-use-query.md) — хук, который здесь используется.
- [useApiMutation](./api-use-mutation.md) — запись + инвалидация кэша.
