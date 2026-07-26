# useCreateStorage (memory)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HookExample.tsx)

**TL;DR.** `useCreateStorage({ type: 'memory', name, initialState })` — React-хук, который
**создаёт хранилище прямо внутри компонента** и уничтожает его при размонтировании. Жизненный
цикл стора = жизненный цикл компонента; не нужно держать стор на уровне модуля и вручную звать
`initialize()`/`destroy()`.

Это memory-вариант (эфемерный, in-memory). Тот же хук с другим `type` даёт персистентность:
[`localStorage`](./hook-local-storage.md) и [`indexedDB`](./hook-indexeddb.md).

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

## Зачем

Обычный [`MemoryStorage`](./memory-storage.md) живёт на уровне модуля — один инстанс на всё
приложение, переживает любые перемонтирования. Но иногда стор нужен **только внутри конкретного
экрана** и должен исчезать вместе с ним (чтобы не копить состояние закрытых компонентов и не
шарить его между инстансами). Делать это руками — завести стор в `useState`, вызвать
`initialize()` в `useEffect`, `destroy()` в cleanup, следить за StrictMode-двойным-эффектом —
шумно и легко ошибиться. `useCreateStorage` инкапсулирует весь этот жизненный цикл.

## Когда использовать

- Стор нужен **только внутри компонента/экрана** и должен исчезать вместе с ним.
- Не хочется ручного `initialize()` / `destroy()` в `useEffect`.
- Нужно несколько **независимых** инстансов одного стора (по одному на смонтированный компонент).

## Когда НЕ нужно

- Стор должен быть **глобальным** и переживать размонтирование → создавайте его на уровне модуля
  ([MemoryStorage](./memory-storage.md)) или через [createSynapse](./create-synapse-basic.md).
- Нужны **selectors / dispatcher / effects** (полноценный модуль) → это [createSynapse](./create-synapse-basic.md)
  + [createSynapseCtx](./synapse-ctx.md) или [awaitSynapse](./await-synapse.md), а не голый хук-хранилище.
- Состояние должно **пережить перезагрузку** → [localStorage](./hook-local-storage.md) /
  [indexedDB](./hook-indexeddb.md)-вариант.

## Использование

Copy-paste минимальная форма:

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<TodoState>({
    type: 'memory',
    name: 'todo-hook-memory',
    initialState: initialTodoState,
  })

  // storage: ISyncStorage<TodoState> | null (не null только при isReady)
  if (isLoading) return <div>Loading…</div>
  if (hasError) return <div>Error: {status.error?.message}</div>
  if (!isReady) return <div>Initializing…</div>

  // После isReady storage гарантированно не null
  storage.set('filter', 'active')
}
```

### Чтение состояния — useStorageSubscribe

```typescript
// Подписка на всё состояние или на отдельные поля (ререндер только при изменении результата)
const state = useStorageSubscribe(storage, (s) => s)
const filter = useStorageSubscribe(storage, (s) => s.filter)
const activeCount = useStorageSubscribe(storage, (s) => s.todos.filter((t) => !t.done).length)
```

`useStorageSubscribe` принимает `storage | null`, поэтому его можно вызывать **до** готовности —
вернёт `undefined`. Подробнее — [Подписки](./subscriptions.md).

## Все параметры (закомментировано)

Вся поверхность хука разом — конфиг (аргумент 1) и опции жизненного цикла (аргумент 2):

```typescript
const result = useCreateStorage<TodoState>(
  // ── Аргумент 1: конфиг хранилища (UniversalStorageConfig) ──────────────────
  {
    type: 'memory',            // 'memory' | 'localStorage' | 'indexedDB' — тип задаёт вариант хука
    name: 'todo-hook-memory',  // уникальное имя хранилища
    initialState: initialTodoState, // начальное состояние; из него выводится TState
    // version / migrate — persist-миграции; для 'memory' игнорируются (нечего персистить).
    // middlewares — конфигуратор middleware стора (см. Middlewares).
  },
  // ── Аргумент 2: опции жизненного цикла (необязательно) ─────────────────────
  {
    autoInitialize: true,      // авто-initialize() при монтировании. По умолчанию true.
                               //   false → инициализируйте вручную вызовом result.initialize().
    destroyOnUnmount: true,    // destroy() при размонтировании. По умолчанию: true для memory/local,
                               //   false для indexedDB (персистентное хранилище не стирают).
  },
)

// Возвращаемый объект (discriminated union по isReady):
// storage:    ISyncStorage<TodoState> | null — не null только когда isReady === true
// isReady:    boolean — storage создан и инициализирован
// isLoading:  boolean — идёт инициализация
// hasError:   boolean — инициализация упала
// status:     { status, error? } — сырой статус (status.error?.message)
// initialize: () => Promise<void> — ручной запуск (при autoInitialize: false)
// destroy:    () => Promise<void> — ручное уничтожение
```

## Опции жизненного цикла

| Поле | Тип | По умолчанию | Описание |
|---|---|---|---|
| `autoInitialize` | `boolean` | `true` | Автоматически звать `initialize()` при монтировании. |
| `destroyOnUnmount` | `boolean` | `true` (memory/local), `false` (idb) | Уничтожать хранилище при размонтировании. |

## См. также

- [MemoryStorage](./memory-storage.md) — то же хранилище на уровне модуля (глобальный вариант).
- [useCreateStorage (localStorage)](./hook-local-storage.md) · [(indexedDB)](./hook-indexeddb.md) — тот же хук с персистентностью.
- [Подписки](./subscriptions.md) — `useStorageSubscribe` и реактивное чтение.
- [createSynapse](./create-synapse-basic.md) — когда нужен полноценный модуль (selectors/dispatcher/effects).
