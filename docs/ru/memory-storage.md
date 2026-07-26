# MemoryStorage

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/MemoryStorageExample.tsx)

**TL;DR:** in-memory хранилище с синхронным API. Данные живут, пока открыта страница; после перезагрузки — чистый `initialState`. Базовый выбор по умолчанию.

## Зачем

Простейший стор без персистентности: состояние держится в оперативной памяти, все чтения/записи синхронны (без `await`). Работает и на сервере — из `initialState` синхронно поднимается «пустой» стор, поэтому SSR/SSG не падает.

Все примеры раздела State Manager построены на одном сквозном домене — todo-list. Это канонический стор, который дальше переиспользуется в разделах «Работа с данными» и «Паттерны».

## Когда использовать

- Эфемерное UI-состояние: фильтры, формы, состояние модалок, выбранные элементы.
- Состояние, которое **не должно** переживать перезагрузку страницы.
- Базовый выбор по умолчанию — если персистентность не нужна.

## Когда НЕ нужно

- Данные должны переживать перезагрузку → [LocalStorage](./local-storage.md) (мелочи) или [IndexedDB](./indexeddb-storage.md) (большие объёмы).
- Большие/бинарные данные → [IndexedDB](./indexeddb-storage.md).
- Нужна синхронизация между вкладками поверх персистентности → см. [browserStorage](./browser-storage.md) + `syncBroadcastMiddleware`.

## Чем отличается от соседних хранилищ

| | API | Сервер | После перезагрузки |
|---|---|---|---|
| **MemoryStorage** | sync | работает (пустой из `initialState`) | данные теряются |
| [LocalStorage](./local-storage.md) | sync | падает без `localStorage` (нужен [browserStorage](./browser-storage.md)) | сохраняются (~5 МБ) |
| [IndexedDB](./indexeddb-storage.md) | **async** | нет sync-конструкции | сохраняются (большие объёмы) |

## Домен

```typescript
export interface Todo {
  id: string
  title: string
  done: boolean
}

export type Filter = 'all' | 'active' | 'completed'

export interface TodoState {
  todos: Todo[]
  filter: Filter
}

export const initialTodoState: TodoState = {
  todos: [
    { id: 't1', title: 'Изучить Synapse', done: true },
    { id: 't2', title: 'Собрать todo-приложение', done: false },
  ],
  filter: 'all',
}
```

## Использование

Copy-paste минимальная форма:

```typescript
import { MemoryStorage } from 'synapse-storage/core'

// Через new
export const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: initialTodoState,
})

// Или через статический .create() — полный эквивалент new
const todoStorage = MemoryStorage.create<TodoState>({
  name: 'todo',
  initialState: initialTodoState,
})

// Инициализация обязательна перед использованием
await todoStorage.initialize()
```

## Все параметры (закомментировано)

`MemoryStorage` принимает `SyncStorageConfig<T>`. `TState` выводится из `initialState` — ручной дженерик нужен, только если хочется зафиксировать тип явно.

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  // name — обязательное. Идентификатор стора (в логах, singleton-ключе, событиях).
  name: 'todo',

  // initialState — начальное состояние. Из него выводится TState и строится «пустой» стор
  //   на сервере. Для memory используется как есть при каждом старте.
  initialState: initialTodoState,

  // version / migrate — ИГНОРИРУЮТСЯ для memory (нечего персистить). Актуальны для
  //   LocalStorage/IndexedDB — см. Persist-миграции.

  // clearOnDestroy? — очищать ли данные при destroy(). Для memory по умолчанию true
  //   (эфемерное хранилище). Обычно менять не нужно.
  clearOnDestroy: true,

  // middlewares? — конвейер sync-middleware. Аргумент getDefault даёт встроенные:
  //   batching / shallowCompare / logger. Можно добавить и свои (напр. syncBroadcastMiddleware).
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),           // не уведомлять подписчиков, если значение не изменилось
    getDefault().logger({ collapsed: true }), // dev-логгер пишущих действий
  ],

  // singleton? — вернуть ОДИН экземпляр для одинакового name/key вместо нового стора.
  singleton: {
    enabled: true,                    // включить singleton (по умолчанию false)
    // mergeStrategy — как разрешать конфликт конфигов у экземпляров с тем же именем
    //   (FIRST_WINS по умолчанию; STRICT / DEEP_MERGE / OVERRIDE).
    // warnOnConflict — предупреждать в консоли о расхождениях конфигов (по умолчанию true).
    // key — кастомный ключ идентификации (по умолчанию `${type}_${name}`).
  },
})
```

| Поле | Тип | Описание |
|---|---|---|
| `name` | `string` | **Обязательно.** Идентификатор стора. |
| `initialState?` | `T` | Начальное состояние; из него выводится `TState`. |
| `middlewares?` | `(getDefault) => SyncMiddleware[]` | Конвейер sync-middleware. |
| `singleton?` | `SingletonOptions` | Один экземпляр на `name`/`key`. |
| `clearOnDestroy?` | `boolean` | Чистить данные при `destroy()` (memory: `true`). |
| `version?` / `migrate?` | `number` / `MigrateFn` | Игнорируются для memory. |

## Работа с данными

Чтение, запись, подписки и селекторы одинаковы для всех синхронных хранилищ и разобраны в разделе «Работа с данными»:

- [Чтение данных](./reading-data.md) — `get`, `getState`, `getStateSync`
- [Запись данных](./writing-data.md) — `set`, `update`, `reset`
- [remove / has / keys / clear / reset](./delete-has-keys.md)
- [Подписки](./subscriptions.md) и [Селекторы](./selector-system.md)

## Жизненный цикл

```typescript
await todoStorage.initialize()    // инициализация
await todoStorage.waitForReady()  // ожидание готовности
todoStorage.initStatus            // { status: 'ready' }

// Подписка на изменение статуса
const unsub = todoStorage.onStatusChange((status) => {
  console.log(status) // { status: 'ready' | 'loading' | 'error' | 'idle' }
})

await todoStorage.destroy()       // уничтожение (для memory очищает данные)
```

## См. также

- [LocalStorage](./local-storage.md) · [IndexedDB](./indexeddb-storage.md) — персистентные варианты.
- [Статический .create()](./static-create.md) · [StorageFactory](./storage-factory.md) — способы создания.
- [browserStorage](./browser-storage.md) — memory на сервере, LocalStorage в браузере одной строкой.
