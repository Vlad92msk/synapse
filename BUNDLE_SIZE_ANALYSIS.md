# Вес synapse-storage: tree-shaking, сценарии использования, сравнение с конкурентами

> Дата замера: 2026-10-04 · synapse-storage **6.2.0** · все цифры получены скриптом
> [`scripts/bundle-size`](scripts/bundle-size/measure.mjs), сырые результаты (min / gzip / brotli по всем
> бандлерам + состав каждого бандла по файлам) — [`scripts/bundle-size/results/report.md`](scripts/bundle-size/results/report.md)
> и `results.json`.
>
> **Статус (7.0.0, не опубликована):** tree-shaking исправлен (§2.3), `rxjs` и `react` стали действительно
> опциональными (§7, п.3/5). Ниже §0 — актуальные цифры 7.0.0; §1–§6 — исходный анализ на 6.2.0 (колонки
> «после фикса» там = 6.2.1, промежуточный шаг). Пересчитать: `yarn size` / `yarn size:full` (§9).

## 0. Итог после 7.0.0 (min+gzip KB, rolldown / Vite 7+)

| Сценарий | npm 6.2.0 | **7.0.0** | rxjs |
|---|--:|--:|:-:|
| `MemoryStorage` | 15.4 | **7.1** | не нужен |
| `IndexedDBStorage` | 17.7 | **9.4** | не нужен |
| `ApiClient` | 15.4 | **6.9** | не нужен |
| `Dispatcher` | 13.1 | **3.1** | не нужен |
| `MemoryStorage` + `Selectors` | 17.2 | **9.2** | не нужен |
| `MemoryStorage` + `Selectors` + `useSelector` | 17.3 | **9.3** | не нужен |
| Модуль `createSynapse` (storage + selectors + dispatcher), без эффектов | 24.3 | **12.8** | не нужен |
| …то же + `createSynapseCtx` + `useSelector` | 25.3 | **13.8** | не нужен |
| Приложение без rxjs: модуль + Ctx + `ApiClient` + API-хуки + `LocalStorage` | 32.8 | **21.1** | не нужен |
| Модуль + `Effects` + `ofType` | 24.4 | **20.9** | нужен |
| Типичное приложение с эффектами | 34.3 | **30.8** | нужен |
| Весь корень `synapse-storage` (без `/react`, `/reactive`) | — | **30.9** | не нужен |
| Всё: корень + `/react` + `/reactive` | 43.0 | **43.9** | нужен |

Что изменилось архитектурно: корень `synapse-storage` — framework-agnostic ядро без `rxjs`/`react`; React —
`synapse-storage/react`, эффекты и rxjs-операторы — `synapse-storage/reactive`. Потоки ядра (`selector.$`,
`dispatcher.action$`, вотчеры, `state$`) — лёгкие interop-потоки (`subscribe` + `Symbol.observable`), в rxjs —
через `toObservable(x)`. Путь с эффектами подорожал на ~0.7 KB (interop-мост) — цена rxjs-free ядра.

**Реальное приложение (sn_client, Next 16 / Turbopack, 2026-10-04):** First Load JS gzip уменьшился на
**6.7–8.0 kB** на роут (`(app)/*` 681–692 → 674–686 kB; `(content)` 449–459 → 441–451 kB). Скромно и ожидаемо:
sn_client сам плотно использует rxjs в эффектах, выигрыш только от tree-shaking библиотеки; у проектов без
rxjs/react он больше. Оговорка по методике: Next 16 + Turbopack не печатает First Load JS в `next build` —
считать по `entryJSFiles` из `.next/server/app/**/page_client-reference-manifest.js` + `rootMainFiles` из
`.next/build-manifest.json`.

Сравнение по ступеням для rxjs-free сценариев: модуль без эффектов **12.8 KB** против RTK (полный core) 11.8 /
effector 8.1; приложение без rxjs **21.1 KB** против RTK + react-redux + RTK Query **24.8** и zustand + react-query
**12.1** (без слоя бизнес-логики и HTTP-клиента).

## TL;DR

1. **Tree-shaking у нас сейчас работает плохо.** Импорт одного `MemoryStorage` из `synapse-storage` тянет
   **11–24 KB gzip** (в зависимости от бандлера) вместо **7 KB**: в бандл попадают Dispatcher, Effects,
   `createSynapse`, WorkerChannel (15 KB min), middleware синхронизации вкладок и **rxjs**, хотя MemoryStorage
   rxjs не использует. Причина — в `package.json` нет `"sideEffects": false`, плюс несколько модулей с
   top-level кодом, который бандлеры не могут доказуемо выбросить. **Лечится одной строкой** в `package.json`
   (проверено на том же `dist`, см. §2) — после неё вес любого сценария одинаков во всех бандлерах и
   совпадает с импортом из подпутей.
