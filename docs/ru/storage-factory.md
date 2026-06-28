# StorageFactory

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/FactoryExample.tsx)

Фабрика для создания хранилищ — альтернатива прямому `new MemoryStorage()` / `new LocalStorage()` /
`new IndexedDBStorage()`. Удобна, когда тип хранилища выбирается в одном месте или в рантайме.

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

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

## Когда брать

- Тип хранилища выбирается в одном месте или зависит от конфигурации/окружения.
- Хочется единый стиль создания всех сторов приложения.

## Когда не брать

- В компоненте — обычно удобнее [`useCreateStorage`](./hook-memory.md), который ещё и
  управляет жизненным циклом.
- Если тип фиксирован и известен — прямой `new`/`.create()` ничуть не хуже.

Чтение, запись и подписки — см. раздел «Работа с данными».
