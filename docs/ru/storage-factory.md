# StorageFactory

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/FactoryExample.tsx)

**TL;DR:** статическая фабрика хранилищ — альтернатива прямому `new MemoryStorage()` / `new LocalStorage()` / `new IndexedDBStorage()`. Полезна, когда тип хранилища выбирается в одном месте или в рантайме.

## Зачем

Единая точка создания сторов. Либо типизированные методы (`createMemory`/`createLocal`/`createIndexedDB`), либо универсальный `create({ type })`, где тип задаётся полем и может зависеть от окружения/конфига. Под капотом каждый метод зовёт `.create()` соответствующего класса — поведение идентично `new`.

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

## Когда использовать

- Тип хранилища выбирается в одном месте или зависит от конфигурации/окружения.
- Хочется единый стиль создания всех сторов приложения.

## Когда НЕ нужно

- Тип фиксирован и известен → прямой `new` / [`.create()`](./static-create.md) ничуть не хуже.
- Стор живёт внутри React-компонента → удобнее [`useCreateStorage`](./hook-memory.md), который ещё и управляет жизненным циклом.

## Типизированные методы

Каждый метод возвращает конкретный тип хранилища:

```typescript
import { StorageFactory } from 'synapse-storage/core'

// createMemory -> MemoryStorage<T> (синхронный)
const memStorage = StorageFactory.createMemory<TodoState>({
  name: 'todo-factory',
  initialState: initialTodoState,
})

// createLocal -> LocalStorage<T> (синхронный)
const localStore = StorageFactory.createLocal<TodoState>({
  name: 'todo-factory-local',
  initialState: initialTodoState,
})

// createIndexedDB -> IndexedDBStorage<T> (асинхронный)
const idbStore = StorageFactory.createIndexedDB<TodoState>({
  name: 'todo-factory-idb',
  initialState: initialTodoState,
  options: {},
})

await memStorage.initialize()
```

## Универсальный create()

Тип выбирается через поле `type`, возвращаемый тип зависит от него:

```typescript
const sync = StorageFactory.create<TodoState>({
  type: 'memory',                 // -> ISyncStorage<TodoState>
  name: 'todo-universal-mem',
  initialState: initialTodoState,
})

const sync2 = StorageFactory.create<TodoState>({
  type: 'localStorage',           // -> ISyncStorage<TodoState>
  name: 'todo-universal-local',
  initialState: initialTodoState,
})

const async = StorageFactory.create<TodoState>({
  type: 'indexedDB',              // -> IAsyncStorage<TodoState>
  name: 'todo-universal-idb',
  initialState: initialTodoState,
  options: {},
})
```

## Все параметры (закомментировано)

Универсальный `create` принимает `UniversalStorageConfig<T>` — это базовый конфиг + поле `type`. Набор доступных полей совпадает с конфигом конкретного хранилища.

```typescript
import { StorageFactory } from 'synapse-storage/core'

const storage = StorageFactory.create<TodoState>({
  // type — ОБЯЗАТЕЛЬНОЕ (только у универсального create). Выбирает адаптер и возвращаемый тип:
  //   'memory' | 'localStorage' -> ISyncStorage,  'indexedDB' -> IAsyncStorage.
  //   'worker' сюда НЕ входит (WorkerCacheStorage фабрикой не создаётся).
  type: 'indexedDB',

  // name — обязательное. Идентификатор стора.
  name: 'todo-universal-idb',

  // initialState — начальное состояние; из него выводится TState.
  initialState: initialTodoState,

  // options — обязательно ТОЛЬКО для type: 'indexedDB' ({ dbName? }); для memory/local игнорируется.
  options: { dbName: 'app_storage' },

  // version? / migrate? — persist-миграции (работают для local/indexedDB, для memory игнорируются).
  version: 1,
  migrate: (persisted, fromVersion) => persisted,

  // middlewares? — конвейер middleware (sync или async в зависимости от type).
  middlewares: (getDefault) => [getDefault().shallowCompare()],

  // singleton? — один экземпляр на name/key (enabled/mergeStrategy/warnOnConflict/key).
  singleton: { enabled: true },
})
```

| Поле | Тип | Описание |
|---|---|---|
| `type` | `'memory' \| 'localStorage' \| 'indexedDB'` | **Обязательно** (только у `create`). Выбирает адаптер. |
| `name` | `string` | **Обязательно.** Идентификатор стора. |
| `initialState?` | `T` | Начальное состояние. |
| `options?` | `IndexedDBConfig` | Обязательно для `indexedDB`. |
| `version?` / `migrate?` | `number` / `MigrateFn<T>` | Persist-миграции (local/indexedDB). |
| `middlewares?` | `(getDefault) => Middleware[]` | Конвейер middleware. |
| `singleton?` | `SingletonOptions` | Один экземпляр на `name`/`key`. |

## См. также

- [Статический .create()](./static-create.md) — `new` vs `.create()` vs `StorageFactory`.
- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) · [IndexedDB](./indexeddb-storage.md).

Чтение, запись и подписки — см. раздел «Работа с данными».
