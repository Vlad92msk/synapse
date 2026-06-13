# Changelog

## [4.2.0] - 2026-06-12

### Новое: class-based BL-слой

Четыре тонких публичных класса поверх **неизменных** существующих движков
(`DispatcherCore`, `SelectorModule`, `EffectsModule`) и новая перегрузка сборщика.
Старый API (`createSynapse(config)`, `createDispatcher`, `defineAction`,
`createApiActions`, все операторы) **работает без изменений** — это minor-релиз,
ломающих изменений нет. Обе ветки совместимы в `dependencies` друг друга.

- **`Dispatcher<TState>`** (`synapse-storage/reactive`) — абстрактный класс: экшены
  объявляются как поля через фабрики `this.action` / `this.signal` / `this.apiActions`
  / `this.keyedApiActions` / `this.watcher`. Имя экшена = имя поля (`actionType`
  назначается сборщиком на шаге финализации; standalone — ленивая само-финализация при
  первом dispatch). `this.apiActions(accessor)` возвращает **вызываемую группу**:
  `d.loadPosts(params)` — это init-намерение, `d.loadPosts.loading/.success/.failure/.reset`
  — жизненный цикл (убирает ручное «расплющивание» пятёрок). Dev-проверки: коллизия с
  зарезервированным именем и поле-алиас бросают понятную ошибку.
- **`Selectors<TState>`** (`synapse-storage/core`) — абстрактный класс: селекторы как
  поля через `this.select` / `this.combine` / `this.keyed`, eager (поля сразу настоящие
  `SelectorAPI`). Внешние (cross-store) селекторы — параметры конструктора. `this.keyed`
  даёт один `SelectorAPI` на ключ с кэшем. Класс владеет своим модулем только если создан
  из `storage`; переданный модуль при `destroy()` чистится точечно (`removeSelector`).
- **`Effects<TState, TDispatcher, TExternalDispatchers?>`** (`synapse-storage/reactive`) —
  абстрактный класс: эффекты как поля через `this.effect(fn)`; сервисы и внешние сторы —
  через конструктор, захватываются в замыкание рецепта. `ctx.dispatcher` — инстанс
  class-диспетчера, `ctx.external` — внешние диспетчеры. Опциональный `onDestroy()`.
  Dev-warning о поле-функции, не обёрнутом в `this.effect`.
- **`createSynapse(factory)`** (`synapse-storage/utils`, реэкспорт из корня) — новая
  перегрузка: `typeof arg === 'function'` → ленивый синглтон-handle (`SynapseModule`),
  объект-конфиг → старый путь. Фабрика исполняется один раз при первом `await`/`ready()`,
  а не на импорте (поглощает userland `createFeatureSynapse`). Пайплайн: fail-fast (любая
  ошибка = rejection, никаких тихих частичных инициализаций), LIFO-teardown, `state$`
  присутствует ВСЕГДА, `dispatcher` полностью типизирован. `handle.destroy()` сбрасывает
  мемоизацию — handle пересоздаваемый (HMR/тесты).
- **`resubscribeOnError`** — опция эффекта (`this.effect(fn, { resubscribeOnError: true })`):
  retry с лимитом/бэкоффом вместо терминального `catchError`.
- **`SelectorAPI.$: Observable<T>`** — Observable-вид селектора (emit текущего значения при
  подписке + при каждом реальном изменении). Совместим с `pipe(debounceTime(...))`.
