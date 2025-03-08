# Адаптеры хранилищ

Synapse Storage поддерживает три типа хранилищ данных:

## MemoryStorage

In-memory хранилище для временных данных. Данные очищаются при перезагрузке страницы.

```typescript
const memoryStorage = await new MemoryStorage({
  name: 'tempStorage',
  middlewares: (getDefaultMiddleware) => {
    const { batching, shallowCompare } = getDefaultMiddleware()
    return [batching(), shallowCompare()]
  }
}).initialize()
```

## LocalStorage

Хранилище на основе Web Storage API. Подходит для небольших объемов данных, которые нужно сохранять между сессиями.

```typescript
const localStorage = await new LocalStorage({
  name: 'appStorage',
  middlewares: (getDefaultMiddleware) => {
    const { batching, shallowCompare } = getDefaultMiddleware()
    return [batching(), shallowCompare()]
  }
}).initialize()
```

## IndexedDBStorage

Хранилище на основе IndexedDB. Подходит для больших объемов данных и сложных структур.

```typescript
const dbStorage = await new IndexedDBStorage({
  name: 'dbStorage',
  options: {
    dbName: 'myApp',
    storeName: 'main-store',
    dbVersion: 1
  },
  middlewares: (getDefaultMiddleware) => {
    const { batching, shallowCompare } = getDefaultMiddleware()
    return [batching(), shallowCompare()]
  }
}).initialize()
```

## Сравнение адаптеров

| Особенность | MemoryStorage | LocalStorage | IndexedDBStorage |
|-------------|---------------|--------------|------------------|
| Персистентность | ❌ | ✅ | ✅ |
| Объем данных | Ограничен памятью | ~5-10 MB | >50 MB |
| Скорость | Очень быстро | Быстро | Средне |
| Сложные структуры | ✅ | ❌ | ✅ |
| Асинхронность | ✅ | ✅ | ✅ |
| Транзакции | ❌ | ❌ | ✅ |

## Работа с ключами

Все адаптеры поддерживают:
- Простые строковые ключи: `'user'`
- Вложенные пути: `'users.john.settings'`
- Сырые ключи для специальных случаев: `new StorageKey('rawKey', true)`

## Рекомендации по выбору

- **MemoryStorage**: для временных данных и состояния UI
- **LocalStorage**: для небольших настроек и пользовательских предпочтений
- **IndexedDBStorage**: для кэширования данных API, больших наборов данных и сложных структур