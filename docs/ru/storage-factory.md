# StorageFactory

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/FactoryExample.tsx)

Фабрика для создания хранилищ. Альтернатива прямому вызову `new MemoryStorage()`.

## Типизированные методы

```typescript
import { StorageFactory } from 'synapse-storage/core'

interface UserState {
  name: string
  age: number
}

// createMemory -> MemoryStorage<T> (синхронный)
const memStorage = StorageFactory.createMemory<UserState>({
  name: 'factory-memory',
  initialState: { name: 'Alice', age: 25 },
})

// createLocal -> LocalStorage<T> (синхронный)
const localStore = StorageFactory.createLocal<UserState>({
  name: 'factory-local',
  initialState: { name: 'Bob', age: 30 },
})

// createIndexedDB -> IndexedDBStorage<T> (асинхронный)
const idbStore = StorageFactory.createIndexedDB<UserState>({
  name: 'factory-idb',
  initialState: { name: 'Charlie', age: 35 },
  options: {},
})

// Инициализация каждого
await memStorage.initialize()
await localStore.initialize()
await idbStore.initialize()
```

## Универсальный create()

Тип выбирается через поле `type`. Возвращаемый тип зависит от выбранного типа:

```typescript
const sync = StorageFactory.create<UserState>({
  type: 'memory',                 // -> ISyncStorage<UserState>
  name: 'universal-mem',
  initialState: { name: 'A', age: 1 },
})

const sync = StorageFactory.create<UserState>({
  type: 'localStorage',           // -> ISyncStorage<UserState>
  name: 'universal-local',
  initialState: { name: 'B', age: 2 },
})

const async = StorageFactory.create<UserState>({
  type: 'indexedDB',              // -> IAsyncStorage<UserState>
  name: 'universal-idb',
  initialState: { name: 'C', age: 3 },
  options: {},
})
```
