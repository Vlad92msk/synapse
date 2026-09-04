# SSR-гидрация Synapse — дорожная карта аудита и доработок

> Чек-лист на будущий аудит. Выжимка из сравнения с TanStack Query
> (см. [`SYNAPSE_VS_TANSTACK_HYDRATION.md`](SYNAPSE_VS_TANSTACK_HYDRATION.md)).
>
> **Текущий статус:** для типового SSR-кейса (первый paint + SEO, JSON-сериализуемое
> состояние, обычный рендер) — продакшен. Пункты ниже поднимают робастность до уровня
> TanStack Query. Делать НЕ обязательно все сразу — приоритеты проставлены.

---

## Приоритет: высокий

### [x] 1. Мердж-по-свежести в `hydrate` (вместо full-replace) — СДЕЛАНО
- **Проблема:** `storage.hydrate(state)` делал `doSet('', state)` — полную замену.
  Если на клиенте уже есть более свежее состояние (повторный seed, клиентская навигация,
  прерванный React-transition) — оно затиралось.
- **Как у TanStack:** обновляет запись, только если `dehydratedAt > dataUpdatedAt`; иначе
  не трогает. Запросы мерджатся, а не заменяются.
- **Что сделано:**
  - метка `__hydratedAt` ставится в `dehydrateModule` (опция `hydratedAt`, дефолт `Date.now()`);
    едет со снапшотом как enumerable-ключ (переживает JSON/RSC), см. `core/storage/utils/hydration-meta.util.ts`;
  - `hydrate` (sync + async) снимает метку (`splitHydrationMeta`, в состояние не протекает),
    сравнивает с `_hydratedAt` последнего применённого и игнорирует снапшот НЕ новее (`<=`);
    немаркированные снапшоты применяются всегда (legacy full-replace);
  - семантика — вся снапшот-гранула целиком (модуль = один объект): применяем целиком или не трогаем.
- **Тесты:** `core/storage/__tests__/hydrate.test.ts` (freshness/legacy/no-leak, все 3 стора),
  `utils/__tests__/dehydrateModule.test.ts` (метка на снапшоте).
- **Файлы:** `core/storage/adapters/{sync,async}-base-storage.service.ts`,
  `core/storage/adapters/storage-core.ts` (`_hydratedAt`), `core/storage/utils/hydration-meta.util.ts`,
  `utils/dehydrateModule.ts`.

### [x] 2. Тесты SSR — СДЕЛАНО
- **Зачем:** «production» = покрыто тестами на крайние случаи.
- **Что покрыто:**
  - no request-bleed: два параллельных `fork()`/рендера с разными снапшотами изолированы —
    `react/__tests__/ssr.server.test.tsx` («нет request bleed», «dehydrate форкает модуль»);
  - seed-before-render: снапшот залит ДО первого рендера (нет mismatch, контент вместо спиннера) —
    `ssr.server.test.tsx` (контент в HTML, не `loading`) + `ssr.client.test.tsx` (нет hydration-mismatch);
  - async-store путь (IndexedDB): не готов синхронно → сводится к гейту загрузки, потом контент —
    `react/__tests__/ssr.async-gate.test.tsx` (через `awaitSynapse`);
  - идемпотентность засева (useState init + useEffect): первый маунт сеет ровно один `hydrate` —
    `ssr.client.test.tsx` («первый маунт сеет ровно один раз»);
  - прогрев main handle: `getSnapshot()`/`isReady()` после `ready({withEffects:false})` отдают READY —
    `ssr.server.test.tsx` («прогрев main handle») + `utils/__tests__/createSynapseAwaiter.ssr.test.ts`;
  - concurrent-рендер (React 18 transitions): маунт второго провайдера на общий стор внутри
    `startTransition` не клобберит и не роняет render-phase-варнинг — `ssr.client.test.tsx`
    («concurrent-маунт в startTransition», «кросс-роутный маунт не триггерит setState»).
- **Файлы:** `react/__tests__/{ssr.server,ssr.client,ssr.async-gate}.test.tsx`,
  `core/storage/__tests__/hydrate.test.ts`, `utils/__tests__/dehydrateModule.test.ts`.

