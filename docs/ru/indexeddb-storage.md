# IndexedDBStorage

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/IndexedDBExample.tsx)

Данные хранятся в IndexedDB и переживают перезагрузку. **Асинхронный API** — операции
чтения/записи возвращают Promise.

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)),
но в персистентном асинхронном хранилище.

## Создание

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

// options — обязательное поле (может быть пустым объектом)
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: {},
})

// С пользовательским dbName
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: { dbName: 'my_app_db' }, // по умолчанию 'app_storage'
})

// Или через статический .create()
const storage = IndexedDBStorage.create<TodoState>({
  name: 'todo-idb',
  initialState: initialTodoState,
  options: {},
})

await storage.initialize()
```

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

## Когда брать

- Большие объёмы данных, массивы на тысячи элементов, бинарные данные (Blob/ArrayBuffer).
- Нужна персистентность за пределами лимита localStorage (~5 МБ).

## Когда не брать

- Маленькое состояние, где не хочется асинхронности → [LocalStorage](./local-storage.md).
- Эфемерное UI-состояние → [MemoryStorage](./memory-storage.md).

## Работа с данными

Полный разбор операций — в разделе «Работа с данными»: [Чтение](./reading-data.md),
[Запись](./writing-data.md), [remove/has/keys](./delete-has-keys.md),
[Подписки](./subscriptions.md). Везде, где у синхронных хранилищ операция возвращает значение,
у IndexedDB она возвращает Promise.

## Persist-миграции и SSR

IndexedDB персистентен, поэтому поддерживает миграцию схемы через `version` + `migrate`
(версия хранится reserved-записью в том же сторе и не видна в `getState()`/`keys()`) —
см. [Persist-миграции](./persist-migration.md). Серверное состояние засевается через
[`hydrate(state)`](./ssr-hydration.md) (для IndexedDB — `await storage.hydrate(...)`).
