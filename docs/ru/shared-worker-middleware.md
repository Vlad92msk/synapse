# SharedWorkerMiddleware

> [Назад к оглавлению](./README.md)

`sharedWorkerMiddleware` / `syncSharedWorkerMiddleware` синхронизируют состояние хранилища между
вкладками через **SharedWorker**. Это прямое зеркало [`broadcastMiddleware`](./middlewares.md):
та же роль, та же сигнатура — отличается только транспорт. Там, где `broadcastMiddleware`
использует `BroadcastChannel`, `sharedWorkerMiddleware` гоняет сообщения через один общий для всех
вкладок origin-а SharedWorker.

Как и все middleware, подключается при создании стора — в поле `middlewares`.

## Что импортировать

Есть две фабрики с идентичной сигнатурой:

- **`syncSharedWorkerMiddleware`** — для синхронных хранилищ (`MemoryStorage`, `LocalStorage`).
- **`sharedWorkerMiddleware`** — для асинхронного `IndexedDBStorage` (и `WorkerCacheStorage`).

```typescript
import { MemoryStorage, syncSharedWorkerMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'shared-worker-demo',
  initialState: { todos: [], filter: 'all' },
  middlewares: () => [
    syncSharedWorkerMiddleware({
      storageName: 'shared-worker-demo',
      storageType: 'memory',
    }),
  ],
})
await storage.initialize()

// Изменения синхронизируются между вкладками
storage.update((s) => { s.todos.push({ id: 't1', title: 'Из другой вкладки', done: false }) })
```

Сигнатура та же `{ storageType, storageName }`, что и у `broadcastMiddleware` — замена одного на
другое делается в одну строку.

## Что синхронизируется

Поведение полностью совпадает с `broadcastMiddleware`:

- **MemoryStorage** — полная синхронизация данных. Только что открытая вкладка запрашивает у
  воркера текущее состояние (`requestSync`) и засевается им, затем остаётся в синхроне при каждой
  записи.
- **LocalStorage / IndexedDB** — только уведомление подписчиков. Сами данные уже синхронизированы
  движком хранилища браузера; middleware лишь просит подписчиков других вкладок перечитать.

## N сторов через ОДИН SharedWorker

Ключевое отличие от `broadcastMiddleware` — мультиплексирование транспорта. Каждый стор получает
свой логический канал с именем `${storageType}-${storageName}`, но **все** каналы
мультиплексируются поверх **одного** SharedWorker на origin. Десять сторов во вкладке не поднимают
десять воркеров — они делят один, а сообщения разбираются по имени канала.

```typescript
// Оба стора ниже идут через ОДИН SharedWorker,
// изолированные своим каналом: 'memory-todos' vs 'memory-settings'.
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

> Имя канала — `${storageType}-${storageName}`. Два стора с одинаковыми
> `storageType` + `storageName` делят один канал — держите пару уникальной на каждый логический стор.

## Фолбэк и SSR

- **Нет SharedWorker?** Транспорт прозрачно откатывается на `BroadcastChannel`, поэтому
  межвкладочная синхронизация продолжает работать в браузерах/контекстах без поддержки SharedWorker.
- **SSR / нет браузерных API?** Middleware — no-op: нет окна, нет другой вкладки для синхронизации,
  создание стора не падает.

## Что когда брать

- **`broadcastMiddleware`** — простой дефолт. Один `BroadcastChannel` на стор, без воркера.
  Годится для небольшого числа сторов.
- **`sharedWorkerMiddleware`** — когда синхронизируете **много** сторов и хотите мультиплексировать
  их через один SharedWorker вместо множества независимых каналов, или когда у вас уже поднят
  SharedWorker и хочется его переиспользовать. Семантика между вкладками идентична.

Для **живого общего кэша** (не только уведомлений), живущего внутри самого воркера, см.
[WorkerCacheStorage](./worker-cache-storage.md).

## Типы

```typescript
import type { Middleware, SyncMiddleware } from 'synapse-storage/core'

// Обе фабрики принимают одни и те же props:
interface SharedWorkerMiddlewareProps {
  storageType: StorageType   // 'memory' | 'localStorage' | 'indexedDB' | string
  storageName: string        // вместе с storageType образует ключ канала
}

// syncSharedWorkerMiddleware(props): SyncMiddleware   — Memory / LocalStorage
// sharedWorkerMiddleware(props):     Middleware       — IndexedDB (async)
```
