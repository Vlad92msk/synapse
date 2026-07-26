# useStorageSubscribe

> [Назад к оглавлению](./README.md)

**TL;DR.** `useStorageSubscribe(storage, selector[, { equals }])` — реактивное чтение хранилища в
компоненте **по умолчанию**. Под капотом `useSyncExternalStore` (Concurrent-safe), **без RxJS**.
Ререндерит компонент при изменении выбранного среза, возвращает само значение среза. Это первый выбор для
«показать значение из стора»; RxJS-операторы и side-effect'ы — соседние хуки (см. таблицу ниже). В
примерах — сквозной `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`).

## Зачем

99 % реактивных чтений — это «взять срез стора и отрендерить, обновляясь при его изменении». Для этого не
нужен ни RxJS, ни ручной `useEffect` + `useState`: `useStorageSubscribe` подписывается на хранилище через
`useSyncExternalStore`, отдаёт значение прямо в рендер и корректно работает в Concurrent Mode (без
tearing).

## Когда использовать / когда НЕ нужно

**Использовать:** нужно **значение среза стора в JSX**, обновляющееся при его изменении, без RxJS.

**НЕ нужно:**

- нужны **RxJS-операторы** поверх потока (`debounceTime`, `scan`, …) → [`useStorageObservable`](./use-storage-observable.md);
- читаешь **`SelectorAPI`** (мемоизированный селектор) → [`useSelector`](./selector-system.md);
- нужен **side-effect** на изменение (тост/лог), а не значение в рендер → [`useSubscription`](./use-subscription.md);
- нужно прочитать **разово в обработчике** без ререндера → `todoStorage.getStateSync()`, см.
  [обзор](./reactive-reads.md).

## Сигнатура

```typescript
useStorageSubscribe<S, R>(
  storage: IStorageBase<S> | null,
  selector: (state: S) => R,
  options?: { equals?: (a: R, b: R) => boolean },
): R | undefined
```

## Базовое использование

Для **примитивных** срезов дедупликация идёт автоматически через `Object.is` — лишних ререндеров нет.

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// примитивный срез — дедупликация автоматом
const filter = useStorageSubscribe(todoStorage, (s) => s.filter)
```

## Объектные и массивные срезы: `equals`

Если селектор возвращает объект/массив (новая ссылка на каждый тик) или нужно ререндерить только при
изменении конкретного среза — передавай `equals`. Он держит стабильный снапшот и гасит лишние ререндеры,
даже если остальное состояние стора поменялось.

```typescript
// постороннее изменение стора не дёргает компонент, пока `todos` не сменился по ссылке
const todos = useStorageSubscribe(todoStorage, (s) => s.todos, {
  equals: (a, b) => a === b,
})
```

`equals` возвращает `true`, когда срезы «равны» — тогда снапшот не меняется по ссылке и ререндера нет.

## Все параметры (закомментировано)

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

const todos = useStorageSubscribe(
  // 1. storage — IStorageBase (sync/async — общий интерфейс). Можно передать null
  //    (до инициализации) → хук вернёт undefined.
  todoStorage,

  // 2. selector — какой срез вытащить из состояния. Вызывается на каждом снапшоте.
  (s) => s.todos,

  // 3. options.equals? — сравнение прошлого и нового среза. true → снапшот НЕ меняется
  //    по ссылке, ререндера нет (даже если остальной стейт стора менялся). Нужен для
  //    объектных/массивных срезов; для примитивов не нужен (дедуп через Object.is).
  { equals: (a, b) => a === b },
)
```

## Опции

| Параметр | Тип | Описание |
|---|---|---|
| `storage` | `IStorageBase<S> \| null` | Хранилище или `null` до инициализации (тогда хук вернёт `undefined`). |
| `selector` | `(state: S) => R` | Срез, который читаем и на изменение которого ререндерим. |
| `options.equals?` | `(a: R, b: R) => boolean` | Мемоизация снапшота. `true` → нет ререндера. Для объектных/массивных срезов. |

## Заметки

- `useSyncExternalStore` даёт корректную работу в Concurrent Mode (без tearing).
- Принимает `IStorageBase` — общий интерфейс sync- и async-хранилищ; подписка одинакова для всех типов.
- До инициализации можно передать `null` вместо стора — хук вернёт `undefined`.

## См. также

- [useStorageObservable](./use-storage-observable.md) — то же реактивное чтение, но с RxJS-операторами.
- [useSelector](./selector-system.md) — чтение мемоизированного `SelectorAPI`.
- [useSubscription](./use-subscription.md) — side-effect на изменение (без рендера).
- [Реактивное чтение](./reactive-reads.md) — обзор и выбор инструмента.