- **React-хуки** (`synapse-storage/react`): `useObservable(source$ | factory, initialValue, deps?)`
  и `useSubscription(factory, deps)` — мост Rx → React на `useSyncExternalStore`.
  `createSynapseCtx` принимает `SynapseModule`-handle (ленивый запуск при первом монтировании
  Provider'а).
- **`toObservable(storage)`** — вынесена в публичный API (`synapse-storage/reactive`).

Все новые символы доступны как из соответствующих entry (`/core`, `/reactive`, `/utils`,
`/react`), так и из корня `synapse-storage`. Отдельный entry `synapse-storage/bl`
**не добавляется**: класс-слой распределён по существующим семантическим entry, а не
вынесен в отдельный бакет.

## [4.1.2] - 2026-06-06

### Исправления

- **`storage.update()` молча терял изменения, когда две ветки стейта стартовали с одной ссылки** — `findChangedPaths` (`state-diff.util.ts`) дедуплицировал обход по одному `oldObj` (`visited = WeakMap<old, boolean>`). Когда в `initialState` два слота шарят один объект (`api: { usersRequest: idle, updateRequest: idle }` — общий `idle`), `structuredClone` в `createLazyClone` схлопывал общую ссылку, и для разных путей `oldValue` указывал на один и тот же объект. После того как `update()` менял только одну ветку (`updateRequest.status: 'loading'`), диффер доходил до уже посещённого `oldObj` и пропускал реально изменившийся путь целиком → `changedPaths.size === 0` → ранний `return`, подписчики не уведомлялись (форма висла в «Сохранение…», статус запроса не обновлялся). Visited-гард переведён на пару `(oldObj, newObj)` (`WeakMap<old, WeakSet<new>>`): один `oldObj`, ведущий к разным `newObj`, больше не схлопывается, обход пропускается только если совпали И old, И new. Циклы по-прежнему обрываются. Поведение при раздельных ссылках не изменилось.

## [4.1.1] - 2026-06-05

### Исправления

- **`Failed to construct 'URL': Invalid URL` — падали все запросы в браузере** — `fetchBaseQuery` строил URL как `new URL(\`${baseUrl}${path}\`)` без base. При относительной базе в браузере (`baseUrl = '/_api'`, `path = '/api/...'`) результат `/_api/api/...` — относительная строка, которую `new URL` с одним аргументом не парсит. Сборка URL вынесена в `buildRequestUrl(path, baseUrl)`: сохраняется конкатенация `baseUrl + path` (а не резолвинг через `new URL(path, baseUrl)`, который отбросил бы префикс базы для абсолютных путей), относительный результат резолвится относительно `window.location.origin` — same-origin и проксирование через rewrites сохраняются. Покрыты кейсы: абсолютный `path`, относительный `path` + абсолютный `baseUrl`, относительный `path` + относительный `baseUrl` (браузер). `buildRequestUrl` экспортируется из пакета.

## [4.1.0] - 2026-06-05

### Исправления

- **`React is not defined`** — `rslib.config.ts` переведён на автоматический JSX-рантайм (`tools.swc.jsc.transform.react.runtime: 'automatic'`). Раньше SWC собирал JSX в классический `React.createElement` / `React.Fragment`, а файлы импортируют только именованные хуки из `react` → в браузере падал `ReferenceError` при рендере любого синапс-обёрнутого компонента. Фикс распространяется на весь пакет.
- **IndexedDB: гонка `Cannot read properties of null (reading 'objectStoreNames')`** — `IndexedDBManager` сериализует схемные операции через очередь (`opQueue` + `enqueue`), а `ensureStoreExists` / `ensureStoresExist` больше не обращаются к `this.db` после `await` (работают с локальной ссылкой). Снимает падение при параллельной инициализации нескольких `ApiClient` на одну БД (общий стор). Дублирующее тело `ensureStoresExist` объединено с `ensureStoreExists` в общий `ensureStoresInternal`.

### Новое

- **`useSelector` без обязательного `withLoading` при `equals`** — добавлена перегрузка `useSelector(selector, options & { withLoading?: false }): T`. Теперь `useSelector(sel, { equals })` возвращает `T` без каста. Полностью обратно совместимо.
- **`useKeyedSliceSelector(selector, key, fallback)`** — хук изоляции ре-рендеров для keyed-map сторов: подписка на весь map, но ре-рендер только при изменении `map[key]` по ссылке. `fallback` обязан быть стабильной ссылкой.
- **`createApiActions` — payload в `init`** — добавлен дженерик `TInitPayload = void`. `init` теперь может принимать и возвращать payload (intent-паттерн: эффект слушает `init` и читает намерение). По умолчанию `void` — обратно совместимо.
- **`ApiStatus`** — экспортируемый const-объект статусов запроса (`Idle`/`Loading`/`Success`/`Error`/`Reset`). Одновременно значение и тип; значения — обычные строковые литералы, поэтому взаимозаменяемы со строками и не ломают существующий код (в отличие от TS `enum`). `ApiRequestState.status` типизирован как `ApiStatus`.
- **`createKeyedApiActions(accessor)`** — keyed-вариант `createApiActions`: статус хранится по ключу в `Record<string, ApiRequestState>`. Все писатели (`init`/`loading`/`success`/`reset`) принимают `key` и возвращают его, `failure` — `{ key, error }`. Для случаев, когда один запрос летит параллельно по нескольким независимым ключам (комменты по таргетам, детали по id, per-row действия, пагинация по секциям).

## [4.0.0-alpha] - 2026-05-25

### Рефакторинг: Sync/Async разделение (8 фаз — все done)

- Новые интерфейсы `IStorageBase<T>`, `ISyncStorage<T>`, `IAsyncStorage<T>` — Memory/LocalStorage полностью синхронные, IndexedDB остаётся async
- Раздельные middleware: `SyncMiddleware` + `SyncMiddlewareModule` / `AsyncMiddleware` + `AsyncMiddlewareModule`
- Sync-версии `storageBatchingMiddleware`, `storageShallowCompareMiddleware`, `broadcastMiddleware`
- Раздельные плагины: `ISyncStoragePlugin` + `SyncStoragePluginModule` / `IAsyncStoragePlugin` + `AsyncStoragePluginModule`
- `BaseStorage` разделён на `SyncBaseStorage<T>` и `AsyncBaseStorage<T>`, общие утилиты (`extractPath`, `findChangedPaths`, `isEqual`, `createLazyClone`) вынесены
- Адаптеры: `MemoryStorage` и `LocalStorage` → `extends SyncBaseStorage`, `IndexedDBStorage` → `extends AsyncBaseStorage`
- Singleton Mixin обновлён для работы с обоими базовыми классами
- `StorageFactory.create()` — type-safe overloads по `config.type`
- `useCreateStorage` — перегрузки для вывода `ISyncStorage<T>` / `IAsyncStorage<T>`
- `useStorageSubscribe` — принимает `IStorageBase<S> | null`, возвращает `R | undefined`
- Обновлены потребители: `QueryStorage`, `createEventBus`, `createSynapse`, `Dispatcher`, exports
- Верификация: `tsc --noEmit` чисто, все примеры homepage работают, middleware/plugins корректны в sync и async

### Аудит кода — Этап 1 (50 замечаний, 13 групп — все done)

**Группа 1 — Quick fixes:**
- IndexedDB `STORAGE_TYPE` исправлен с `'memory'` на `'indexedDB'`
- Удалены `console.log` из middleware и plugin.service
- `setImmediate` → `queueMicrotask` в batching middleware (не существует в браузерах)
- `setValueByPath` — `indexOf` заменён на `reduce` с index (дубли в пути)
- `findActionByType` / `findWatcherByType` — унифицирована логика поиска
- `createDispatcher` — проверка `_type` перед записью

**Группа 2 — Storage lifecycle:**
- `destroy()` корректно работает если storage ещё не ready (флаг `isDestroyed`)
- `getState()` проверяет `ensureReady()`, добавлен приватный `getRawState()` для внутреннего использования
- `SingletonManager.remove()` не вызывает `destroy()` — только удаляет из реестра
- Убран двойной `initializeMiddlewares()` (конструктор + `doInitialize`)

**Группа 3 — Storage middlewares:**
- `shallowCompareMiddleware` — sentinel-объект `VALUE_NOT_CHANGED` вместо мутации возвращаемого значения
- `MiddlewareModule` — `processed` заменён на счётчик глубины (вложенный dispatch работает)

**Группа 4 — Race conditions:**
- `subscribeByKey` — версионирование (инкрементный счётчик при `set()`), проверка актуальности в `.then()`
- `SyncBroadcastChannel.postMessage` — фильтрация `SYNC_RESPONSE` по `targetId`

**Группа 5 — IndexedDB:**
- `doUpdate` — атомарное обновление через одну транзакцию с rollback
- `DBVersionManager` удалён, логика перенесена в `IndexedDBManager.ensureStoresExist()`

**Группа 6 — Selector cache & equality:**
- Удалён `GLOBAL_SELECTOR_CACHE` (утечка при HMR/тестах), используется `localSelectorCache`
- `defaultEquals` → reference equality (`===`) по умолчанию, deep equal — через `options.equals`
- `generateName` → автоинкрементный ID вместо хеша по `toString()`

**Группа 7 — Selector memoization:**
- Убран `cachedState`, каждый `getState` вызывает `source.getState()` напрямую
- `memoizeSelector` для `createCombinedSelector` — поэлементное сравнение массива аргументов (как reselect)

**Группа 8 — Selector lifecycle:**
- `notify()` — очередь, новый вызов ждёт/отменяет предыдущий
- `subscribe` — начальное значение синхронно (убран race condition через микротаск)
- `destroy()` — `clearTimeout` для отложенных `processPendingUpdates`
- Устранён двойной `unsubscribe` в `destroy()` при `refCount <= 1`
- `createCombinedSelector` — `queueMicrotask` вместо `setTimeout(..., 10)`
- `debounceTimer` очищается в unsubscribe combined selector

**Группа 9 — React hooks rewrite:**
- `useStorageSubscribe` и `useSelector` переписаны на `useSyncExternalStore` (no tearing в Concurrent Mode)
- Удалён `SELECTOR_REGISTRY` — хуки подписываются напрямую через `selector.subscribe()`
- `updateComponentState` больше не пересоздаётся каждый рендер
- Selector в `useRef` — убран бесконечный цикл из зависимостей `useEffect`
- Race condition при начальном значении решён (синхронный `getSnapshot`)
- Автоматический re-subscribe при смене ссылки на storage

**Группа 10 — React utilities:**
- `useCreateStorage` — `useState` с ленивой инициализацией вместо `useMemo` с config
- StrictMode — `AbortController` предотвращает двойную инициализацию
- `destroyOnUnmount` в `useRef`, убран из зависимостей `useEffect`
- `createSynapseCtx` — lazy `storeInitPromise` вместо IIFE
- `contextSynapse` — `React.forwardRef` + `hoist-non-react-statics`
- `awaitSynapse` — обёртка методов awaiter для сохранения контекста

**Группа 11 — Dispatcher middleware:**
- `api.dispatch` проходит через полную цепочку middleware
- Middleware цепочка строится один раз при `use()` / `createAction()`, не на каждый dispatch
- `actions$` эмитит action единожды (единственная точка эмита в конце `dispatchFn`)

**Группа 12 — Dispatcher watchers:**
- `createWatcher` — lazy-подписка на storage (при первом subscribe, не при создании)
- `prevValue` инициализируется текущим значением storage
- Race condition при `notifyAfterSubscribe` — `concat` + `defer` для гарантии порядка

**Группа 13 — Dispatcher misc:**
- `executeInWorker` — `clearTimeout` при получении ответа от worker
- Мемоизация в `createAction` — params не оборачиваются в массив, `hasCached` вместо falsy-проверки
- Добавлен `Dispatcher.destroy()` — cleanup watchers, complete `actions$`, сброс state
- `getStateDiff` в logger — guard для null/циклических ссылок, лимит глубины
- Logger middleware — кеширование `prevState` вместо двойного `await getState()`

### Аудит кода — Этап 2 (17 замечаний, 5 волн — все done)

**Волна 1 — Тривиальные фиксы:**
- `window.setTimeout` → `globalThis` в `fetch-base-query.ts` (SSR-совместимость)
- `pluginExecutor` — передаётся `metadata` вместо `context`
- `deepMerge` — добавлен `return target`
- Мёртвый код `processed` / `totalRoots` удалён из IndexedDB

**Волна 2 — Race conditions и утечки:**
- `createWatcher` — флаг `disposed` предотвращает эмит после отписки
- EventBus — подписки хранятся и очищаются при `destroy()`
- `broadcast.middleware` — `.catch()` на `requestSync()`
- `useStorageSubscribe` — логирование ошибок селекторов в dev-режиме

**Волна 3 — Lifecycle и middleware:**
- `EffectsModule.stop()` — вызывает `this.action$.complete()`
- `ofTypesWaitAll` — JSDoc документирует поведение зависания
- `shallowCompare` — кешируется `result` вместо `nextValue`
- `createSynapseAwaiter.destroy()` — флаг `destroyed` предотвращает повторный resolve
- `waitForDependencies` — configurable timeout

**Волна 4 — Storage core:**
- Proxy `extractPath` — задокументированы ограничения, explicit path API
- `update()` — убрано двойное чтение `getRawState()`
- `structuredClone` на каждый `update()` → оптимизация клонирования

**Волна 5 — Архитектурное:**
- Единая стратегия обработки ошибок по всему проекту

### DX-аудит

- `useCreateStorage` возвращает discriminated union: `isReady: true` → `storage: S` (не null)
- `initialState?: T` — если передаёшь, передаёшь полный объект (убран `Partial<T>`)
- Добавлен `reset()` — восстанавливает `initialState`; `clear()` по-прежнему сбрасывает к `{}`
- Перегрузки `useCreateStorage` по типу хранилища: `'memory'`/`'localStorage'` → `ISyncStorage`, `'indexedDB'` → `IAsyncStorage`
- `useStorageSubscribe` принимает `null` storage — возвращает `undefined` пока не ready
- `update()` с Immer-like синтаксисом
- Подписки на вложенные пути: `storage.subscribe((s) => s.user.name, cb)`

## [3.0.16] - 2025-07-25

### ✨ Added

- **Singleton Storage Support**: Ability to create singleton storage instances for reuse across components
- **Storage Factory**: New `StorageFactory` for convenient storage creation
- **React Hook `useCreateStorage`**: New hook for creating storage in React components

### 🛠 Improved

- **Simplified Storage Configuration**: Removed `type` parameter duplication in storage configurations
- **Enhanced TypeScript Support**: Improved type inference and autocompletion

### 📖 Usage Examples

#### Singleton Storage
```typescript
// Component A
const storage1 = new MemoryStorage({
  name: 'shared-data',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.DEEP_MERGE,
    warnOnConflict: true,
  },
  initialState: { count: 0 }
})

// Component B - will get the same instance
const storage2 = new MemoryStorage({
  name: 'shared-data', // Same name
  singleton: {
    enabled: true,
  },
  initialState: { count: 5 } // Will be ignored
})
```

#### Storage Factory
```typescript
const userStorage = StorageFactory.createMemory({
  name: 'user',
  singleton: { enabled: true },
  initialState: { name: '', email: '' }
})

const settingsStorage = StorageFactory.createLocal({
  name: 'settings',
  initialState: { theme: 'light' }
})

// Universal method (with type)
const dynamicStorage = StorageFactory.create({
  name: 'cache',
  type: 'indexedDB',
  initialState: { items: [] }
})
```

#### React Hook `useCreateStorage`
```tsx
function UseSynapseStorageExample() {
  const { storage, isReady } = useCreateStorage<{ notifications: string[] }>({
    type: 'localStorage',
    name: 'notifications',
    initialState: { notifications: [] },
  })

  useEffect(() => {
    if (!isReady || !storage) return

    // Subscribe to a specific field
    const unsubscribe = storage.subscribe(
      (state) => state.notifications,
      (notifications) => {
        console.log('Notifications updated:', notifications)
      },
    )

    return unsubscribe
  }, [isReady, storage])

  const addNotification = async () => {
    if (storage) {
      await storage.update((state) => {
        state.notifications.push(`Notification ${Date.now()}`)
      })
    }
  }

  return (
    <div>
      <button onClick={addNotification}>Add Notification</button>
    </div>
  )
}
```

### 🚨 Breaking Changes

- **Storage Configuration**: Removed `type` parameter from `MemoryStorageConfig`, `LocalStorageConfig`, `IndexedDBStorageConfig`
  - Use specific factory methods or `UniversalStorageConfig` for dynamic type selection

---

## [3.0.15] - 2025-07-18

### 🚨 Breaking Changes

- **createSynapseCtx**: Removed `contextProps` parameter from `contextSynapse` function
  - Use actions within components to set initial state instead
  - Simplified component wrapper signature

### 🐛 Fixed

- **Storage Delete Logic**: Fixed plugin validation in delete operations
- **Cache Invalidation**: Fixed cache invalidation for non-cached API endpoints
- **Memory Leaks**: Improved cleanup in awaiter utilities and context providers

### 📖 Usage Examples

```tsx
// Framework-agnostic usage
import { createSynapseAwaiter } from 'synapse-storage/core'

const awaiter = createSynapseAwaiter(userMediaSynapse)
awaiter.onReady(store => console.log('Ready!', store))
const store = await awaiter.waitForReady()

// React usage
import { awaitSynapse } from 'synapse-storage/react'

const userMediaReady = awaitSynapse(userMediaSynapse, {
  loadingComponent: <Spinner />,
  errorComponent: (error) => <ErrorBoundary error={error} />
})

const MediaComponent = userMediaReady.withSynapseReady(() => {
  // Synapse guaranteed to be ready here
  return <div>Content</div>
})

// Simplified context (no contextProps)
const userMediaCtx = createSynapseCtx(userMediaSynapse, {
  loadingComponent: <div>Loading...</div>
})

const Component = userMediaCtx.contextSynapse(() => {
  const actions = userMediaCtx.useSynapseActions()
  
  useEffect(() => {
    // Set initial state via actions instead of contextProps
    actions.moduleEnter({ selectedType: 'image' })
  }, [])
  
  return <div>Ready!</div>
})
```
---

## [3.0.14] - 2025-06-21

### 🐛 Fixed

- **Logger Middleware**: Fixed issue with dispatcher logger not displaying properly formatted output

---

## [3.0.13] - 2025-06-08

### ✨ Added

- **Enhanced Watcher System**: Added `startWithCurrentValue` option to `createWatcher()` for controlling initial value emission
  - Control whether watchers emit current state value immediately upon subscription
  - Useful for module synchronization and component initialization scenarios
  - Backwards compatible - defaults to `false` for safe behavior

### 🛠 Improved

- **ESM-Only Build**: Migrated to ESM-only distribution for modern JavaScript ecosystem
  - Removed CommonJS build to reduce bundle size and complexity
  - Improved tree shaking and static analysis capabilities
  - Faster builds and smaller library footprint
  - **Breaking Change**: Node.js 14+ required with `"type": "module"` in package.json

### 📖 Usage Examples

```typescript
// Watcher with immediate current value emission
watchCurrentUserProfile: createWatcher({
  type: 'watchCurrentUserProfile',
  selector: (state) => state.currentUserProfile?.user_info,
  shouldTrigger: (prev, curr) => JSON.stringify(prev) !== JSON.stringify(curr),
  startWithCurrentValue: true, // Emit current value on subscription
  meta: { description: 'Sync user profile between modules' },
})

// Watcher for tracking only changes (default behavior)
watchUserActions: createWatcher({
  type: 'watchUserActions', 
  selector: (state) => state.user.lastAction,
  shouldTrigger: (prev, curr) => prev?.id !== curr?.id,
  startWithCurrentValue: false, // Only emit on changes (default)
  meta: { description: 'Track new user actions only' },
})
```

### 🚨 Breaking Changes

- **ESM-Only**: Library now requires modern JavaScript environment
  - Node.js 14+ with ESM support
  - Modern bundlers (Webpack 5+, Vite, Rollup)
  - Update your package.json to include `"type": "module"`

---
---
## [3.0.12] - 2025-06-01

### ✨ Added

- **Storage Status Tracking**: Monitor initialization progress with `onStatusChange()` and `waitForReady()`
- **Dependency Management**: Control synapse initialization order with `dependencies` property
- **EventBus**: New `createEventBus()` utility for decoupled communication between modules
- **Configuration Validation**: Comprehensive validation with detailed error messages

### 🛠 Improved

- Enhanced error handling during storage initialization
- Better TypeScript support and type inference
- Improved cleanup and memory management

### 📖 Usage Examples

```typescript
// Status tracking
const storage = new MemoryStorage(config)
storage.onStatusChange(status => console.log(status.status))
await storage.initialize()

// Dependencies
const synapse = await createSynapse({
  dependencies: [coreSynapse], // Wait for dependencies
  // ... config
})

// EventBus
const eventBus = await createEventBus({ name: 'app-events' })
eventBus.dispatcher.publish({ event: 'USER_UPDATED', data: {...} })
```

---
