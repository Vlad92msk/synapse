# useCreateStorage (localStorage)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HookLocalStorageExample.tsx)

**TL;DR.** Тот же [`useCreateStorage`](./hook-memory.md), только `type: 'localStorage'` — данные
переживают перезагрузку страницы. Единственное отличие от memory-варианта в коде — поле `type`;
всё остальное (возвращаемый объект, опции жизненного цикла, `useStorageSubscribe`) идентично.

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

## Зачем

Состояние экрана (черновик, выбранный фильтр, локальные настройки) должно пережить перезагрузку,
но заводить ради этого глобальный модульный стор — избыточно. `useCreateStorage` c
`type: 'localStorage'` даёт **компонентный** стор, синхронный (`ISyncStorage`), с автоматической
персистентностью в `localStorage` и без ручного `initialize()`/`destroy()`.

## Когда использовать

- Состояние компонента/экрана должно **пережить перезагрузку** (черновик, фильтр, настройки),
  но глобальный модульный стор заводить не хочется.
- Данные небольшие и **синхронные** (лимит `localStorage` ~5 МБ; всё сериализуется в строку).

## Когда НЕ нужно

- Состояние эфемерное (не переживает перезагрузку) → [memory-вариант](./hook-memory.md).
- **Большие** данные или бинарь, нужна асинхронность → [IndexedDB-вариант](./hook-indexeddb.md).
- Нужен **глобальный** персистентный стор на уровне модуля → [LocalStorage](./local-storage.md)
  напрямую или через [createSynapse](./create-synapse-basic.md).
- Стор рендерится на **сервере** (SSR/SSG) — `localStorage` там нет; для модульного стора
  оборачивайте в [`browserStorage`](./browser-storage.md).

## Использование

Copy-paste минимальная форма:

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady } = useCreateStorage<TodoState>({
    type: 'localStorage',         // <- единственное отличие от memory
    name: 'todo-hook-local',
    initialState: initialTodoState,
  })

  if (!isReady) return <div>Loading…</div>

  // Чтение и запись — как с memory (storage: ISyncStorage<TodoState>)
  const todos = useStorageSubscribe(storage, (s) => s.todos)
  storage.set('filter', 'completed')
}
```

## Все параметры (закомментировано)

Отличается от [memory](./hook-memory.md) только `type` и дефолтом `destroyOnUnmount`; здесь ещё
доступны `version`/`migrate` (персист реальный):

```typescript
const result = useCreateStorage<TodoState>(
  {
    type: 'localStorage',      // тип задаёт вариант хука
    name: 'todo-hook-local',   // ключ в localStorage
    initialState: initialTodoState, // из него выводится TState
    version: 2,                // версия схемы персиста (см. Persist-миграции). Опционально.
    migrate: (old, from) => (from < 1 ? { ...old } : old), // апгрейд старых данных под текущую схему
    // middlewares — конфигуратор middleware стора (см. Middlewares).
  },
  {
    autoInitialize: true,      // авто-initialize() при монтировании. По умолчанию true.
    destroyOnUnmount: true,    // destroy() при размонтировании. По умолчанию true для localStorage.
                               //   NB: destroy() эфемерного стора чистит только инстанс; данные в
                               //   localStorage контролирует clearOnDestroy адаптера (по умолчанию
                               //   для localStorage — не чистить). См. LocalStorage.
  },
)
// Возвращаемый объект идентичен memory-варианту (storage: ISyncStorage<TodoState> | null и т.д.).
```

## Опции жизненного цикла

| Поле | Тип | По умолчанию | Описание |
|---|---|---|---|
| `autoInitialize` | `boolean` | `true` | Автоматически звать `initialize()` при монтировании. |
| `destroyOnUnmount` | `boolean` | `true` | Уничтожать инстанс хранилища при размонтировании. |

## См. также

- [useCreateStorage (memory)](./hook-memory.md) — базовое описание хука и возвращаемого объекта.
- [useCreateStorage (indexedDB)](./hook-indexeddb.md) — для больших/асинхронных данных.
- [LocalStorage](./local-storage.md) — то же хранилище на уровне модуля (глобальный вариант).
- [Persist-миграции](./persist-migration.md) — `version`/`migrate`.
- [browserStorage](./browser-storage.md) — SSR-safe обёртка для модульного `LocalStorage`.
