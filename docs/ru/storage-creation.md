> [🏠 Главная](./README.md)
> [🏠 Журнал изменений](../../CHANGELOG.md)

# Создание хранилищ

MemoryStorage
```typescript
import { IndexedDBStorage, LocalStorage, MemoryStorage } from "synapse-storage/core";

const counter1 = await new MemoryStorage<Counter>({
  name: 'counter1',
  initialState: {
    value: 100,
  },
}).initialize()
```

LocalStorage
```typescript
const counter2 = await new LocalStorage<Counter>({
  name: 'counter2',
  initialState: { value: 100 },
}).initialize()
```

IndexedDBStorage

```typescript
const { counter3 } = await IndexedDBStorage.createStorages<{ counter3: Counter }>(
  'example1', // Название базы данных в indexDB
  // Таблицы:
  {
    counter3: {
      name: 'counter3',
      initialState: { value: 99 },
      // eventEmitter: ,
      // initialState: ,
      // middlewares: ,
      // pluginExecutor: ,
    },
    // Другие объекты (хранилища в текущей базе данных)
  }
)
```