2. **Полный пакет (максимум) — ~43 KB gzip**, из них ~6 KB — rxjs. Это то, что видит bundlephobia и бейдж в README,
   и то, на что ссылаются «слишком тяжёлая библиотека». Реальное приложение весь пакет не тянет.
3. **Сценарии (после фикса, Vite/rolldown, gzip):** хранилище — 7 KB; + React-хуки — 7.3 KB; + селекторы — 11 KB;
   ApiClient — 7 KB; ApiClient + хранилище + хуки — 14 KB; полный бизнес-модуль (`createSynapse`: storage +
   selectors + dispatcher + effects) — 20 KB; типичное приложение со всем этим + API + LocalStorage — **30 KB**.
4. **Против конкурентов:** на «голом сторе» мы проигрываем всем (zustand 0.3 KB, redux 1.1 KB) — и это
   ожидаемо, это не наш сценарий. Начиная с уровня «стор + API + side effects» мы **легче эквивалентных
   стеков**: RTK + RTK Query + react-redux — 24.8 KB, + redux-observable + rxjs + redux-persist — 35.7 KB против
   наших 28–30 KB за сопоставимый (и в части API/персиста/SSR — более широкий) набор. zustand + react-query
   (12 KB) легче нас, но не даёт слоя бизнес-логики, персиста в IndexedDB, гидрации и т.д.

---

## 1. Методика

**Что меряем.** Для каждого сценария генерируется «код потребителя»: импорт нужных экспортов и
`globalThis.__keep = [...]`, чтобы бандлер не выкинул их как неиспользуемые (ровно как приложение,
которое эти экспорты вызывает). Пакет synapse-storage ставится в стенд из `packages/synapse/dist` +
`package.json` — побайтно то, что приходит потребителю из npm.

**Бандлеры** (все в production-режиме, минификация, `process.env.NODE_ENV = "production"`):

| Бандлер | Кого представляет |
|---|---|
| rolldown 1.2 | Vite 7+/8 (production-сборка) — **основная колонка в этом документе** |
| rollup 4 + terser | Vite ≤ 6, библиотечные сборки |
| webpack 5 + terser | Next.js (webpack-режим), CRA, кастомные конфиги |
| esbuild 0.28 | esbuild/tsup-приложения; самый консервативный к side effects |

**Правила честности.**
- `react` / `react-dom` / `react/jsx-runtime` — external для всех: это общая база React-приложения.
- `rxjs` **считается** (у нас это peer-зависимость, которую потребитель обязан поставить, если пользуется
  селекторами/диспетчером/эффектами). Отдельно показан «собственный код без rxjs».
- Из каждой цифры вычтен вес «пустого» бандла соответствующего бандлера (его рантайм).
- Единица — KB = 1024 байта. Основная метрика — **min+gzip** (gzip level 9), как у bundlephobia.
  brotli — в сыром отчёте (обычно на 8–12 % меньше gzip).

**Повторить:**

```bash
cd packages/synapse && yarn build
cd ../../scripts/bundle-size && npm i && npm run measure          # всё (≈1–2 мин)
npm run measure -- --only=syn-memory,zustand,redux                 # выборочно
```

Версии всех замеренных пакетов записаны в конце `results/report.md`.

---

## 2. Tree-shaking: диагноз

### 2.1. Симптом

Один и тот же `MemoryStorage`, gzip KB:

| Как импортирован | esbuild | rollup | rolldown (Vite 7+) | webpack 5 |
|---|--:|--:|--:|--:|
| `import { MemoryStorage } from 'synapse-storage'` — **сейчас** | 23.6 | 11.4 | 15.4 | 15.4 |
| `import { MemoryStorage } from 'synapse-storage/core'` — сейчас | 11.7 | 11.4 | 11.4 | 11.4 |
| любой из двух + `"sideEffects": false` в package.json | **7.2** | **7.0** | **7.1** | **7.1** |

То есть сейчас пользователь, взявший одно хранилище, платит от **+60 % до +230 %** сверху. Аналогично
для ApiClient (7 → 11–24 KB), Dispatcher (7.5 → 12–17 KB) и т.д. Чем меньше сценарий, тем сильнее переплата;
на полном импорте разницы нет (там всё и так используется).

Что попадает в бандл «MemoryStorage» сейчас (esbuild): `worker-channel.util` (15 KB min), `shared-state.factory`,
`broadcast.util`, `dispatcher.base/module`, `effects.module`, `createSynapse/syncModule`, заглушки всех хуков —
и **rxjs + tslib (24 KB min)**. Ничего из этого MemoryStorage не нужно.

### 2.2. Причины

1. **В `packages/synapse/package.json` нет `"sideEffects": false`.** Без этого поля бандлер обязан исполнить
   каждый модуль, который реэкспортирует barrel (`index.js` → `export * from './api' …`), и сохранить всё,
   что он не может доказать «чистым». С полем — модули без используемых экспортов отбрасываются целиком.
   Это главная причина; одна строка в `package.json` даёт всю разницу из таблицы выше.
