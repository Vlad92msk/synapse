# Статический .create()

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/StaticCreateExample.tsx)

**TL;DR:** у каждого класса хранилища есть статический метод `.create()` — полный эквивалент оператора `new`. Вопрос стиля, не поведения.

## Зачем

`new MemoryStorage(...)` и `MemoryStorage.create(...)` создают идентичные сторы. `.create()` удобен, когда хочется единого «фабричного» вида вызова без ключевого слова `new` (например, при передаче ссылки на метод), либо когда стиль кодовой базы избегает `new`.

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

## Когда использовать

- Нужен обычный стор с фиксированным типом, но стилистически хочется `.create()` вместо `new`.

## Когда НЕ нужно

- Тип выбирается в рантайме или в одном месте → [`StorageFactory`](./storage-factory.md).
- Стор живёт внутри React-компонента → [`useCreateStorage`](./hook-memory.md) (управляет жизненным циклом).

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

Конфиг у `.create()` тот же, что у `new` соответствующего класса, — все поля разобраны в доках хранилищ ([Memory](./memory-storage.md) / [Local](./local-storage.md) / [IndexedDB](./indexeddb-storage.md)).

## new, .create() или StorageFactory?

| Способ | Когда |
|---|---|
| `new` / `.create()` | Тип известен и фиксирован. Полностью равнозначны. |
| [`StorageFactory`](./storage-factory.md) | Тип выбирается в одном месте или в рантайме. |
| [`useCreateStorage`](./hook-memory.md) | Стор живёт внутри React-компонента. |

## См. также

- [StorageFactory](./storage-factory.md) · [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) · [IndexedDB](./indexeddb-storage.md)
