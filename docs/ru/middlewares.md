# Middlewares (Промежуточные обработчики)

> [Назад к оглавлению](./README.md)

Middlewares перехватывают операции хранилища (set, get, delete, clear) и могут модифицировать, фильтровать или группировать их.

## Конфигурация

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<MyState>({
  name: 'my-store',
  initialState: { ... },
  middlewares: (getDefault) => [
    getDefault().batching({ batchSize: 5, batchDelay: 100 }),
    getDefault().shallowCompare(),
  ],
})
await storage.initialize()

// getDefault() возвращает объект со встроенными middlewares:
// - batching(options?)       — группировка частых записей
// - shallowCompare(options?) — фильтрация идентичных значений
// - logger(options?)         — dev-лог пишущих действий

// Порядок в массиве = порядок обработки
```

## 1. Batching Middleware

```typescript
const storage = new MemoryStorage<{ counter: number; items: string[] }>({
  name: 'batching-demo',
  initialState: { counter: 0, items: [] },
  middlewares: (getDefault) => [
    getDefault().batching({
      batchSize: 5,     // максимум операций в одной группе
      batchDelay: 100,  // задержка перед сбросом (мс)
    }),
  ],
})
await storage.initialize()

// 20 быстрых set — только последнее значение попадает в хранилище
for (let i = 0; i < 20; i++) {
  storage.set('counter', i)
}
// counter = 19 (не 20 уведомлений, а одно)

// Несколько set по одному ключу — сохраняется последний
storage.set('items', ['a'])
storage.set('items', ['a', 'b'])
storage.set('items', ['a', 'b', 'c'])
// items = ['a', 'b', 'c']
```

## 2. ShallowCompare Middleware

```typescript
const storage = new MemoryStorage<{ user: { name: string; age: number } }>({
  name: 'shallow-demo',
  initialState: { user: { name: 'Alice', age: 30 } },
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),
  ],
})
await storage.initialize()

// Установка идентичного объекта — обновление НЕ произойдёт
storage.set('user', { name: 'Alice', age: 30 })  // пропуск

// Установка другого объекта — обновление произойдёт
storage.set('user', { name: 'Bob', age: 25 })    // обновление
```

## 3. ShallowCompare + пользовательский компаратор

```typescript
const storage = new MemoryStorage<{ score: number }>({
  name: 'custom-cmp',
  initialState: { score: 0 },
  middlewares: (getDefault) => [
    getDefault().shallowCompare({
      // Пользовательская функция сравнения
      comparator: (prev, next) => {
        if (typeof prev === 'number' && typeof next === 'number') {
          return Math.abs(prev - next) < 5  // разница < 5 = "одинаково"
        }
        return prev === next
      },
    }),
  ],
})
await storage.initialize()

storage.set('score', 2)   // пропуск (разница < 5)
storage.set('score', 10)  // обновление (разница >= 5)
```

## 4. Комбинирование Middlewares

```typescript
const storage = new MemoryStorage<{ value: string; count: number }>({
  name: 'combined',
  initialState: { value: 'hello', count: 0 },
  middlewares: (getDefault) => [
    // Порядок важен: сначала фильтрация, затем группировка
    getDefault().shallowCompare(),
    getDefault().batching({ batchSize: 3, batchDelay: 50 }),
  ],
})
await storage.initialize()

// shallowCompare отфильтровывает дубликаты, batching группирует остальное
storage.set('value', 'hello')  // пропуск (shallowCompare)
storage.set('value', 'hello')  // пропуск (shallowCompare)
storage.set('value', 'world')  // проходит → в группу
```

## 5. BroadcastMiddleware (синхронизация между вкладками)

```typescript
import { MemoryStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<{ message: string }>({
  name: 'broadcast-demo',
  initialState: { message: 'No messages' },
  middlewares: () => [
    syncBroadcastMiddleware({
      storageName: 'broadcast-demo',
      storageType: 'memory',
    }),
  ],
})
await storage.initialize()

// Изменения будут синхронизироваться между вкладками
storage.set('message', 'Hello from tab!')

// Для MemoryStorage — полная синхронизация данных
// Для LocalStorage/IndexedDB — только уведомление подписчиков
// (данные уже синхронизированы через движок хранилища)
```

## 6. Logger Middleware (dev-only)

Логирует только **пишущие** действия (`set` / `update` / `delete` / `clear` / `reset` /
`init`) — чтения (`get` / `keys`) не шумят. Намеренно минимален (без i18n/цветов).
Подключайте только в dev.

```typescript
const storage = new MemoryStorage<{ count: number }>({
  name: 'logged',
  initialState: { count: 0 },
  middlewares: (getDefault) =>
    import.meta.env.DEV ? [getDefault().logger()] : [],
})
await storage.initialize()

storage.set('count', 1)
// [synapse storage] set "count" (0ms)
//   action: { type: 'set', key: 'count', value: 1, ... }
//   prev:   { count: 0 }
//   next:   { count: 1 }

// Опции:
//   collapsed?: boolean   — свернуть группу лога (console.groupCollapsed)
//   showState?: boolean   — печатать prev/next состояние (по умолчанию true)
getDefault().logger({ collapsed: true, showState: false })
```

Также доступны как standalone-функции `loggerMiddleware` (async) и
`syncLoggerMiddleware` (sync) из `synapse-storage/core` — например, чтобы переиспользовать
один инстанс или обернуть собственной обёрткой.

> Для полноценного dev-лога **диспетчера** (action / prev / next / diff) есть отдельный
> `loggerDispatcherMiddleware`. Storage-логгер — про низкоуровневые операции хранилища.

## Типы

```typescript
import type {
  SyncMiddleware,         // Middleware для синхронных хранилищ (Memory, LocalStorage)
  AsyncMiddleware,        // Middleware для асинхронных хранилищ (IndexedDB)
  SyncMiddlewareAPI,      // API, доступное внутри middleware (getState, dispatch)
  AsyncMiddlewareAPI,
  StorageAction,          // { type: 'set'|'get'|'delete'|'clear', key?, value? }
  SyncStorageConfig,      // Конфиг с middlewares?: ConfigureSyncMiddlewares
  AsyncStorageConfig,     // Конфиг с middlewares?: ConfigureAsyncMiddlewares
  BatchingMiddlewareOptions,     // { batchSize?, batchDelay? }
  ShallowCompareMiddlewareOptions, // { comparator?, segments? }
} from 'synapse-storage/core'

// Конфигурация middleware — колбэк с getDefault
type ConfigureSyncMiddlewares = (
  getDefault: () => SyncDefaultMiddlewares
) => SyncMiddleware[]

interface SyncDefaultMiddlewares {
  batching(options?: BatchingMiddlewareOptions): SyncMiddleware
  shallowCompare(options?: ShallowCompareMiddlewareOptions): SyncMiddleware
  logger(options?: LoggerMiddlewareOptions): SyncMiddleware
}

// Аналогичный AsyncDefaultMiddlewares для IndexedDB

// Standalone-фабрики:
//   loggerMiddleware(options?): AsyncMiddleware
//   syncLoggerMiddleware(options?): SyncMiddleware
// LoggerMiddlewareOptions = { collapsed?: boolean; showState?: boolean }
```