2. **Модули с top-level кодом, который бандлер не считает чистым** (найдены прогоном каждого файла `dist`
   через esbuild с tree-shaking; без п.1 они могут попасть в бандл при любом импорте из корневого barrel — esbuild держит все, rollup/rolldown/webpack часть):
   | Файл | Что удерживается | Последствие |
   |---|---|---|
   | `core/storage/middlewares/{broadcast,sync-broadcast,shared-worker,sync-shared-worker}.middleware.ts` | `export const x = createSharedStateMiddleware({...})` — вызов фабрики на верхнем уровне без `/*#__PURE__*/` | тянет `shared-state.factory`, `broadcast.util`, **`worker-channel.util` (15 KB min)** |
   | `utils/createSynapse/createSynapse.ts` | `createSynapse.of = function …` — присваивание свойства функции | тянет `syncModule` → весь `reactive` → **rxjs** |
   | `reactive/dispatcher/dispatcher.base.ts` | класс с вычисляемым ключом метода `[FINALIZE]()` (Symbol) — esbuild считает вычисление ключа потенциальным side effect (проверено на минимальном примере) | класс Dispatcher (3.8 KB min) + `dispatcher.module` + rxjs `Subject`/`share` |
   | `_utils/logger-console.util.ts` | `const x = globalThis.console` (чтение свойства глобала) | безвредно, ~25 байт |
3. **rollup/rolldown/webpack умнее esbuild**, поэтому у них переплата меньше (11–15 KB против 24), но
   и они не отбрасывают п.2 без `sideEffects`.

### 2.3. Что сделать (п.1–2 сделаны в 6.2.1, п.3 — см. §9)

1. Добавить в `packages/synapse/package.json`: `"sideEffects": false`. Проверено, что настоящих side effects
   (полифиллы, CSS, глобальная регистрация) в `dist` нет — всё удерживаемое из п.2 нужно только при
   использовании соответствующего экспорта. Минорная версия + запись в CHANGELOG («поведенческих изменений нет,
   бандлы потребителей уменьшатся»).
2. Для устойчивости (бандлеры/инструменты, игнорирующие `sideEffects`, — например, некоторые конфигурации
   Jest/SSR-сборщиков): пометить 4 фабрики `/*#__PURE__*/`, заменить `createSynapse.of = …` на
   `Object.assign(fn, { of })` внутри `/*#__PURE__*/`-выражения, вынести `[FINALIZE]` из вычисляемого ключа
   класса (например, в `static`-инициализацию/обычный метод с символом, назначаемым через `defineProperty`
   в pure-хелпере).
3. Добавить в CI/`yarn test` регрессионный тест размера: прогон `npm run measure -- --only=syn-memory,syn-api,syn-dispatcher`
   и порог (например, MemoryStorage ≤ 7.5 KB gzip в rolldown). Иначе tree-shaking снова сломается незаметно.

**Все цифры ниже даны в варианте «после фикса»** (это то, что пользователь получит после п.1), а текущее
состояние — отдельной колонкой.

---

## 3. Сколько весит synapse по сценариям

gzip KB. «Сейчас» — диапазон по четырём бандлерам; «после фикса» — rolldown (Vite 7+), остальные бандлеры
отличаются от него не более чем на ±0.7 KB.

