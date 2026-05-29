# Статический .create()

> [Назад к оглавлению](./README.md)

У каждого класса хранилища есть статический метод `.create()` — альтернатива `new`.

## Использование

```typescript
import { MemoryStorage, LocalStorage, IndexedDBStorage } from 'synapse-storage/core'

interface AppState {
  value: number
}

// MemoryStorage.create() — эквивалент new MemoryStorage()
const memStorage = MemoryStorage.create<AppState>({
  name: 'static-memory',
  initialState: { value: 100 },
})

// LocalStorage.create() — эквивалент new LocalStorage()
const localStore = LocalStorage.create<AppState>({
  name: 'static-local',
  initialState: { value: 200 },
})

// IndexedDBStorage.create() — эквивалент new IndexedDBStorage()
const idbStore = IndexedDBStorage.create<AppState>({
  name: 'static-idb',
  initialState: { value: 300 },
  options: {},                    // обязательно для IndexedDB
})

// Инициализация
await Promise.all([
  memStorage.initialize(),
  localStore.initialize(),
  idbStore.initialize(),
])
```
