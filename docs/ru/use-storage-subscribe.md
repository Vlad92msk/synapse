# useStorageSubscribe

> [Назад на главную](../../README.md)

Реактивное чтение хранилища **по умолчанию**. Под капотом `useSyncExternalStore` (Concurrent-safe), без
RxJS. Ререндерит компонент при изменении выбранного среза. См. также обзор [Реактивное
чтение](./reactive-reads.md). В примерах — сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

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

## Заметки

- `useSyncExternalStore` даёт корректную работу в Concurrent Mode (без tearing).
- Принимает `IStorageBase` — общий интерфейс sync- и async-хранилищ; подписка одинакова для всех типов.
- До инициализации можно передать `null` вместо стора — хук вернёт `undefined`.
- Нужны RxJS-операторы поверх потока? Это [useStorageObservable](./use-storage-observable.md). Читаешь
  `SelectorAPI`? Это [useSelector](./selector-system.md). Нужно прочитать без ререндера в обработчике?
  `todoStorage.getStateSync()` — см. [обзор](./reactive-reads.md).
