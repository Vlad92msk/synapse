# Middlewares (Промежуточные обработчики)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/MiddlewaresExample.tsx)

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
const storage = new MemoryStorage<MyState>({
  name: 'my-store',
  initialState: { ... },
  middlewares: (getDefault) => [
    getDefault().logger(),   // встроенная
    myMiddleware(),          // ваша
  ],
})
```

### Пример A — валидация формы

Перехватываем записи в поля формы, прогоняем через валидаторы и **блокируем
невалидные значения**, складывая сообщения об ошибках в соседний ключ `errors`.

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

type FormState = {
  email: string
  age: number
  errors: Record<string, string | undefined>
}

// key → валидатор: вернуть строку с ошибкой ИЛИ null, если всё ок
const validators: Record<string, (value: any) => string | null> = {
  email: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Некорректный e-mail'),
  age: (v) => (v >= 18 && v <= 120 ? null : 'Возраст должен быть 18–120'),
}

const validationMiddleware = (): SyncMiddleware => ({
  name: 'form-validation',
  reducer: (api) => (next) => (action) => {
    if (action.type !== 'set' || typeof action.key !== 'string') {
      return next(action)
    }

    const validate = validators[action.key]
    if (!validate) return next(action)

    const error = validate(action.value)

    // Записываем карту ошибок напрямую (doSet минует цепочку — без рекурсии)
    const errors = { ...(api.getState().errors ?? {}), [action.key]: error ?? undefined }
    api.storage.doSet('errors', errors)
    api.storage.notifySubscribers('errors', errors)

    // Невалидно — блокируем запись, возвращаем текущее значение из хранилища
    if (error) return api.storage.doGet(action.key)

    // Валидно — пропускаем дальше
    return next(action)
  },
})

const form = new MemoryStorage<FormState>({
  name: 'signup-form',
  initialState: { email: '', age: 0, errors: {} },
  middlewares: () => [validationMiddleware()],
})
await form.initialize()

form.set('email', 'not-an-email')      // заблокировано, errors.email = 'Некорректный e-mail'
form.set('email', 'user@example.com')  // прошло, errors.email = undefined
form.set('age', 15)                    // заблокировано, errors.age = '...'
```

### Пример B — нормализация значений

Middleware может не блокировать, а **преобразовывать** значение перед записью —
например, обрезать пробелы и приводить e-mail к нижнему регистру.

```typescript
import type { SyncMiddleware } from 'synapse-storage/core'

const normalizeMiddleware = (): SyncMiddleware => ({
  name: 'normalize',
  reducer: () => (next) => (action) => {
    if (action.type === 'set' && typeof action.value === 'string') {
      let value = action.value.trim()
      if (action.key === 'email') value = value.toLowerCase()

      // Передаём дальше уже изменённое значение
      return next({ ...action, value })
    }
    return next(action)
  },
})

// storage.set('email', '  User@Example.COM  ') → сохранится 'user@example.com'
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

const storage = new MemoryStorage<{ theme: string }>({
  name: 'settings',
  initialState: { theme: 'light' },
  middlewares: () => [
    auditMiddleware((key, value) => analytics.track('setting_changed', { key, value })),
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
