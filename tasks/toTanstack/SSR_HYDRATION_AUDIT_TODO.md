# SSR-гидрация Synapse — дорожная карта аудита и доработок

> Чек-лист на будущий аудит. Выжимка из сравнения с TanStack Query
> (см. [`SYNAPSE_VS_TANSTACK_HYDRATION.md`](SYNAPSE_VS_TANSTACK_HYDRATION.md)).
>
> **Текущий статус:** для типового SSR-кейса (первый paint + SEO, JSON-сериализуемое
> состояние, обычный рендер) — продакшен. Пункты ниже поднимают робастность до уровня
> TanStack Query. Делать НЕ обязательно все сразу — приоритеты проставлены.

---

## Приоритет: высокий

### [ ] 1. Мердж-по-свежести в `hydrate` (вместо full-replace)
- **Проблема:** `storage.hydrate(state)` делает `doSet('', state)` — полную замену.
  Если на клиенте уже есть более свежее состояние (повторный seed, клиентская навигация,
  прерванный React-transition) — оно затирается.
- **Как у TanStack:** обновляет запись, только если `dehydratedAt > dataUpdatedAt`; иначе
  не трогает. Запросы мерджатся, а не заменяются.
- **Что сделать:**
  - добавить опц. метку времени снапшота (напр. `__hydratedAt`) в `dehydrateModule`;
  - в `hydrate` (или новом `hydrateMerge`) сравнивать метки и не затирать более свежее;
  - решить семантику для full-replace состояния (модуль = один объект, а не кэш по ключам).
- **Файлы:** `core/storage/adapters/sync-base-storage.service.ts`, `utils/dehydrateModule.ts`.

### [ ] 2. Тесты SSR
- **Зачем:** «production» = покрыто тестами на крайние случаи.
- **Что покрыть:**
  - no request-bleed: два параллельных `fork()` не видят данные друг друга;
  - seed-before-render: снапшот залит ДО первого рендера (нет mismatch, нет спиннера в HTML);
  - async-store путь (IndexedDB): `ssr:true` корректно сводится к гейту загрузки;
  - идемпотентность повторного `seedHydration` (useState init + useEffect);
  - прогрев main handle: `getSnapshot()`/`getStoreIfReady()` на сервере отдают READY-стор;
  - concurrent-рендер (React 18 transitions/Suspense) — нет клобберинга.
- **Файлы:** `utils/*`, `react/utils/createSynapseCtx.tsx`.

---

## Приоритет: средний

### [ ] 3. Подключаемая сериализация (`serialize`/`deserialize`)
- **Проблема:** опора на plain-JSON через RSC-границу. `Date`/`Map`/`Set`/`BigInt`/`undefined`
  в сторе теряют точность или ломаются.
- **Как у TanStack:** `serializeData`/`deserializeData` (superjson-совместимо).
- **Что сделать:** хук трансформера в `dehydrateModule` (на дегидрации) и в `seedHydration`/
  `hydrate` (на гидрации).
- **Файлы:** `utils/dehydrateModule.ts`, `react/utils/createSynapseCtx.tsx`.

### [ ] 4. Эргономика мульти-модульных страниц
- **Проблема:** один `dehydratedState` на один провайдер → passthrough-проводка нескольких
  снапшотов (напр. посты + комменты разводятся вложенностью провайдеров).
- **Как у TanStack:** одна `<HydrationBoundary state>` поднимает кэш всех запросов сразу.
- **Что сделать:** контейнер/способ передать карту снапшотов `{ moduleKey: snapshot }` на
  несколько провайдеров без ручной проводки на каждый.
- **Файлы:** `react/utils/createSynapseCtx.tsx` (+ возможен новый компонент-boundary).

---

## Приоритет: низкий

### [ ] 5. Переименовать аргумент `dehydrate({ initialState })`
- **Проблема:** в `createSynapseCtx.dehydrate(opts?: { initialState })` аргумент семантически
  = серверные данные под запрос, а не статический `initialState` модуля → конфляция понятий.
- **Что сделать:** переименовать в `serverState`/`preloadedState` (с deprecated-алиасом).
- **Файл:** `react/utils/createSynapseCtx.tsx`.

### [ ] 6. (Опц.) Streaming SSR / dehydrate pending-promise
- **Проблема/паритет:** TanStack умеет дегидрировать in-flight promise (streaming/RSC-prefetch)
  с редакцией ошибок. Synapse отгружает только разрешённые снапшоты.
- **Когда делать:** только если нужен RSC-streaming. Для большинства приложений — не требуется.

---

## Что НЕ требует доработки (сделано корректно)
- Изоляция запроса через `fork()` (per-request стор).
- `ready({ withEffects: false })` на сервере — RxJS-эффекты не стартуют и не «висят».
- Прогрев основного (синглтон) handle при `ssr: true` — закрыл баг «лишнего клиентского запроса».
- Sync fast-path (`resolveSyncReady` / `getStoreIfReady`) + seed в ленивом `useState` — снапшот
  заливается синхронно ДО первого рендера.
- SSR-гейт (`if (!store) loadingComponent`) — контент в HTML вместо спиннера при `ssr:true`.
- Поддержка sync (Memory/LocalStorage) и async (IndexedDB) сторов.
