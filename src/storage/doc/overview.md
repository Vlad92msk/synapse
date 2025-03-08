# Synapse Storage Module

Synapse Storage - это модуль управления состоянием приложения, предоставляющий единый интерфейс для работы с различными типами хранилищ данных.

## Основные возможности

- Поддержка различных типов хранилищ (MemoryStorage, LocalStorage, IndexedDBStorage)
- Система middleware для расширения функциональности
- Селекторы для эффективного доступа к данным
- Кэширование с гибкими правилами
- Батчинг операций
- Синхронизация между вкладками
- Оптимизации через shallow compare

## Базовая архитектура

```
Storage
  ├─ Adapters (Memory/Local/IndexedDB)
  ├─ Middlewares
  │  ├─ Broadcast
  │  ├─ Batching
  │  ├─ ShallowCompare
  │  └─ Cache
  └─ Modules
     ├─ Selector
     ├─ Cache
     └─ Plugin
```

## API Хранилища

```typescript
interface IStorage<T extends Record<string, any>> {
  name: string
  get<T>(key: StorageKeyType): Promise<T | undefined>
  getState<T>(): Promise<Record<string, any>>
  set<T>(key: StorageKeyType, value: T): Promise<void>
  update(updater: (state: any) => void): Promise<void>
  has(key: StorageKeyType): Promise<boolean>
  delete(key: StorageKeyType): Promise<void>
  clear(): Promise<void>
  keys(): Promise<string[]>
  destroy(): Promise<void>
  subscribe(key: StorageKeyType, callback: (value: any) => void): VoidFunction
  subscribe<R>(pathSelector: (state: T) => R, callback: (value: R) => void): VoidFunction
  subscribeToAll(callback: (event: { type: string; key?: StorageKeyType; value?: any }) => void): VoidFunction
  initialize(): Promise<this>
}
```

## Простой пример использования

```typescript
// Создание хранилища
const storage = await new IndexedDBStorage({
  name: 'appStorage',
  options: {
    dbName: 'myApp',
    storeName: 'main-store',
    dbVersion: 1
  },
  middlewares: (getDefaultMiddleware) => {
    const { batching, shallowCompare } = getDefaultMiddleware()
    return [
      batching(),
      shallowCompare()
    ]
  }
}).initialize()

// Работа с данными
await storage.set('user', { id: 1, name: 'John' })
const user = await storage.get('user')

// Подписка на изменения
storage.subscribe('user', (newValue) => {
  console.log('User updated:', newValue)
})

// Обновление данных
await storage.update((state) => {
  state.user.name = 'John Doe'
})
```

## Дополнительная документация

- [Адаптеры хранилищ](./adapters.md)
- [Система Middleware](./middlewares.md)
- [Работа с селекторами](./selectors.md)
- [Кэширование](./cache.md)
- [Примеры использования](./examples.md)