| Сценарий (что импортировано) | Сейчас | **После фикса** | из них без rxjs | min (после фикса) |
|---|--:|--:|--:|--:|
| **Хранилища** | | | | |
| `MemoryStorage` | 11.4–23.6 | **7.1** | 7.1 | 24 |
| `LocalStorage` | 11.4–23.7 | **7.2** | 7.2 | 24 |
| `IndexedDBStorage` | 13.7–26.1 | **9.4** | 9.4 | 33 |
| `WorkerCacheStorage` | 12.4–24.8 | **11.7** | 11.7 | 42 |
| `browserStorage` (SSR-фабрика) | 11.4–23.7 | **7.1** | 7.1 | 24 |
| все 4 адаптера | 16.0–28.6 | **15.2** | 15.2 | 65 |
| `MemoryStorage` + sync logger + broadcast (синхронизация вкладок) | 11.4–23.6 | **8.2** | 8.2 | 28 |
| **Селекторы** | | | | |
| `MemoryStorage` + `Selectors` | 15.5–25.9 | **11.2** | 9.5 | 37 |
| **API** | | | | |
| `ApiClient` | 11.4–23.8 | **6.9** | 6.9 | 23 |
| `ApiClient` + `MemoryStorage` | 17.7–30.3 | **13.3** | 13.3 | 47 |
| **Бизнес-логика** | | | | |
| `Dispatcher` | 11.6–17.1 | **7.5** | 2.6 | 23 |
| `Dispatcher` + `Effects` + `ofType/validateMap/mutationMap/fromRequest/apiResult` | 14.7–18.9 | **10.8** | 3.8 | 33 |
| `createEventBus` | 22.9–24.5 | **19.0** | 12.6 | 62 |
| `createSynapse` + Memory + Selectors + Dispatcher + Effects | 24.3–26.0 | **20.1** | 14.1 | 68 |
| …то же + `ApiClient` + `validateMap/fromRequest/apiResult` | 32.0–34.1 | **28.0** | 21.3 | 94 |
| **React** | | | | |
| `MemoryStorage` + `useStorageSubscribe` (путь без RxJS) | 11.5–23.8 | **7.3** | 7.3 | 24 |
| `MemoryStorage` + `Selectors` + `useSelector` | 15.7–26.0 | **11.4** | 9.7 | 38 |
| `ApiClient` + `MemoryStorage` + `useApiQuery/useApiMutation` | 18.4–31.0 | **14.0** | 14.5¹ | 49 |
| `createSynapse`-модуль + `createSynapseCtx` | 25.1–26.9 | **20.9** | 15.1 | 70 |
| **Типичное приложение**: модуль + Ctx + ApiClient + хуки (`useApiQuery/Mutation`, `useSelector`, `useObservable`) + LocalStorage | 34.1–36.2 | **30.1** | 23.6 | 101 |
| **Максимум**: `import * from 'synapse-storage'` | 42.8–45.2 | **42.9** | 37.0 | 159 |

¹ колонка «без rxjs» — esbuild, поэтому может быть чуть больше rolldown-значения.

### 3.1. «Лестница»: сколько стоит каждый следующий шаг

| Шаг | Добавляет к бандлу (gzip, после фикса) |
|---|--:|
| Ядро хранилища (`MemoryStorage`/`LocalStorage`: события, подписки по путям, middleware-конвейер, миграции, гидрация, singleton) | 7.1 |
| + React-подписка `useStorageSubscribe` | +0.2 |
| + `IndexedDBStorage` вместо Memory | +2.3 |
| + `Selectors` (мемоизация, combine, cross-store) — **требует rxjs** | +4.1 (из них ~1.7 — rxjs) |
| + `Dispatcher` + `Effects` + операторы + `createSynapse` | +8.9 (из них ~4.3 — rxjs) |
| + `ApiClient` (кэш с тегами, дедупликация, retry, таймаут, `ApiError`) | +7–8 |
| + `createSynapseCtx` / хуки API | +0.7–0.8 |
| Всё остальное, что обычно не нужно одновременно (Worker/SharedWorker, EventBus, awaiter, все middleware, все адаптеры) | до 42.9 |

### 3.2. Где наш собственный вес (для будущей оптимизации)

Состав «MemoryStorage после фикса» (24 KB min): `sync-base-storage.service` 7.4 · `storage-core` 4.0 ·
`singleton.util` 3.5 · `middleware-module` 1.7 · `state-diff.util` 1.5 · `memory-storage.service` 1.2 ·
`path.utils` 1.1 · встроенные middleware batching/logger/shallowCompare 1.3 · прочее. Т.е. «минимальный» стор
всегда несёт singleton-менеджер, конвейер middleware и три встроенных middleware — кандидаты на ленивое
подключение, если захочется опустить порог ниже ~5 KB. ApiClient: `endpoint` 7.4 · `query-storage` 6.2 ·
`fetch-base-query` 3.4 · `api.module` 2.4 · `cache.util` 1.5 · `file-utils` 1.3.

**rxjs** в наших сценариях стоит 5–6.5 KB gzip. Пакет rxjs 7 по умолчанию резолвится в `esm5`-сборку с `tslib`
(+3.9 KB min) — это одинаково и для redux-observable, т.е. в сравнении честно.

---

## 4. Сравнение с конкурентами по ступеням

gzip KB, rolldown (Vite 7+). Все пакеты — актуальные версии на дату замера (redux 5.0.1, @reduxjs/toolkit 2.13.0,
react-redux 9.3.0, zustand 5.0.15, jotai 3.0.1, valtio 2.3.2, mobx 7.0.6, effector 23.4.4,
@tanstack/react-query 5.104.1, swr 2.5.1, axios 1.20.0, ky 2.1.0, rxjs 7.8.2, redux-observable 3.0.0-rc.3,
redux-saga 1.5.1, redux-persist 6.0.0). У конкурентов разброс между бандлерами ≤ 0.7 KB.

### Ступень 1. Хранилище состояния, без React

