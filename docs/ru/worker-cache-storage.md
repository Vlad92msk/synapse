# WorkerCacheStorage

> [Назад к оглавлению](./README.md)

`WorkerCacheStorage` — **асинхронное** хранилище (`extends AsyncBaseStorage`, `type: 'worker'`),
данные которого живут внутри **SharedWorker**, а не во вкладке. Оно зеркалит семантику ключей/путей
[MemoryStorage](./memory-storage.md) «ключ-в-ключ» — разница лишь в том, **где** живёт `Map`: это
**живой** in-memory кэш внутри SharedWorker, общий для всех вкладок origin-а. По сути «MemoryStorage,
который видят и другие вкладки».

## Создание

```typescript
import { WorkerCacheStorage } from 'synapse-storage/core'

// Живой кэш между вкладками, живущий внутри SharedWorker
const storage = new WorkerCacheStorage<TodoState>({
  name: 'todo-worker',
  initialState: initialTodoState,
  options: {}, // channelName по умолчанию = config.name
})
await storage.initialize()

// Или через статический .create()
const storage = WorkerCacheStorage.create<TodoState>({
  name: 'todo-worker',
  initialState: initialTodoState,
})
```

API идентичен любому другому асинхронному хранилищу — `await set/get/update/delete`,
`getStateSync()`, подписки. См. [Чтение](./reading-data.md), [Запись](./writing-data.md),
[remove/has/keys](./delete-has-keys.md), [Подписки](./subscriptions.md).

Сторы с одинаковым `channelName` (по умолчанию — `name`) делят один кэш — так две вкладки, или
[API `QueryStorage`](./api-client.md) и его потребитель, попадают на одни и те же данные.

## Живой кэш между вкладками

```typescript
const storage = new WorkerCacheStorage<TodoState>({
  name: 'live-cache',
  initialState: initialTodoState,
  options: { channelName: 'live-cache' },
})
await storage.initialize()

// Записано в одной вкладке — сразу видно другой вкладке, читающей тот же channelName.
await storage.set('filter', 'active')
```

- Возможности: `{ shared: true }`.
- Кэш **живой**: держит текущее состояние и разделяется между вкладками — ровно как MemoryStorage,
  живущий в SharedWorker. Поздно подключившаяся вкладка всегда получает свежий снапшот из воркера.
- Если SharedWorker недоступен (SSR / тесты), транспорт откатывается на in-process `Map` —
  round-trip идентичен, но **без** межвкладочного шеринга (его даёт только настоящий SharedWorker).

> **Нужен офлайн или контроль fetch?** `WorkerCacheStorage` — это **живой кэш между вкладками**, а не
> офлайн-слой: он не ходит в сеть и не переживает полностью закрытую сессию. Для настоящего офлайна /
> контроля сети используйте отдельный рецепт, а не это хранилище:
>
> - [Свой fetch-перехватывающий ServiceWorker](./custom-fetch-service-worker.md) — собственный
>   `sw.js` прозрачно перехватывает `fetch` (precache, офлайн-роутинг, cache-first / network-first /
>   stale-while-revalidate). Он живёт **ниже** `ApiClient` и не связан с его storage.
> - [Кастомный `baseQuery.fetchFn`](./custom-fetch-fn.md) — заменяет то, **КАК** клиент выполняет
>   запрос (auth-retry, метрики, axios или worker-транспорт), а слой кэша/тегов продолжает работать
>   поверх без изменений.

## Инвалидация по тегам (кэш API)

Когда `WorkerCacheStorage` подложен под API [`QueryStorage`](./api-client.md), индекс тегов **не**
входит в общий payload — он **пересобирается при подключении** через `rebuildTagIndex`. Второй
потребитель, присоединяясь к тому же `channelName`, сканирует существующие записи и восстанавливает
свою карту тег → ключи, поэтому инвалидация по тегам продолжает работать между вкладками /
инстансами без прокидывания индекса через порт.

## Грабли и ограничения

1. **Это живой кэш, а не персист.** Состояние живёт в памяти SharedWorker. Оно общее для открытых
   вкладок и переживает перезагрузку вкладки, пока воркер жив, но это **не** офлайн /
   переживающее сессию хранилище. Для этого — рецепты по ссылкам выше.
2. **Значения должны быть structured-clone-совместимыми.** Всё, что пересекает порт воркера,
   подчиняется алгоритму structured-clone — функции, `Symbol`, `Blob`/`Response`/`Headers` и циклы
   через порт не проходят. Храните только простые, клонируемые данные.
3. **Индекс тегов пересобирается, а не передаётся.** Как выше, `rebuildTagIndex` восстанавливает
   индекс тегов API при подключении, а не шлёт его через порт — ждите прохода пересборки при
   присоединении нового потребителя.
4. **Фолбэк SharedWorker тихий, но с деградацией.** Без поддержки SharedWorker транспорт использует
   in-process `Map`: API идентичен, но межвкладочного шеринга нет.
5. **Битый кастомный `workerUrl` НЕ уходит в автофолбэк.** `new SharedWorker(url)` успешен, даже если
   скрипт отдаёт 404 или неверный MIME — ошибка всплывает асинхронно, когда транспорт уже выбрал
   worker-режим. Автофолбэка на этой стадии нет: операции начинают падать по таймауту. Канал пишет
   actionable-предупреждение; убедитесь, что кастомный `workerUrl` отдаётся same-origin как
   `application/javascript`. Не задавайте `workerUrl`, чтобы использовать безопасный inline blob.
6. **Большой начальный `getAll` может упереться в таймаут RPC.** У каждой RPC-операции есть бюджет
   `requestTimeoutMs` (по умолчанию 1000мс). Прогрев очень большого кэша на слабом устройстве может
   его превысить и уронить `initialize()` — увеличьте `options.requestTimeoutMs`.

## Когда брать

- **Живой кэш между вкладками** (общее состояние между вкладками, живущее в воркере) →
  `WorkerCacheStorage`.
- **Офлайн / контроль сети** (данные доступны без сети, перехват fetch) → не это хранилище; см.
  [свой fetch-перехватывающий ServiceWorker](./custom-fetch-service-worker.md) или
  [кастомный `fetchFn`](./custom-fetch-fn.md).
- Просто кросс-табные **уведомления** по существующему стору → это вам не нужно; используйте
  [`sharedWorkerMiddleware`](./shared-worker-middleware.md) / `broadcastMiddleware`.

## Типы

```typescript
import { WorkerCacheStorage } from 'synapse-storage/core'
import type { WorkerStorageConfig, WorkerStorageOptions } from 'synapse-storage/core'

interface WorkerStorageOptions {
  channelName?: string       // по умолчанию: config.name — одинаковый channelName ⇒ общий кэш
  workerUrl?: string | URL   // кастомный скрипт SharedWorker (иначе inline blob)
  requestTimeoutMs?: number  // таймаут одной RPC, по умолчанию 1000 — поднять для большого getAll
}

// WorkerStorageConfig<T> extends AsyncStorageConfig<T> с options?: WorkerStorageOptions
```
