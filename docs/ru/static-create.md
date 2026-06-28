# Статический .create()

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/StaticCreateExample.tsx)

У каждого класса хранилища есть статический метод `.create()` — полный эквивалент оператора `new`.
Это вопрос стиля: `new MemoryStorage(...)` и `MemoryStorage.create(...)` создают идентичные сторы.

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

## Использование

```typescript
import { MemoryStorage, LocalStorage, IndexedDBStorage } from 'synapse-storage/core'

// MemoryStorage.create() — эквивалент new MemoryStorage()
const memStorage = MemoryStorage.create<TodoState>({
  name: 'todo-static',
  initialState: initialTodoState,
})

// LocalStorage.create() — эквивалент new LocalStorage()
const localStore = LocalStorage.create<TodoState>({
  name: 'todo-static-local',
  initialState: initialTodoState,
})

// IndexedDBStorage.create() — эквивалент new IndexedDBStorage()
const idbStore = IndexedDBStorage.create<TodoState>({
  name: 'todo-static-idb',
  initialState: initialTodoState,
  options: {},                    // обязательно для IndexedDB
})

await Promise.all([
  memStorage.initialize(),
  localStore.initialize(),
  idbStore.initialize(),
])
```

## new, .create() или StorageFactory?

- `new` / `.create()` — когда тип хранилища известен и фиксирован. Полностью равнозначны.
- [`StorageFactory`](./storage-factory.md) — когда тип выбирается в одном месте или в рантайме.
- [`useCreateStorage`](./hook-memory.md) — когда стор живёт внутри React-компонента.
