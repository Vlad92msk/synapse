# Задача — SSR-совместимый React-биндинг synapse (server-render засеянных сторов)

> Скоуп: пакет `packages/synapse` (React-слой + awaiter). Storage-слой менять почти не нужно —
> примитивы SSR там уже есть. Это библиотечная задача, не про конкретного потребителя.

## 1. Проблема (зафиксировано по коду)

`createSynapseCtx` (`src/react/utils/createSynapseCtx.tsx`) делает фич-синапсы **принципиально
не серверно-рендеримыми**, даже когда данные уже на руках, по трём независимым причинам:

1. **Awaiter всегда уводит резолв в микротаску.**
   `createSynapseAwaiter` (`src/utils/createSynapseAwaiter.ts:70-75`) резолвит стор только внутри
   `async`-IIFE: `await Promise.resolve(synapseStorePromise)` + `await storage.waitForReady()`.
   На синхронном серверном проходе `getStoreIfReady()` всегда `undefined`, хотя для Memory-стора
   данные доступны синхронно (`storage.getStateSync()`, `storage.initStatus.status === READY`).

2. **Гейт построен на `useState`/`useEffect`.**
   `contextSynapse` (`createSynapseCtx.tsx:70-98`): initial state = `getStoreIfReady()` (на сервере
   `undefined` из-за п.1), а синхронизация — только в `useEffect`, который на сервере не запускается.
   Итог: сервер всегда рендерит `loadingComponent`, контент в HTML не попадает (нет SEO, нет
   мгновенного первого кадра из server-state).

3. **Awaiter — синглтон уровня модуля.**
   `let awaiter` (`createSynapseCtx.tsx:32`) живёт в замыкании фабрики → на сервере состояние
   **течёт между запросами** (request bleed): данные одного пользователя могут попасть другому.
   Это корректность/безопасность, а не только SSR.

Что **уже готово** в storage-слое (не дорабатывать, опираться):
- `IStorageBase.getStateSync()` — синхронное чтение для любого типа стора.
- `IStorageBase.initStatus.status` (`StorageStatus.READY` и т.д.) — синхронный статус.
- `ISyncStorage.hydrate(state)` / `IAsyncStorage.hydrate(state)` — засев снапшота; вызванный
  **до** `initialize()`, не перезатирается `initialState` (`storage.interface.ts:124-131`).
  Это и есть готовый dehydrate/hydrate-примитив.

## 2. Цель

Дать React-биндингу режим, в котором:
- на сервере стор создаётся **per-request**, синхронно сеется server-снапшотом и **рендерит
  children в HTML** (без `loadingComponent`-гейта) для синхронно-готовых (Memory/LocalStorage) сторов;
- на клиенте тот же снапшот синхронно гидрируется **до первого рендера** → идентичный HTML →
  нет hydration mismatch; дальше init/мутации/догрузка — на клиенте;
- эффекты потребителя (`mountedEffect` и пр.) **не исполняются на сервере**.

Для async-сторов (IndexedDB) серверного рендера контента нет — поведение остаётся прежним
(гейт `loadingComponent`), но без request-bleed.

## 3. Предлагаемый публичный API (верхний уровень)

Минимально-инвазивно, поверх существующего `createSynapseCtx`:

```ts
const PostsSynapse = createSynapseCtx(postsModule, {
  loadingComponent,
  ssr: true, // включить серверный рендер засеянных sync-сторов
})

// СЕРВЕР (RSC): собрать снапшот любым контуром добычи данных (generated requests и т.п.)
//   и сериализовать. Самый дешёвый путь — без отдельного API: hydrate + getStateSync.
const dehydrated = await PostsSynapse.dehydrate({ initialState: feed })
//   → создаёт per-request стор, hydrate(feed), возвращает сериализуемый снапшот.

// КЛИЕНТ: снапшот приезжает пропом и синхронно сеется ДО первого рендера
<PostsSynapse.Provider dehydratedState={dehydrated}>
  <PostsFeed />
</PostsSynapse.Provider>
```

