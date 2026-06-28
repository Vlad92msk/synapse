# useStorageObservable

> [Назад на главную](../../README.md)

RxJS-путь «store → реактивно в компоненте». Эквивалент [useStorageSubscribe](./use-storage-subscribe.md),
но поверх потока состояния можно навесить RxJS-операторы (`debounceTime`, `scan`, `map`, …). См. обзор
[Реактивное чтение](./reactive-reads.md). В примерах — сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Базовое использование

```typescript
import { useStorageObservable } from 'synapse-storage/react'

// всё состояние
const state = useStorageObservable(todoStorage)

// срез — эмитит только при изменении среза (distinctUntilChanged)
const total = useStorageObservable(todoStorage, (s) => s.todos.length)
```

Внутри — мемоизирующая обёртка над [`toObservable`](./to-observable.md) + `useObservable`. Observable
мемоизируется по `[storage]`, поэтому хук **не** переподписывается на каждый рендер. Это убирает footgun
инлайнового `toObservable(storage)` прямо в рендере (новый Observable каждый рендер → лишние
переподписки).

## Операторы поверх потока

Если нужна цепочка операторов с состоянием (`debounceTime`, `scan`), собери поток через `toObservable` и
подпишись `useObservable` с фабрикой — так подписка стабильна, а цепочка пересобирается только по `deps`:

```typescript
import { useObservable } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { debounceTime, map } from 'rxjs/operators'

const debouncedCount = useObservable(
  () => toObservable(todoStorage, (s) => s.todos.length).pipe(debounceTime(200), map((n) => `${n} задач`)),
  '0 задач',
  [todoStorage],
)
```

> `useStorageObservable` возвращает уже **готовое значение**, а не `Observable`, — навесить на него
> `.pipe(...)` нельзя. Если нужны операторы, строй поток через `toObservable` (как выше). Главное — не
> вызывай `toObservable(...)` прямо в теле рендера без мемоизации: это создаёт новый `Observable` на
> каждый рендер → переподписка и сброс состояния `debounceTime`/`scan`. Фабрика + `deps` в `useObservable`
> как раз держат подписку стабильной.

## Заметки

- Селекторный поток уже прогоняется через `distinctUntilChanged` — внешний `distinctUntilChanged` после
  селектора почти всегда избыточен.
- Нужно реактивное чтение без RxJS? Бери [useStorageSubscribe](./use-storage-subscribe.md).