| Решение | gzip |
|---|--:|
| zustand/vanilla (`createStore`) | 0.2 |
| redux (`createStore`, `combineReducers`, `applyMiddleware`) | 1.1 |
| reselect (`createSelector`) | 1.2 |
| valtio/vanilla | 1.3 |
| jotai/vanilla | 2.3 |
| RTK (`configureStore` + `createSlice`, включает immer) | 7.0 |
| **synapse `MemoryStorage`** | **7.1** (сейчас 11.4–23.6) |
| effector | 8.1 |
| mobx | 11.3 |
| RTK полный core (+ asyncThunk, entityAdapter, createSelector, listenerMiddleware) | 11.8 |
| **synapse `MemoryStorage` + `Selectors`** | **11.2** |

**Вывод:** если нужен только стор — synapse не конкурент zustand/redux по весу и не должен им быть.
Мы на уровне RTK, но наш «стор» сразу включает то, что у RTK отсутствует (подписки по путям, middleware,
миграции, гидрацию).

### Ступень 2. Хранилище + React

| Решение | gzip |
|---|--:|
| zustand (`create`) | 0.3 |
| valtio | 2.2 |
| redux + react-redux | 2.7 |
| jotai | 3.0 |
| **synapse `MemoryStorage` + `useStorageSubscribe`** | **7.3** |
| RTK + react-redux | 8.6 |
| effector + effector-react | 10.3 |
| **synapse `MemoryStorage` + `Selectors` + `useSelector`** | **11.4** |
| mobx + mobx-react-lite | 12.7 |
| RTK (полный core) + react-redux | 13.4 |

### Ступень 3. + персистентность (localStorage / IndexedDB)

| Решение | gzip |
|---|--:|
| zustand + middleware (`persist`, `devtools`, `subscribeWithSelector`) | 2.6 |
| redux-persist (+ redux) | 3.3 (поверх RTK: 8.6 + ~3 ≈ 11.5) |
| **synapse `LocalStorage`** (вместо Memory, с миграциями версий) | **7.2** (+0.1 к Memory) |
| **synapse `IndexedDBStorage`** | **9.4** |

У zustand persist/redux-persist IndexedDB — только через сторонний адаптер (localforage/idb-keyval, +1–8 KB).

### Ступень 4. + API-клиент / кэш запросов

| Решение | gzip |
|---|--:|
| swr (`useSWR` + `useSWRMutation`) | 6.3 |
| **synapse `ApiClient`** | **6.9** |
| ky | 8.4 |
| @tanstack/query-core | 9.0 |
| @tanstack/react-query | 9.8 |
| **synapse `ApiClient` + `MemoryStorage` + `useApiQuery/useApiMutation`** | **14.0** |
| axios | 18.2 |
| RTK Query (без React) + configureStore | 20.7 |
| RTK Query React + configureStore + react-redux | 24.8 |

Замечание: react-query/swr — это кэш + хуки, HTTP-клиент обычно добавляется сверху (axios — ещё +18 KB,
ky +8 KB, или голый `fetch`). У нас и у RTK Query `fetchBaseQuery` уже внутри.

### Ступень 5. + слой бизнес-логики / side effects

| Решение | gzip |
|---|--:|
| redux-saga (+ effects) | 5.5 |
| rxjs (Observable, Subject + 9 ходовых операторов) | 6.1 |
| redux-observable + rxjs | 7.4 |
| **synapse `Dispatcher` + `Effects` + операторы** (включая rxjs) | **10.8** (без rxjs — 3.8) |

### Ступень 6. Полные стеки «стор + API + бизнес-логика»

| Стек | gzip | Чего в стеке нет относительно synapse |
|---|--:|---|
| zustand + middleware + @tanstack/react-query | 12.1 | слой экшенов/эффектов, IndexedDB, SSR-гидрация стора, HTTP-клиент |
| **synapse: `createSynapse`-модуль (storage + selectors + dispatcher + effects)** | **20.1** | API-клиент |
| mobx + mobx-react-lite + @tanstack/react-query | 22.1 | HTTP-клиент, персист |
| RTK + react-redux + RTK Query React | 24.8 | персист, реактивные эффекты (есть listenerMiddleware/thunks) |
| **synapse: модуль + ApiClient** | **28.0** | — |
| zustand + middleware + react-query + axios | 30.0 | слой экшенов/эффектов, IndexedDB, SSR-гидрация стора |
| **synapse: типичное приложение** (модуль + Ctx + API + хуки + LocalStorage) | **30.1** | — |
| RTK + react-redux + RTK Query React + redux-saga + redux-persist | 32.3 | IndexedDB, cross-tab |
| RTK + react-redux + RTK Query React + redux-observable + rxjs + redux-persist | 35.7 | IndexedDB, cross-tab |
| **synapse: всё** | **42.9** | — |

