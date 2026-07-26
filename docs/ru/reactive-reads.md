# Реактивное чтение и управляемые ререндеры

> [Назад к оглавлению](./README.md)

**TL;DR.** Меняешь хранилище обычными методами (`set`/`update`), а в компоненте читаешь его
**реактивно**. Инструментов пять, и их легко перепутать — эта страница про то, **какой выбрать**.
Быстрый ответ: по умолчанию `useStorageSubscribe` (без RxJS), нужны операторы — `useStorageObservable`
или `toObservable` + `useObservable`, нужен side-effect (тост/лог) — `useSubscription`, читаешь
`SelectorAPI` — `useSelector`. В примерах — сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Зачем

Разница между инструментами — в двух осях: **нужен ли RxJS** (операторы `debounceTime`/`scan`/…) и
**что делаем с потоком** (рендерим значение или запускаем side-effect). Ниже — выбор по этим осям.

## Что выбрать

| Инструмент | Где | RxJS | Отдаёт | Когда использовать | Страница |
|------------|-----|------|--------|--------------------|----------|
| `useStorageSubscribe` | React | нет | значение среза в рендер | **реактивное чтение по умолчанию** | [→](./use-storage-subscribe.md) |
| `useSelector` | React | нет | значение `SelectorAPI` в рендер | читаешь мемоизированный селектор | [→](./selector-system.md) |
| `useStorageObservable` | React | да | значение среза в рендер | нужен просто срез через RxJS | [→](./use-storage-observable.md) |
| `useObservable` | React | да | значение любого `Observable` в рендер | свой `pipe(...)` поверх потока/`selector.$` | [→](./use-storage-observable.md) |
| `useSubscription` | React | да | **ничего** (side-effect) | тост/лог/диспатч на каждый эмит | [→](./use-subscription.md) |
| `toObservable` | вне React | да | `Observable` | эффекты, не-React код | [→](./to-observable.md) |
| `getStateSync()` | везде | нет | значение **разово**, без ререндера | прочитать свежее в обработчике | см. ниже |

Как это укладывается в голове:

- **Не нужен RxJS, нужно значение в рендер** → `useStorageSubscribe` (из стора) или `useSelector` (из
  `SelectorAPI`). 90 % случаев.
- **Нужны RxJS-операторы** → сначала `toObservable(storage, selector)` строит поток; дальше в React его
  подписывает `useObservable` (значение в рендер) или `useSubscription` (side-effect).
  `useStorageObservable` — сахар над `toObservable` + `useObservable` для случая «просто срез без своих
  операторов».
- **Вне React** (эффекты, watcher-ы, не-React модули) → только `toObservable`.

## Прочитать без ререндера — это не хук

Частый кейс — «прочитать актуальное значение в момент клика/сабмита, не ререндеря компонент на каждое
изменение стора». Для этого **не нужен отдельный хук**: хранилище читается синхронно по требованию через
`getStateSync()`.

```typescript
// ноль подписок, ноль ререндеров — свежее значение на момент вызова
const onSave = () => {
  const { todos } = todoStorage.getStateSync()
  api.save(todos)
}
```

Если нужен ререндер только при изменении конкретного среза — это `useStorageSubscribe` с `equals`
(Concurrent-safe), а не ручной форс. Если нужны операторы (`debounceTime`, `scan`, …) —
`useStorageObservable` / `toObservable`. Отдельного «ref-хука с ручным ререндером» в API намеренно нет:
все три сценария закрыты инструментами выше.

## Когда НЕ нужно

- **Значение нужно один раз, реакция на изменения не нужна** → `getStateSync()` / `get()`, см.
  [Чтение данных](./reading-data.md). Реактивные хуки тут только плодят лишние подписки.
- **Логика вне React и без потоков** (обычный обработчик, не эффект) → низкоуровневый
  `storage.subscribe(selector, cb)`, см. [Подписки](./subscriptions.md).

## См. также

- [useStorageSubscribe](./use-storage-subscribe.md) — реактивное чтение по умолчанию.
- [useStorageObservable / useObservable](./use-storage-observable.md) — то же, но с RxJS-операторами.
- [useSubscription](./use-subscription.md) — side-effect на каждый эмит (без рендера).
- [toObservable](./to-observable.md) — поток состояния вне React (эффекты, не-React код).
- [Селекторы](./selector-system.md) — `createSelector` + `useSelector`.
- [Подписки](./subscriptions.md) — низкоуровневый `storage.subscribe`.