### [x] 7. Partial / per-key hydrate для keyed-кэш-модулей — СДЕЛАНО
- **Проблема:** `hydrate` применяет снапшот как единую гранулу — `doSet('', payload)`, полная
  замена объекта модуля (пункт 1 гейтит по свежести, но НЕ меняет гранулярность). Для модуля-
  «одного объекта» это корректно, но часть модулей — это **keyed-кэш** (`Record<key, …>`, как
  кэш запросов в React Query), где ключи наполняются из РАЗНЫХ источников. Серверный снапшот
  несёт лишь часть ключей; full-replace затирает живые клиентские ключи, которых в снапшоте нет.
  Это ровно нерешённая ветка из пункта 1 («семантика для кэша по ключам, а не одного объекта»).
- **Реальный потребитель (sn_client):** comments-стор keyed по target (`byTarget`/`countByTarget`/
  `cursorByTarget`/…), ключи `post:*` (из снапшота ленты) соседствуют с живыми `media:*` (треды
  на медиа, общие с плеером/галереей, только клиентские). Библиотечный `dehydratedState` затёр бы
  `media:*`, поэтому засев идёт ручным пер-ключевым мерджем (`Object.assign` по ключам снапшота)
  в `useEffect` — свой экшен `seedFromServer` вместо `dehydratedState`. Воркэраунд корректен, но
  дублирует то, что просится в либу. Закрытие этого пункта позволит убрать `FeedCommentsSeed` и
  сеять комменты штатным `dehydratedState`, как посты.
- **Как у TanStack:** гидрация — это мердж по записям кэша (`queryKey`), а не замена всего кэша;
  запись обновляется индивидуально (с учётом свежести из пункта 1).
- **Что сделано:**
  - режим partial-hydrate: `hydrateStrategy: 'merge'` — shallow-мердж снапшота по ВЕРХНЕУРОВНЕВЫМ
    ключам в существующий объект, ключи вне снапшота не трогаются; `'replace'` остаётся дефолтом;
  - выбор режима — на уровне стора (флаг `hydrateStrategy` в `BaseStorageConfig`), не пер-вызов;
  - свежесть по ключу: при `merge` метки хранятся в `_hydratedAtByKey` (отдельно от whole-snapshot
    `_hydratedAt` у `replace`) — устаревший ключ пропускается, свежие в том же снапшоте применяются;
  - нотификация только по реально изменившимся ключам (сравнение `isEqual` old/new по ключу);
    расчёт вынесен в чистую `planHydration` (общая для sync/async), нотификация — `notifyHydration(state, changedKeys)`.
- **Тесты:** `core/storage/__tests__/hydrate.test.ts` (блок «hydrate merge-стратегия», все 3 стора):
  merge не трогает ключи вне снапшота; свежесть по ключу (устаревший не блокирует свежий);
  нотификация только изменённых ключей.
- **Гранулярность:** реализованный `merge` — shallow по ВЕРХНЕУРОВНЕВЫМ ключам (`applied[key] =
  payload[key]`). Закрывает «один объект» и «плоский keyed-кэш» (ключи кэша = верхний уровень стора).
- **Вложенный keyed-кэш НЕ покрываем сознательно:** в sn_client comments target-ключи лежат на
  ВТОРОМ уровне (`byTarget['media:*']`). Строить deep/nested-record merge в либе — переусложнение:
  ни один мейнстрим (TanStack/Zustand/RTK) так не делает, т.к. их кэш ПЛОСКИЙ (запись на ключ).
  Вместо этого — маленький консьюмер-воркэраунд (`FeedCommentsSeed`/`seedFromServer`, двухуровневый
  мердж) ОСТАЁТСЯ как есть. Стратегическая альтернатива (слайс-на-сущность вместо вложенных ключей)
  вынесена в отдельный аудит — см. `tasks/SLICE_FAMILY_AUDIT.md`.
- **Файлы:** `core/storage/utils/hydration-meta.util.ts` (`planHydration`),
  `core/storage/adapters/{sync,async}-base-storage.service.ts`, `core/storage/adapters/storage-core.ts`
  (`_hydratedAtByKey`), `core/storage/storage.interface.ts` (`hydrateStrategy` в `BaseStorageConfig`).

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
