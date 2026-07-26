# useApiMutation — React-хук для мутаций

> [Назад к оглавлению](./README.md)

**TL;DR:** `useApiMutation(endpoint, options?)` — хук записи (POST/PUT/DELETE/PATCH). Не стартует сам;
запускается через `mutate` (fire-and-forget) или `mutateAsync` (await + пробрасывает ошибку). При успехе
`invalidatesTags` эндпоинта сами рефетчат связанные `useApiQuery`.

React-хук поверх эндпоинта `ApiClient` для **записи** (POST/PUT/DELETE/PATCH). В отличие от
[useApiQuery](./api-use-query.md), запрос **не** стартует автоматически — его запускают `mutate`/
`mutateAsync`. Мутации не кэшируются (по REST-методу), а их `invalidatesTags` инвалидируют кэш — активные
`useApiQuery` соседних эндпоинтов рефетчатся сами через
[шину инвалидации](./api-client.md#шина-инвалидации-кэша-endpointoncacheinvalidate).

## Когда использовать / когда НЕ нужно

- **Используйте** для любой записи из React-компонента, когда нужны `isLoading`/`isError`-состояния
  кнопки и автоматическая инвалидация связанных запросов после успеха.
- **НЕ нужно** для чтения (GET) — там [useApiQuery](./api-use-query.md).
- **НЕ нужно** вне React или в эффектах — вызывайте `endpoint.request(...)` напрямую
  (см. [ApiClient](./api-client.md)).

## Импорт

```typescript
import { useApiMutation } from 'synapse-storage/react'
```

## Использование

```typescript
const endpoints = pokemonApiClient.getEndpoints()

function CreatePokemon() {
  const { mutate, isLoading, isError, error } = useApiMutation(endpoints.createPokemon)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutate({ name: 'Pikachu' }) // fire-and-forget
      }}
    >
      <button disabled={isLoading}>Создать</button>
      {isError && <Error message={error?.message} />}
    </form>
  )
}
```

## Возвращаемое значение

`useApiMutation(endpoint, options?)` возвращает:

| Поле | Тип | Описание |
|------|-----|----------|
| `mutate` | `(params) => void` | Запустить мутацию; ошибки **не** пробрасываются (смотри `error`/`isError`) |
| `mutateAsync` | `(params) => Promise<QueryResult>` | Запустить и дождаться; **реджектится** на ошибке |
| `data` | `TData \| undefined` | Данные успешного ответа |
| `error` | `Error \| undefined` | Ошибка мутации |
| `status` | `'idle' \| 'loading' \| 'success' \| 'error'` | Текущий статус |
| `isLoading` | `boolean` | `status === 'loading'` |
| `isError` | `boolean` | `status === 'error'` |
| `isSuccess` | `boolean` | `status === 'success'` |
| `reset` | `() => void` | Сбросить состояние к `idle` |

`options` — это `QueryOptions` эндпоинта (у мутации нет `enabled`/`refetchOnInvalidate`, т.к. запускается вручную):

```typescript
useApiMutation(endpoints.createPokemon, {
  timeout: 8000,             // таймаут мутации (мс)
  signal: controller.signal, // внешняя отмена (хук и так отменяет при unmount)
  headers: new Headers(),    // доп. заголовки
  context: { source: 'ui' }, // прокидывается в baseQuery.prepareHeaders
  retry: { count: 1 },       // повторы для этой мутации
  // disableCache здесь не важен: мутации не кэшируются в принципе
})
```

## mutate vs mutateAsync

- **`mutate(params)`** — fire-and-forget. Reject проглатывается (состояние уже отражает ошибку), поэтому
  `.catch` не нужен. Подходит для простых сабмитов формы.
- **`mutateAsync(params)`** — возвращает промис и **пробрасывает** ошибку, поэтому можно `await` и ветвить
  логику:

  ```typescript
  const { mutateAsync } = useApiMutation(endpoints.createPokemon)

  async function onSubmit(values) {
    try {
      const res = await mutateAsync(values)
      navigate(`/pokemon/${res.data!.id}`)
    } catch (err) {
      toast.error(String(err))
    }
  }
  ```

## Инвалидация связанных запросов

Задайте эндпоинту мутации `invalidatesTags`; любой `useApiQuery`, чьи `tags` эндпоинта пересекаются,
рефетчится автоматически. Ручная возня с кэшем не нужна.

```typescript
// конфиг эндпоинта
createPokemon: create({
  request: (body) => ({ path: '/pokemon', method: 'POST', body }),
  invalidatesTags: ['PokemonList'],
})

// у эндпоинта getList tags: ['PokemonList']
// → после успешного createPokemon активный useApiQuery(getList) рефетчится
```

## Заметки

- **Безопасно в StrictMode.** При размонтировании in-flight запрос отменяется, обновления состояния
  пропускаются.
- Мутации никогда не пишутся в кэш (кэшируется только GET), поэтому здесь нет `fromCache`.

## Смотрите также

- [useApiQuery](./api-use-query.md) — парный хук для чтения.
- [ApiClient](./api-client.md) — кэширование, теги и шина инвалидации.
