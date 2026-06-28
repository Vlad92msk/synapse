# Middlewares (Промежуточные обработчики)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/MiddlewaresExample.tsx)

Middlewares перехватывают операции хранилища (set, get, update, delete, clear) и могут модифицировать, фильтровать или группировать их. Конфигурируются при создании стора — в поле `middlewares`.

Примеры используют сквозной домен `TodoState = { todos: Todo[]; filter: Filter }` (см. раздел
[MemoryStorage](./memory-storage.md)). Поскольку middleware задаются при создании, здесь — отдельные
todo-сторы с нужной обвязкой.

## Конфигурация

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'my-todo',
  initialState: { todos: [], filter: 'all' },
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
const storage = new MemoryStorage<TodoState>({
  name: 'batching-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    getDefault().batching({
      batchSize: 5,     // максимум операций в одной группе
      batchDelay: 100,  // задержка перед сбросом (мс)
    }),
  ],
})
await storage.initialize()

// 12 быстрых set('filter') — до подписчиков дойдёт только последнее значение
const filters = ['all', 'active', 'completed'] as const
for (let i = 0; i < 12; i++) {
  storage.set('filter', filters[i % 3])
}
// одно уведомление вместо двенадцати
```

## 2. ShallowCompare Middleware

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'shallow-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),
  ],
})
await storage.initialize()

// Установка идентичного значения — обновление НЕ произойдёт
storage.set('filter', 'all')     // пропуск (значение не изменилось)

// Установка другого значения — обновление произойдёт
storage.set('filter', 'active')  // обновление
```

## 3. ShallowCompare + пользовательский компаратор

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'custom-cmp',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    getDefault().shallowCompare({
      // Пользовательская функция сравнения значений по ключу.
      // Здесь: считаем список задач «не изменившимся», если длина та же.
      comparator: (prev, next) => {
        if (Array.isArray(prev) && Array.isArray(next)) {
          return prev.length === next.length
        }
        return prev === next
      },
    }),
  ],
})
await storage.initialize()
```

## 4. Комбинирование Middlewares

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'combined',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    // Порядок важен: сначала фильтрация, затем группировка
    getDefault().shallowCompare(),
    getDefault().batching({ batchSize: 3, batchDelay: 50 }),
  ],
})
await storage.initialize()

// shallowCompare отфильтровывает дубликаты, batching группирует остальное
storage.set('filter', 'all')     // пропуск (shallowCompare)
storage.set('filter', 'all')     // пропуск (shallowCompare)
storage.set('filter', 'active')  // проходит → в группу
```

## 5. BroadcastMiddleware (синхронизация между вкладками)

```typescript
import { MemoryStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'broadcast-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [
    syncBroadcastMiddleware({
      storageName: 'broadcast-demo',
      storageType: 'memory',
    }),
  ],
})
await storage.initialize()

// Изменения будут синхронизироваться между вкладками
storage.update((s) => { s.todos.push({ id: 't1', title: 'Из другой вкладки', done: false }) })

// Для MemoryStorage — полная синхронизация данных
// Для LocalStorage/IndexedDB — только уведомление подписчиков
// (данные уже синхронизированы через движок хранилища)
```

## 6. Logger Middleware (dev-only)

Логирует только **пишущие** действия (`set` / `update` / `delete` / `clear` / `reset` /
`init`) — чтения (`get` / `keys`) не шумят. Намеренно минимален (без i18n/цветов).
Подключайте только в dev.

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'logged',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) =>
    import.meta.env.DEV ? [getDefault().logger()] : [],
})
await storage.initialize()

storage.set('filter', 'active')
// [synapse storage] set "filter" (0ms)
//   action: { type: 'set', key: 'filter', value: 'active', ... }
//   prev:   { todos: [...], filter: 'all' }
//   next:   { todos: [...], filter: 'active' }

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

## 7. Своя (кастомная) middleware

Встроенных middleware всего три (`batching`, `shallowCompare`, `logger`), но система
полностью открыта: middleware — это **обычный объект** типа `SyncMiddleware`
(для Memory/LocalStorage) или `AsyncMiddleware` (для IndexedDB). Никакой регистрации не
нужно — просто верните свой объект в том же массиве, что и `getDefault()…`.

