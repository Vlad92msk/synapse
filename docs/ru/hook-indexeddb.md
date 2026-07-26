# useCreateStorage (indexedDB)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HookIndexedDBExample.tsx)

**TL;DR.** Тот же [`useCreateStorage`](./hook-memory.md) с `type: 'indexedDB'` — компонентный
стор для **больших / персистентных** данных. Возвращает `IAsyncStorage` (запись возвращает
`Promise`). Отличия от sync-вариантов: асинхронная инициализация и **`destroyOnUnmount` по
умолчанию `false`** (персистентное хранилище обычно не стирают при размонтировании).

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

## Зачем

Когда компонентному стору нужна персистентность **и** объём больше лимита `localStorage` (~5 МБ),
либо структурированные/бинарные данные. `useCreateStorage` c `type: 'indexedDB'` берёт на себя
асинхронную инициализацию БД и жизненный цикл; читать при этом можно синхронно из кеша через
`useStorageSubscribe`, а запись (`set`/`update`) идёт асинхронно, но `await` в обработчиках не
обязателен.

## Когда использовать

- Компонентному стору нужна **персистентность и/или большие объёмы** данных.
- Данные структурированные, не влезают в `localStorage`, или нужна асинхронная запись.

## Когда НЕ нужно

- Маленькое персистентное состояние без асинхронности → [localStorage-вариант](./hook-local-storage.md)
  (проще, синхронный).
- Эфемерное состояние → [memory-вариант](./hook-memory.md).
- Нужен **глобальный** IndexedDB-стор → [IndexedDB](./indexeddb-storage.md) на уровне модуля.
- Стор должен **синхронно рендериться на сервере** — у async-хранилища нет sync-оболочки
  (см. [createSynapseCtx](./synapse-ctx.md), раздел про async-сторы).

## Использование

Copy-paste минимальная форма:

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady } = useCreateStorage<TodoState>({
    type: 'indexedDB',
    name: 'todo-hook-idb',
    initialState: initialTodoState,
  })
  // storage: IAsyncStorage<TodoState> | null

  if (!isReady) return <div>Loading…</div>

  // useStorageSubscribe читает состояние синхронно из кеша — идентично sync-хранилищам
  const todos = useStorageSubscribe(storage, (s) => s.todos)

  // set/update возвращают Promise, но await в обработчиках не обязателен
  storage.update((s) => { s.filter = 'active' })
}
```

## Все параметры (закомментировано)

Отличия от sync-вариантов: `options.dbName`, async-возврат `storage`, и дефолт
`destroyOnUnmount: false`:

```typescript
const result = useCreateStorage<TodoState>(
  {
    type: 'indexedDB',         // тип задаёт вариант хука → IAsyncStorage
    name: 'todo-hook-idb',     // имя object store
    initialState: initialTodoState, // из него выводится TState
    version: 2,                // версия схемы персиста (см. Persist-миграции). Опционально.
    migrate: (old, from) => old, // апгрейд старых данных под текущую схему
    options: { dbName: 'my-app-db' }, // имя БД IndexedDB (объединяет несколько сторов в одну базу)
    // middlewares — конфигуратор async-middleware стора (см. Middlewares).
  },
  {
    autoInitialize: true,      // авто-initialize() при монтировании. По умолчанию true.
    destroyOnUnmount: false,   // ДЕФОЛТ false для indexedDB (персистентный стор не стирают при
                               //   размонтировании). Передайте true, чтобы уничтожать явно.
  },
)
// Возвращаемый объект как у memory-варианта, но storage: IAsyncStorage<TodoState> | null.
```

Чтобы уничтожать стор при размонтировании, передайте опцию явно:

```typescript
useCreateStorage<TodoState>(
  { type: 'indexedDB', name: 'todo-hook-idb', initialState: initialTodoState },
  { destroyOnUnmount: true },
)
```

## Опции жизненного цикла

| Поле | Тип | По умолчанию | Описание |
|---|---|---|---|
| `autoInitialize` | `boolean` | `true` | Автоматически звать `initialize()` при монтировании. |
| `destroyOnUnmount` | `boolean` | **`false`** | Уничтожать хранилище при размонтировании. Для IndexedDB по умолчанию выключено. |

## См. также

- [useCreateStorage (memory)](./hook-memory.md) — базовое описание хука и возвращаемого объекта.
- [useCreateStorage (localStorage)](./hook-local-storage.md) — для маленьких синхронных данных.
- [IndexedDB](./indexeddb-storage.md) — то же хранилище на уровне модуля (глобальный вариант).
- [Persist-миграции](./persist-migration.md) — `version`/`migrate`.