**Вывод для разговора «библиотека слишком тяжёлая».** Сравнивать 43 KB полного пакета с 1 KB redux некорректно.
Корректно — сравнивать то, что реально попадает в бандл, со стеком, который человек собрал вокруг redux:
RTK + RTK Query + react-redux уже 25 KB, с redux-observable/saga и redux-persist — 32–36 KB, и это ещё без
самописных обвязок (типизированный apiClient, обработка ошибок, ретраи, гидрация), которые тоже весят. Типичное
приложение на synapse — 30 KB. Но этот аргумент работает **только после фикса tree-shaking**: сейчас любой
частичный сценарий обходится на 4–16 KB дороже.

---

## 5. Что разработчик получает за эту цену

Сравнение функциональности на уровне «типичное приложение» (synapse ~30 KB) против двух популярных стеков.
✅ — из коробки, ➕ — нужна доп. библиотека/своя обвязка, ❌ — нет.

| Возможность | synapse | RTK + RTKQ + react-redux (+ r-o/saga + persist) | zustand + react-query (+ axios) |
|---|:-:|:-:|:-:|
| Стор с иммутабельными «мутирующими» апдейтами | ✅ | ✅ (immer) | ➕ (immer middleware) |
| Подписка на путь/слайс стора, `useSyncExternalStore` | ✅ | ✅ | ✅ |
| Мемоизированные селекторы, cross-store зависимости | ✅ | ✅ внутри одного стора | ➕ |
| Хранилища: memory / localStorage / **IndexedDB** / **Shared/Worker cache** с единым API | ✅ | ➕ redux-persist (+ адаптер для IDB) | ➕ persist (+ адаптер для IDB) |
| Миграции персиста по версиям | ✅ | ✅ redux-persist | ✅ persist |
| Синхронизация вкладок (BroadcastChannel / SharedWorker) | ✅ | ➕ | ➕ |
| Middleware стора (batching, shallowCompare, logger, свои) | ✅ | ✅ | ✅ |
| Экшены + жизненный цикл API-вызова (`apiActions`: loading/success/failure/reset) | ✅ | ➕ (createAsyncThunk) | ❌ |
| Реактивные эффекты (RxJS, `ofType`, `validateMap`, `mutationMap`) | ✅ | ➕ redux-observable | ❌ |
| Модуль как единица (storage + selectors + dispatcher + effects + DI зависимостей) | ✅ `createSynapse` | ❌ (соглашения) | ❌ |
| HTTP-клиент: fetch, таймаут, разбор тела, бинарные ответы | ✅ | ✅ fetchBaseQuery | ➕ axios/ky/fetch |
| Кэш запросов, теги/инвалидация, дедупликация in-flight | ✅ | ✅ | ✅ |
| Единая модель ошибки (`ApiError`, `status 0` для сети/таймаута) | ✅ | частично | ➕ |
| Retry только идемпотентных методов | ✅ | ➕ (retry для всех) | ✅ (queries) |
| Кэш API в персистентном хранилище (IndexedDB) | ✅ | ➕ | ➕ persistQueryClient |
| SSR-гидрация стора, server-safe фабрика (`browserStorage`) | ✅ | ➕ (вручную) | ✅ для query, ➕ для стора |
| Event bus между модулями | ✅ | ❌ | ❌ |
| Framework-agnostic ядро (без React) | ✅ | ✅ | ✅ |
| Redux DevTools | ❌ | ✅ | ✅ (devtools middleware) |
| Polling / refetch on focus / optimistic updates в API-слое | ❌ | ✅ | ✅ |
| Экосистема, документация, сообщество | маленькие | огромные | огромные |

Последние три строки — честные минусы, их стоит указать и на странице «Нужен ли вам Synapse?».

---

## 6. Внешняя проверка (ссылки)

**Как читать.** bundlephobia/pkg-size меряют **весь пакет целиком** (как `import *`), peer-зависимости — external.
Наши цифры — tree-shaken сценарии, поэтому они ≤ bundlephobia. Колонка «наш полный импорт» — ближайший аналог.