Поверхность, которую добавляем/меняем:
- `createSynapseCtx(module, { ssr?: boolean, loadingComponent? })` — флаг `ssr`.
- `dehydrate(opts?)` — серверный помощник: per-request стор + `hydrate` → сериализуемый объект
  (по сути обёртка над уже существующими `hydrate` + `getStateSync`).
- `contextSynapse`/Provider принимает `dehydratedState` и синхронно гидрирует стор до рендера.
- Хуки (`useSynapseStorage/Selectors/Actions/State$`) — без изменений сигнатур.

## 4. Внутренние изменения

1. **Sync-fast-path в `createSynapseAwaiter`.** Если вход — уже готовый synapse (не thenable)
   и `storage.initStatus.status === READY` (или sync-тип), выставить `store`/`status='ready'`
   **синхронно в теле функции**, до возврата, чтобы `getStoreIfReady()` отдавал стор на первом
   синхронном рендере. Async-ветка (IndexedDB/pending) сохраняется как есть.

2. **Per-request изоляция (ключевое архитектурное решение).** Убрать синглтон-`awaiter` уровня
   модуля для серверного пути: awaiter/стор должны жить в пределах одного render-tree
   (создание в Provider через `useState`/`useRef`, либо явный per-request instance). На клиенте
   сохранить текущую синглтон-семантику (или унифицировать — см. «Открытые вопросы»).

3. **SSR-гейт в `contextSynapse`.** При `ssr:true` и синхронно-готовом сторе рендерить children,
   а не `loadingComponent`. `useEffect`-синхронизация остаётся для async-дозагрузки на клиенте.

4. **Глушение эффектов на сервере.** Гарантировать, что подписки/`mountedEffect` потребителя не
   стартуют на сервере (эквивалент `enableStaticRendering` в MobX). Проверить, что биндинг не
   дёргает фабрику/`init` синхронно на сервере для async-сторов.

## 5. Критерии приёмки

- Memory-синапс с `ssr:true`, засеянный через `dehydrate`, рендерит контент в серверном HTML
  (проверяемо `renderToString`).
- Клиентская гидрация тем же снапшотом не даёт hydration mismatch.
- Нет request-bleed: два параллельных серверных рендера с разными снапшотами изолированы (тест).
- Async-сторы (IndexedDB) не ломаются: прежний гейт, без серверного краша.
- Обратная совместимость: без `ssr` всё работает как раньше.
- Тесты на awaiter sync-path и на per-request изоляцию; типы и сборка пакета чисты.

## 6. Прецеденты (это стандартный паттерн, не изобретение)

Все зрелые стор-библиотеки решают ровно это и одинаково:
- **Redux**: per-request `createStore(preloadedState)` → render → сериализовать `getState()` в
  `window.__PRELOADED_STATE__` → клиент создаёт стор с тем же preloaded state.
- **TanStack Query**: `dehydrate(client)` → `<HydrationBoundary state>`; свежий `QueryClient`
  на каждый запрос (явно запрещён глобальный на сервере).
- **Apollo Client**: `cache.extract()`/`restore()`; `makeClient` per request.
- **Zustand**: «store factory + React Context», запрет module-level стора на сервере (request bleed).
- **Jotai**: `useHydrateAtoms` — синхронный засев атомов из server-пропсов в рендере.
- **MobX (mobx-state-tree)**: `enableStaticRendering(true)` + `applySnapshot`.

Общие инварианты у всех: (а) per-request стор, (б) синхронный засев **до** рендера,
(в) сериализуемый dehydrate/hydrate, (г) никаких сайд-эффектов на сервере. Наш storage-слой уже
даёт (б)+(в) (`hydrate`/`getStateSync`); добиваем (а)+(г) в React-биндинге.

## 7. Открытые вопросы (решить в начале)
- Унифицировать ли жизненный цикл awaiter (всегда per-tree) или развести server/client пути?
  Per-tree-везде проще и безопаснее, но меняет нынешнюю синглтон-семантику на клиенте.
- Нужен ли отдельный `dehydrate`-помощник, или достаточно задокументировать `hydrate`+`getStateSync`
  и оставить сбор снапшота потребителю.
- Поддерживаем ли streaming SSR (Suspense) сейчас или только классический `renderToString`.
