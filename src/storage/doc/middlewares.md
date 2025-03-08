# Система Middleware

Middleware в Synapse Storage позволяют расширять функциональность хранилища и модифицировать поведение операций.

## Встроенные middleware

### Batching Middleware
Группирует множественные операции в один батч для оптимизации производительности.

```typescript
const { batching } = getDefaultMiddleware()

batching({
  batchSize: 10,      // Размер батча
  batchDelay: 300,    // Задержка в мс
  segments: ['users'] // Опциональные сегменты
})
```

### Shallow Compare Middleware
Предотвращает ненужные обновления при одинаковых значениях.

```typescript
const { shallowCompare } = getDefaultMiddleware()

shallowCompare({
  segments: ['users'], // Опциональные сегменты
})
```

### Broadcast Middleware
Синхронизирует состояние между вкладками браузера.

```typescript
broadcastMiddleware({
  storageType: 'indexedDB',
  storageName: 'appStorage'
})
```

## Использование в хранилище

```typescript
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
      shallowCompare(),
      broadcastMiddleware({
        storageType: 'indexedDB',
        storageName: 'appStorage'
      })
    ]
  }
}).initialize()
```

## Создание собственного middleware

```typescript
const customMiddleware = (): Middleware => ({
  name: 'custom',
  
  // Инициализация
  setup: (api) => {
    // ...
  },
  
  // Обработка действий
  reducer: (api) => (next) => async (action) => {
    // До выполнения действия
    const result = await next(action)
    // После выполнения действия
    return result
  },
  
  // Очистка при уничтожении
  cleanup: () => {
    // ...
  }
})
```

## Порядок выполнения middleware

Middleware выполняются в порядке их объявления в массиве:
1. Каждый новый middleware оборачивает предыдущие
2. Действие проходит через все middleware сверху вниз
3. Результат проходит через middleware снизу вверх

```
Action → Middleware1 → Middleware2 → Middleware3 → Base Operation
Result ← Middleware1 ← Middleware2 ← Middleware3 ← Base Operation
```