### Анатомия

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const myMiddleware = (): SyncMiddleware => ({
  name: 'my-middleware',           // имя (для отладки)

  setup: (api) => {},              // опционально: вызывается один раз при подключении
  cleanup: () => {},               // опционально: вызывается при destroy()

  // Ядро — Redux-style тройное каррирование: (api) => (next) => (action)
  reducer: (api) => (next) => (action) => {
    // action — что происходит с хранилищем:
    //   { type: 'set' | 'get' | 'update' | 'delete' | 'clear' | 'reset' | ...,
    //     key?, value?, metadata? }

    // next(action)        — передать управление дальше по цепочке (выполнить операцию)
    // НЕ вызвать next()   — заблокировать операцию (запись не произойдёт)
    // next({ ...action, value: X }) — изменить значение перед записью

    return next(action)
  },
})
```

`api` даёт доступ к хранилищу изнутри middleware:

```typescript
api.getState()                       // текущее состояние целиком
api.storage.doGet(key)               // прочитать значение (минуя цепочку)
api.storage.doSet(key, value)        // записать (минуя цепочку — без рекурсии)
api.storage.notifySubscribers(key, value)  // уведомить подписчиков вручную
api.dispatch(action)                 // прогнать новый action через всю цепочку
```

> Цепочка обёрнута в `try/catch`: если middleware бросит исключение, оно будет
> поглощено обработчиком ошибок и не «всплывёт» к вызвавшему `storage.set(...)`.
> Поэтому для «отказа» не бросайте ошибку, а **просто не вызывайте `next`**.

Подключение — рядом со встроенными:

```typescript
const storage = new MemoryStorage<TodoState>({
  name: 'my-todo',
  initialState: { todos: [], filter: 'all' },
  middlewares: (getDefault) => [
    getDefault().logger(),   // встроенная
    myMiddleware(),          // ваша
  ],
})
```

### Пример A — валидация записи

Перехватываем `set('filter', …)` и **блокируем неизвестные значения**: если значение не входит
в допустимый набор, операция не доходит до хранилища (возвращаем текущее значение).

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const ALLOWED_FILTERS = ['all', 'active', 'completed']

const validateFilterMiddleware = (): SyncMiddleware => ({
  name: 'validate-filter',
  reducer: (api) => (next) => (action) => {
    if (action.type === 'set' && action.key === 'filter' && !ALLOWED_FILTERS.includes(action.value)) {
      // Невалидно — блокируем запись, возвращаем текущее значение из хранилища
      return api.storage.doGet('filter')
    }
    return next(action)
  },
})

const storage = new MemoryStorage<TodoState>({
  name: 'todo-validated',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [validateFilterMiddleware()],
})
await storage.initialize()

storage.set('filter', 'archived' as any)  // заблокировано → filter остаётся 'all'
storage.set('filter', 'active')           // прошло
```

### Пример B — нормализация значений

Middleware может не блокировать, а **преобразовывать** значение перед записью — например,
обрезать пробелы у заголовков задач.

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const trimTitlesMiddleware = (): SyncMiddleware => ({
  name: 'trim-titles',
  reducer: () => (next) => (action) => {
    if (action.type === 'set' && action.key === 'todos' && Array.isArray(action.value)) {
      const value = action.value.map((t) => ({ ...t, title: t.title.trim() }))
      return next({ ...action, value })
    }
    return next(action)
  },
})

// storage.set('todos', [{ id, title: '  Купить молоко  ', done: false }])
// → сохранится title 'Купить молоко'
```

### Пример C — аудит / аналитика изменений

Middleware-«наблюдатель»: ничего не меняет, лишь реагирует на пишущие действия
(удобно для логирования в свою аналитику, отправки метрик и т.п.).

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const auditMiddleware = (onChange: (key: string, value: any) => void): SyncMiddleware => ({
  name: 'audit',
  reducer: () => (next) => (action) => {
    const result = next(action)  // сначала выполняем операцию

    if (action.type === 'set' && typeof action.key === 'string') {
      onChange(action.key, action.value)
    }
    return result
  },
})

const storage = new MemoryStorage<TodoState>({
  name: 'todo-audited',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [
    auditMiddleware((key, value) => analytics.track('todo_changed', { key, value })),
  ],
})
```

> Для **асинхронного** хранилища (IndexedDB) всё то же самое, только тип — `AsyncMiddleware`,
> а `reducer`/`api.storage.*` возвращают `Promise` (используйте `async/await` и
> `return await next(action)`).

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
