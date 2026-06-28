# useApiQuery — React-хук для GET-запросов

> [Назад на главную](../../README.md)

Хук в стиле React Query поверх эндпоинта `ApiClient` для **чтения** данных (GET). Это тонкий слой над
`endpoint.request(params).subscribe(...)` — дедупликация, кэш по тегам, retry и отмена уже есть в
эндпоинте (см. [ApiClient](./api-client.md)). Хук добавляет React-слой: подписку, стабильный ключ
параметров, `enabled`/`refetch`, SSR-fast-path (без вспышки loading) и авто-рефетч при инвалидации кэша.

`ApiClient` самодостаточен (не зависит ни от RxJS/`reactive`, ни от `createSynapse`), поэтому можно взять
только `synapse-storage/api` + `synapse-storage/core` + эти хуки — без всего state-manager.

## Импорт

```typescript
import { useApiQuery } from 'synapse-storage/react'
```

## Использование

Хук принимает **эндпоинт** (из `getEndpoints()`), поэтому типы `params`/`data` выводятся из него.

```typescript
const endpoints = pokemonApiClient.getEndpoints()

function PokemonCard({ id }: { id: number }) {
  // GET: стартует при маунте, пере-запрашивается при смене params
  const { data, isLoading, isError, error, refetch, fromCache } = useApiQuery(endpoints.getDetails, { id })

  if (isLoading) return <Spinner />
  if (isError) return <Error message={error?.message} />

  return (
    <div>
      <h3>{data?.name}</h3>
      {fromCache && <small>из кэша</small>}
      <button onClick={refetch}>Обновить</button>
    </div>
  )
}
```

## Возвращаемое значение

`useApiQuery(endpoint, params, options?)` возвращает:

| Поле | Тип | Описание |
|------|-----|----------|
| `data` | `TData \| undefined` | Данные ответа (или из кэша) |
| `error` | `Error \| undefined` | Ошибка запроса |
| `status` | `'idle' \| 'loading' \| 'success' \| 'error'` | Текущий статус |
| `isLoading` | `boolean` | `status === 'loading'` |
| `isError` | `boolean` | `status === 'error'` |
| `isSuccess` | `boolean` | `status === 'success'` |
| `fromCache` | `boolean` | Данные пришли из кэша, а не из сети |
| `refetch` | `() => void` | Принудительный пере-запрос |

## Опции

Расширяют `QueryOptions` (`signal`, `headers`, `timeout`, `disableCache`, `retry`, …) плюс:

- **`enabled`** (по умолчанию `true`) — при `false` запрос не выполняется (lazy). Удобно, когда параметры
  ещё не готовы:

  ```typescript
  // Не выполнится, пока `id` не определён
  const { data } = useApiQuery(endpoints.getDetails, { id: id! }, { enabled: id != null })
  ```

- **`refetchOnInvalidate`** (по умолчанию `true`) — авто-рефетч активного запроса после инвалидации его
  тегов кэша мутацией (см. [авто-рефетч](#auto-refetch-on-cache-invalidation)).

## SSR: без вспышки loading после гидрации

Ленивое начальное состояние читает кэш **синхронно** через
[`endpoint.getCachedSync()`](./api-client.md#synchronous-cache-read-endpointgetcachedsync). На сервере
`useEffect` не выполняется, поэтому первый (и единственный) рендер отдаёт засеянные/кэшированные данные;
на клиенте первый рендер после [гидрации](./api-client.md#ssr-dehydrate-hydrate) сразу показывает
серверные данные, а не вспышку `loading`.

Работает только для синхронных хранилищ (`MemoryStorage`/`LocalStorage`) и эндпоинтов без влияющих на
ключ кэша заголовков. Иначе хук откатывается на обычный async-путь.

## Авто-рефетч при инвалидации кэша

Когда мутация успешно отрабатывает с `invalidatesTags`, соответствующие записи кэша удаляются и эмитится
событие инвалидации. Активный `useApiQuery`, чьи `tags` эндпоинта пересекаются с инвалидированными,
**пере-запрашивается автоматически** (паритет с React Query — запрос «оживает», а не ждёт истечения TTL).
Под капотом используется
[`endpoint.onCacheInvalidate()`](./api-client.md#cache-invalidation-bus-endpointoncacheinvalidate).
Отключается через `refetchOnInvalidate: false`.

```typescript
// эндпоинт getList: tags: ['PokemonList']
const list = useApiQuery(endpoints.getList, { limit: 12 })

// где-то ещё — мутация с invalidatesTags: ['PokemonList']
// → `list` рефетчится сам
```

## Заметки

- **Стабильный ключ params.** Параметры сериализуются с сортировкой ключей, поэтому новый объект
  `{ id: 1 }` на каждый рендер **не** вызывает бесконечный пере-запрос.
- **Безопасно в StrictMode.** Эффект отменяет in-flight запрос при очистке.
- **Идентичность `params` не важна.** Можно передавать inline-объект — пере-запрос определяется только
  сериализованным ключом.

## Смотрите также

- [ApiClient](./api-client.md) — нативный клиент, эндпоинты, кэширование и SSR.
- [useApiMutation](./api-use-mutation.md) — парный хук для записи.
