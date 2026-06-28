# Реактивное чтение и управляемые ререндеры

> [Назад на главную](../../README.md)

Повседневный паттерн: меняешь хранилище обычными методами (`set`/`update`), а в компоненте читаешь его
**реактивно**. Synapse даёт для этого несколько хуков — разница между ними в том, **насколько ты
контролируешь ререндеры** и нужен ли тебе RxJS. Это обзорная страница: выбери подходящий инструмент по
таблице, детали — на отдельных страницах. В примерах используется сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Какой инструмент когда

| Инструмент | Ререндеры | RxJS | Когда использовать | Страница |
|------------|-----------|------|--------------------|----------|
| `useStorageSubscribe` | на каждое изменение среза | нет | реактивное чтение по умолчанию | [useStorageSubscribe](./use-storage-subscribe.md) |
| `useSelector` | на каждое изменение среза | нет | чтение `SelectorAPI` | [Селекторы](./selector-system.md) |
| `useStorageObservable` | на каждое изменение среза | да | нужны RxJS-операторы | [useStorageObservable](./use-storage-observable.md) |
| `toObservable` | — (вне React) | да | эффекты и не-React код | [toObservable](./to-observable.md) |
| `getStateSync()` | **нет** | нет | прочитать свежее по требованию в обработчике | см. ниже |

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
(Concurrent-safe), а не ручной форс. Если нужны операторы (`debounceTime`, `scan`, …) — это
`useStorageObservable` / `toObservable`. Отдельного «ref-хука с ручным ререндером» в API намеренно нет:
все три сценария закрыты инструментами выше.

## Куда дальше

- [useStorageSubscribe](./use-storage-subscribe.md) — реактивное чтение по умолчанию.
- [useStorageObservable](./use-storage-observable.md) — то же, но с RxJS-операторами.
- [toObservable](./to-observable.md) — поток состояния вне React (эффекты, не-React код).
- [Селекторы](./selector-system.md) — `createSelector` + `useSelector`.