| Пакет | bundlephobia, min / gzip (получено через API) | Наш замер, сопоставимый сценарий (gzip) | Ссылки |
|---|---|---|---|
| synapse-storage 6.2.0 | не удалось получить (HTTP 429) | весь пакет без rxjs (≈ как считает bundlephobia): 37.0 | [bundlephobia](https://bundlephobia.com/package/synapse-storage@6.2.0) · [pkg-size](https://pkg-size.dev/synapse-storage) |
| redux 5.0.1 | 3.27 / **1.37** | 3 функции: 1.1 | [bundlephobia](https://bundlephobia.com/package/redux@5.0.1) · [pkg-size](https://pkg-size.dev/redux) |
| @reduxjs/toolkit 2.13.0 | 39.01 / **14.21** | полный core: 11.8 | [bundlephobia](https://bundlephobia.com/package/@reduxjs/toolkit@2.13.0) · [pkg-size](https://pkg-size.dev/@reduxjs/toolkit) |
| react-redux 9.3.0 | 9.50 / **3.68** | Provider+хуки (с redux): 2.7 | [bundlephobia](https://bundlephobia.com/package/react-redux@9.3.0) · [pkg-size](https://pkg-size.dev/react-redux) |
| zustand 5.0.15 | 0.84 / **0.48** | `create`: 0.3 | [bundlephobia](https://bundlephobia.com/package/zustand@5.0.15) · [pkg-size](https://pkg-size.dev/zustand) |
| jotai 3.0.1 | 7.77 / **3.25** | 3.0 | [bundlephobia](https://bundlephobia.com/package/jotai@3.0.1) · [pkg-size](https://pkg-size.dev/jotai) |
| valtio 2.3.2 | 5.97 / **2.53** | 2.2 | [bundlephobia](https://bundlephobia.com/package/valtio@2.3.2) · [pkg-size](https://pkg-size.dev/valtio) |
| mobx 7.0.6 | 51.36 / **14.59** | 4 функции: 11.3 | [bundlephobia](https://bundlephobia.com/package/mobx@7.0.6) · [pkg-size](https://pkg-size.dev/mobx) |
| @tanstack/react-query 5.104.1 | 49.43 / **13.43** | 4 экспорта: 9.8 | [bundlephobia](https://bundlephobia.com/package/@tanstack/react-query@5.104.1) · [pkg-size](https://pkg-size.dev/@tanstack/react-query) |
| swr 2.5.1 | 12.62 / **5.58** | + `swr/mutation`: 6.3 | [bundlephobia](https://bundlephobia.com/package/swr@2.5.1) · [pkg-size](https://pkg-size.dev/swr) |
| axios 1.20.0 | 49.57 / **18.48** | 18.2 | [bundlephobia](https://bundlephobia.com/package/axios@1.20.0) · [pkg-size](https://pkg-size.dev/axios) |
| rxjs 7.8.2 | 63.59 / **17.35** | 12 экспортов: 6.1 | [bundlephobia](https://bundlephobia.com/package/rxjs@7.8.2) · [pkg-size](https://pkg-size.dev/rxjs) |
| reselect 5.3.0 | 4.68 / **1.97** | `createSelector`: 1.2 | [bundlephobia](https://bundlephobia.com/package/reselect@5.3.0) · [pkg-size](https://pkg-size.dev/reselect) |
| effector 23.4.4 | не удалось (429) | 8.1 | [bundlephobia](https://bundlephobia.com/package/effector@23.4.4) · [pkg-size](https://pkg-size.dev/effector) |
| redux-observable 3.0.0-rc.3 | не удалось (429) | с rxjs: 7.4 | [bundlephobia](https://bundlephobia.com/package/redux-observable@3.0.0-rc.3) · [pkg-size](https://pkg-size.dev/redux-observable) |
| redux-saga 1.5.1 | не удалось (429) | 5.5 | [bundlephobia](https://bundlephobia.com/package/redux-saga@1.5.1) · [pkg-size](https://pkg-size.dev/redux-saga) |
| redux-persist 6.0.0 | не удалось (429) | 3.3 | [bundlephobia](https://bundlephobia.com/package/redux-persist@6.0.0) · [pkg-size](https://pkg-size.dev/redux-persist) |
| ky 2.1.0 | не удалось (429) | 8.4 | [bundlephobia](https://bundlephobia.com/package/ky@2.1.0) · [pkg-size](https://pkg-size.dev/ky) |
| @tanstack/query-core 5.104.1 | не удалось (429) | 9.0 | [bundlephobia](https://bundlephobia.com/package/@tanstack/query-core@5.104.1) · [pkg-size](https://pkg-size.dev/@tanstack/query-core) |

Все 11 полученных значений bundlephobia согласуются с нашими: полный пакет ≥ наш tree-shaken сценарий,
расхождение объясняется объёмом импорта (например, RTK 14.2 полный против 11.8 у нас без `createApi`/`combineSlices`
и пр.). Для каждого конкурента также доступна точная проверка tree-shaken сценария руками — на
[bundlejs.com](https://bundlejs.com) (esbuild в браузере), например:
`https://bundlejs.com/?q=zustand&treeshake=[{create}]&config={"esbuild":{"external":["react"]}}`.

---

## 7. Выводы и что делать

1. **Срочно: `"sideEffects": false`** (§2.3) — без этого все аргументы про «платишь только за то, что используешь»
   сейчас неверны, и бейдж bundlephobia в README их только подкрепляет. После фикса: + pure-аннотации,
   + регрессионный тест размера.
2. **Бейдж bundlephobia в README** показывает полный пакет (~37 KB без rxjs). Стоит заменить/дополнить
   ссылкой на таблицу сценариев («хранилище — 7 KB, API — 7 KB, всё вместе — 30 KB»).
3. **[Исправлено в 7.0.0 — rxjs-free ядро]** **README/доки обещают «rxjs — optional peer, take only what you use»**, но `Selectors` (часть `core`, «State
   Manager») импортирует rxjs. Без rxjs работают только хранилища, `useStorageSubscribe` и `ApiClient`. Либо
   уточнить формулировку, либо сделать `Selectors` RxJS-free (внутри `Observable` нужен только для `.$`).
4. Потенциальные оптимизации собственного кода (не срочно): минимальный стор несёт singleton-менеджер и три
   встроенных middleware (§3.2); `createEventBus` тянет `MemoryStorage` + `Dispatcher` (19 KB) — дорого для
   event bus.
5. **[Исправлено в 7.0.0 — rxjs/react вынесены в свои подпути, гейт-тест `optional-peers.test.ts`]** **rxjs фактически обязателен почти для всех entry points.** Бандлер резолвит все импорты модулей энтрипоинта до
   tree-shaking, поэтому без установленного rxjs `import { MemoryStorage } from 'synapse-storage'` (и `/core`, `/react`)
   падает с «Could not resolve rxjs». Без rxjs собирается только `synapse-storage/api`. Доки (README, install, architecture)
   в 6.2.1 это уже говорят, но `peerDependenciesMeta.rxjs.optional: true` и слоган на лендинге
   (`packages/homepage/src/i18n/config.ts`) остались — решить: убрать `optional` или вынести rxjs-зависимые части в
   отдельные модули.
6. **Побочная находка (исправлено в 6.2.1):** README (раздел «Reactive reads») и `docs/{en,ru}/subscriptions.md:109` упоминают хук
   `useStorageRef`, которого нет ни в `src`, ни в экспортах пакета.

---

## 8. Заготовка для страницы «Нужен ли вам Synapse?»

Тезисы (после фикса tree-shaking):

- **Вам НЕ нужен Synapse**, если: нужен только глобальный стейт для UI → zustand (0.3 KB) / jotai / redux;
  нужен только кэш запросов → react-query/swr (6–10 KB); важны Redux DevTools, polling/refetch-on-focus,
  огромная экосистема.
- **Synapse имеет смысл**, если вы всё равно собираете стек «стор + API + слой бизнес-логики (+ персист/SSR/вкладки)»:
  - за ~20 KB — модуль `storage + selectors + dispatcher + effects` (аналог RTK + react-redux + redux-observable/rxjs — ~16 KB,
    но без API, персиста и SSR-гидрации);
  - за ~30 KB — всё это + API-клиент + React (аналоги: RTK + RTK Query + saga/observable + persist — 32–36 KB;
    zustand + react-query + axios — 30 KB без слоя бизнес-логики);
  - отдельные части берутся по отдельности: хранилище 7 KB, ApiClient 7 KB, IndexedDB 9 KB.
- Визуально: «лестница» из §3.1 и график ступеней §4 (synapse vs RTK-стек vs zustand-стек) — хорошо ложится
  на step-chart. Данные — `scripts/bundle-size/results/results.json`; при генерации страницы их можно
  подхватывать скриптом, чтобы цифры не устаревали.

---

## 9. Автоматизация

Скрипты в корневом `package.json`:

| Команда | Что делает | Время |
|---|---|---|
| `yarn size` | сборка библиотеки + таблица: каждый сценарий synapse (rolldown, gzip) против **последней опубликованной версии на npm** с Δ (▲ рост / ▼ падение), затем «лестница» сравнения с конкурентами | ~10 с |
| `yarn size:quick` | то же без пересборки (по текущему `dist`) | ~5 с |
| `yarn size:full` | сборка + все сценарии × 4 бандлера, обновляет `results/report.md`, `results.json` и кэш конкурентов `competitors.json` | ~2 мин |

**При каждой сборке** (`packages/synapse` → `postbuild`) автоматически печатается та же таблица, что у `yarn size`.
Отключить: `SYNAPSE_SIZE=0 yarn build`. Ошибки замера (нет сети и т.п.) сборку не валят.

Как устроено:
- База сравнения — `synapse-storage@latest` из npm: скрипт скачивает tarball (`npm pack`), мерит его теми же
  сценариями, кэширует в `scripts/bundle-size/.cache/`. Другая база: `node scripts/bundle-size/run.mjs --baseline=6.1.7`.
- Конкуренты меняются редко — их цифры лежат в закоммиченном `scripts/bundle-size/competitors.json`, обновляются
  только `yarn size:full`. Версии конкурентов зафиксированы `scripts/bundle-size/package-lock.json`
  (обновить: `cd scripts/bundle-size && npm update`).
- Зависимости стенда (бандлеры, конкуренты) ставятся в `scripts/bundle-size/node_modules` автоматически при первом
  запуске и не попадают в workspaces/зависимости библиотеки.
- Сценарии и «лестница» — `scripts/bundle-size/scenarios.mjs`: новый экспорт/сценарий добавляется одной строкой.
