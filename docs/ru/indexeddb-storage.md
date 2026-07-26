# IndexedDBStorage

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/IndexedDBExample.tsx)

**TL;DR:** персистентное хранилище поверх IndexedDB с **асинхронным** API. Для больших объёмов и бинарных данных, где localStorage тесен. Операции чтения/записи возвращают Promise.

## Зачем

Персистентность без лимита localStorage: IndexedDB держит большие массивы и бинарные данные (Blob/ArrayBuffer) и переживает перезагрузку. Плата — асинхронность: `get`/`set`/`update`/`has`/`keys`/`getState` возвращают Promise. Но состояние всегда можно прочитать **синхронно из кеша** через `getStateSync()` (в том числе в render).

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)), но в персистентном асинхронном хранилище.

## Когда использовать

- Большие объёмы данных, массивы на тысячи элементов, бинарные данные (Blob/ArrayBuffer).
- Нужна персистентность за пределами лимита localStorage (~5 МБ).

## Когда НЕ нужно

- Маленькое состояние, где не хочется асинхронности → [LocalStorage](./local-storage.md).
- Эфемерное UI-состояние → [MemoryStorage](./memory-storage.md).
- Стор нужен **синхронно на сервере** (SSR/SSG) → у IndexedDB нет синхронной конструкции, C-форма [`createSynapse`](./create-synapse-basic.md) не поднимает его синхронно. Для server-safe sync-стора см. [browserStorage](./browser-storage.md).

## Чем отличается от соседних хранилищ

| | API | Объём | Сервер |
|---|---|---|---|
| [MemoryStorage](./memory-storage.md) | sync | RAM | работает (эфемерно) |
| [LocalStorage](./local-storage.md) | sync | ~5 МБ, строки | нужен [browserStorage](./browser-storage.md) |
| **IndexedDB** | **async** | большие/бинарные | **нет sync-конструкции** |

## Использование

Copy-paste минимальная форма (поле `options` обязательно, может быть пустым):

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: {}, // обязательное поле (можно пустой объект)
})

// Или через статический .create() — эквивалент new
const storage = IndexedDBStorage.create<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: {},
})

await storage.initialize()
```

## Все параметры (закомментировано)

`IndexedDBStorage` принимает `IndexedDBStorageConfig<T>` — это `AsyncStorageConfig` + обязательное `options`.

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

const storage = new IndexedDBStorage<TodoState>({
  // name — обязательное. Имя стора (object store) внутри базы.
  name: 'todo-idb',

  // initialState — дефолт при первом запуске (когда в БД ещё пусто).
  initialState: initialTodoState,

  // options — ОБЯЗАТЕЛЬНОЕ поле (в отличие от memory/local). Настройки базы.
  options: {
    // dbName? — имя базы IndexedDB. По умолчанию 'app_storage'.
    //   Сторы с одинаковым dbName живут в одной базе.
    dbName: 'my_app_db',
  },

  // version? — версия СХЕМЫ состояния (persist-migration), не путать с версией БД.
  //   Версия хранится reserved-записью в том же сторе, не видна в getState()/keys().
  version: 2,

  // migrate? — преобразует сохранённое состояние старой версии к текущей схеме.
  migrate: (persisted, fromVersion) =>
    fromVersion < 2 ? normalizeOld(persisted) : persisted,

  // middlewares? — конвейер ASYNC-middleware (getDefault даёт batching/shallowCompare/logger).
  middlewares: (getDefault) => [getDefault().shallowCompare()],

  // singleton? — один экземпляр на name/key (enabled/mergeStrategy/warnOnConflict/key).
  singleton: { enabled: true },
})
```

| Поле | Тип | Описание |
|---|---|---|
| `name` | `string` | **Обязательно.** Имя object store. |
| `options` | `IndexedDBConfig` | **Обязательно.** `{ dbName? }` (по умолчанию `'app_storage'`). |
| `initialState?` | `T` | Дефолт при первом запуске. |
| `version?` | `number` | Версия схемы для миграций. |
| `migrate?` | `MigrateFn<T>` | Преобразование старой схемы к текущей. |
| `middlewares?` | `(getDefault) => AsyncMiddleware[]` | Конвейер async-middleware. |
| `singleton?` | `SingletonOptions` | Один экземпляр на `name`/`key`. |

## Синхронный vs асинхронный API

Главное отличие от Memory/LocalStorage: операции возвращают Promise.

```typescript
// Запись
await storage.set('filter', 'active')
await storage.update((s) => { s.todos.push(createTodo('Новая задача')) })

// Чтение
const todos = await storage.get<Todo[]>('todos')
const state = await storage.getState()

// getStateSync() — синхронное чтение из кеша, доступно всегда (в том числе в render)
const cached = storage.getStateSync()
```

Подписки (`subscribe`, `subscribeToAll`, `useStorageSubscribe`) идентичны синхронным хранилищам.

## Работа с данными

Полный разбор операций — в разделе «Работа с данными»: [Чтение](./reading-data.md), [Запись](./writing-data.md), [remove/has/keys](./delete-has-keys.md), [Подписки](./subscriptions.md). Везде, где у синхронных хранилищ операция возвращает значение, у IndexedDB она возвращает Promise.

## Persist-миграции и SSR

IndexedDB персистентен, поэтому поддерживает миграцию схемы через `version` + `migrate` (версия хранится reserved-записью в том же сторе и не видна в `getState()`/`keys()`) — см. [Persist-миграции](./persist-migration.md). Серверное состояние засевается через [`hydrate(state)`](./ssr-hydration.md) (для IndexedDB — `await storage.hydrate(...)`).

## См. также

- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md)
- [Persist-миграции](./persist-migration.md) · [SSR-гидрация](./ssr-hydration.md)
