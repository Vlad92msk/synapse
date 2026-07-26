# SharedWorkerMiddleware

> [Назад к оглавлению](./README.md)

`syncSharedWorkerMiddleware` / `sharedWorkerMiddleware` — **межвкладочная синхронизация состояния
через один общий SharedWorker**. Прямое зеркало [`broadcastMiddleware`](./middlewares.md): та же
роль, та же сигнатура `({ storageType, storageName })`, тот же результат между вкладками —
отличается только транспорт. Там, где broadcast-вариант поднимает по одному `BroadcastChannel` на
стор, shared-worker-вариант мультиплексирует **все** сторы поверх **одного** SharedWorker на origin.

Подключается как любой middleware — в поле `middlewares` при создании стора.

## Зачем

`broadcastMiddleware` создаёт отдельный `BroadcastChannel` на каждый стор. Когда синхронизируемых
сторов много, это много независимых каналов. SharedWorker-транспорт сводит их к **одному** воркеру
на вкладку: десять сторов делят один воркер, а сообщения разбираются по имени логического канала
`${storageType}-${storageName}`. Плюс — если SharedWorker уже поднят под другие задачи, его можно
переиспользовать вместо параллельного стека `BroadcastChannel`.

Семантика синхронизации при этом **идентична** broadcast-варианту — миграция делается заменой одной
строки.

## Когда использовать

- Синхронизируете **много** сторов между вкладками и хотите мультиплексировать их через один
  SharedWorker, а не плодить отдельные каналы.
- В приложении **уже есть** SharedWorker, и хочется переиспользовать его как транспорт.

## Когда НЕ нужно

- **Сторов мало (один-два).** Берите [`broadcastMiddleware`](./middlewares.md) — проще, без воркера,
  тот же результат.
- **Нужен живой общий кэш внутри воркера** (не только уведомления, а данные, живущие в самом
  воркере) → это [WorkerCacheStorage](./worker-cache-storage.md), другой инструмент.
- **Нет межвкладочного сценария вовсе** — middleware не нужен.

## Две фабрики — какую брать

Сигнатура у обеих одинакова, различие — синхронное хранилище или асинхронное:

| Фабрика | Тип | Для чего |
|---|---|---|
| **`syncSharedWorkerMiddleware`** | `SyncMiddleware` | синхронные хранилища: `MemoryStorage`, `LocalStorage` |
| **`sharedWorkerMiddleware`** | `Middleware` (async) | асинхронный `IndexedDBStorage` (и `WorkerCacheStorage`) |

## Использование

Copy-paste минимальная форма (`MemoryStorage`):

```typescript
import { MemoryStorage, syncSharedWorkerMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'shared-worker-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [
    syncSharedWorkerMiddleware({
      storageType: 'memory',
      storageName: 'shared-worker-demo',
    }),
  ],
})
await storage.initialize()

// Изменения синхронизируются между вкладками через один SharedWorker.
storage.update((s) => { s.todos.push({ id: 't1', title: 'Из другой вкладки', done: false }) })
```

Замена `broadcastMiddleware` → `syncSharedWorkerMiddleware` (или обратно) — в одну строку, props те
же самые.

## N сторов через ОДИН SharedWorker

Ключевое отличие от broadcast-варианта — мультиплексирование транспорта. Каждый стор получает свой
логический канал `${storageType}-${storageName}`, но **все** каналы идут поверх **одного**
SharedWorker на origin:

```typescript
// Оба стора идут через ОДИН SharedWorker,
// изолированные каналом: 'memory-todos' vs 'memory-settings'.
const todos = new MemoryStorage<TodoState>({
  name: 'todos',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [syncSharedWorkerMiddleware({ storageType: 'memory', storageName: 'todos' })],
})

const settings = new MemoryStorage<SettingsState>({
  name: 'settings',
  initialState: { theme: 'light' },
  middlewares: () => [syncSharedWorkerMiddleware({ storageType: 'memory', storageName: 'settings' })],
})
```

> Имя канала — `${storageType}-${storageName}`. Два стора с одинаковой парой делят один канал —
> держите её уникальной на каждый логический стор.

## Что именно синхронизируется

Поведение полностью совпадает с `broadcastMiddleware` и зависит от типа хранилища:

- **MemoryStorage** — полная синхронизация данных. Только что открытая вкладка запрашивает у воркера
  текущее состояние (`requestSync`), засевается им и остаётся в синхроне при каждой записи.
- **LocalStorage / IndexedDB** — только уведомление подписчиков. Сами данные уже синхронизированы
  движком хранилища браузера; middleware лишь просит подписчиков в других вкладках перечитать.

## Фолбэк и SSR

- **Нет SharedWorker?** Транспорт **прозрачно** откатывается на `BroadcastChannel` — межвкладочная
  синхронизация продолжает работать в контекстах без поддержки SharedWorker. Менять код не нужно.
- **SSR / нет браузерных API?** Middleware — **no-op**: нет окна и других вкладок, создание стора не
  падает.

## Все параметры (закомментировано)

Вся поверхность API разом — props одинаковы у обеих фабрик:

```typescript
import { syncSharedWorkerMiddleware } from 'synapse-storage/core'

syncSharedWorkerMiddleware({
  // storageType — тип хранилища. Влияет на стратегию синхронизации:
  //   'memory'     → полная синхронизация данных (requestSync + запись);
  //   'localStorage' / 'indexedDB' → только уведомление подписчиков (данные синхронит браузер).
  //   Вместе со storageName образует ключ канала `${storageType}-${storageName}`.
  storageType: 'memory',   // 'memory' | 'localStorage' | 'indexedDB' | 'worker'

  // storageName — имя логического канала. Держите пару (storageType + storageName)
  //   уникальной на каждый стор, иначе два стора разделят один канал.
  storageName: 'todos',
})
```

## Опции

| Поле | Тип | Описание |
|---|---|---|
| `storageType` | `StorageType` (`'memory' \| 'localStorage' \| 'indexedDB' \| 'worker'`) | Тип хранилища; задаёт стратегию синхронизации. Часть ключа канала. |
| `storageName` | `string` | Имя логического канала. Вместе с `storageType` образует ключ `${storageType}-${storageName}`. |

## Типы

```typescript
import type { Middleware, SyncMiddleware } from 'synapse-storage/core'

// Обе фабрики принимают одни и те же props:
interface SharedStateMiddlewareProps {
  storageType: StorageType   // 'memory' | 'localStorage' | 'indexedDB' | 'worker'
  storageName: string        // вместе с storageType образует ключ канала
}

// syncSharedWorkerMiddleware(props): SyncMiddleware   — Memory / LocalStorage
// sharedWorkerMiddleware(props):     Middleware       — IndexedDB (async)
```

## См. также

- [Middlewares](./middlewares.md) — `broadcastMiddleware` / `syncBroadcastMiddleware`, тот же API без воркера.
- [WorkerCacheStorage](./worker-cache-storage.md) — живой общий кэш **внутри** воркера, а не только уведомления.
- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) — синхронные хранилища для `syncSharedWorkerMiddleware`.
- [IndexedDB](./indexeddb-storage.md) — async-хранилище для `sharedWorkerMiddleware`.
