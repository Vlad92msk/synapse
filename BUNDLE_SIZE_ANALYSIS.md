# Вес synapse-storage: сценарии использования и сравнение с конкурентами

> synapse-storage **7.0.0** · замер 2026-10-05 · все цифры получены скриптом [`scripts/bundle-size`](scripts/bundle-size/measure.mjs).
> Сырые данные (min / gzip / brotli по всем бандлерам + состав каждого бандла по файлам) —
> [`scripts/bundle-size/results/report.md`](scripts/bundle-size/results/report.md) и `results.json`.
> Пересчитать: `yarn size` (быстро, против npm-версии) или `yarn size:full` (всё + конкуренты), см. §8.

## TL;DR

1. **Платишь только за то, что импортировал.** Пакет tree-shakeable (`"sideEffects": false`), вес сценария
   одинаков во всех бандлерах (разброс ≤ 1.7 KB) и не зависит от того, импортируешь из корня или из подпути.
2. **`rxjs` и `react` — действительно опциональны.** Корень `synapse-storage` не тянет ни то, ни другое;
   React — `synapse-storage/react`, RxJS-эффекты — `synapse-storage/reactive`. Всё, кроме эффектов, работает
   без rxjs.
3. **Сколько весим (min+gzip, Vite):** хранилище — **7.1 KB**; `Dispatcher` — **3.1 KB**; хранилище + селекторы —
   **9.2 KB**; `ApiClient` — **6.9 KB**; модуль `createSynapse` без эффектов — **12.8 KB**; приложение без rxjs
   (модуль + React + API + хуки + LocalStorage) — **21.1 KB**; то же с RxJS-эффектами — **30.8 KB**; весь пакет —
   **43.9 KB**.
4. **Против конкурентов:** на «голом сторе» проигрываем всем (zustand 0.3 KB, redux 1.1 KB) — это не наш
   сценарий. На уровне «стор + API + бизнес-логика» мы на уровне Redux-стеков или легче: приложение без rxjs
   (21.1) против RTK + react-redux + RTK Query (24.8); с эффектами (30.8) против RTK-стека с saga (30.0) или
   redux-observable (33.4) — и это без персиста у RTK. Effector-стеки (effector + react + farfetched / react-query,
   19.2–19.9) чуть легче нашего приложения без rxjs (21.1), но без персиста и IndexedDB. zustand + react-query (12.1)
   легче всех, но без слоя бизнес-логики, HTTP-клиента, IndexedDB и SSR-гидрации стора.

---

## 1. Методика

**Что меряем.** Для каждого сценария генерируется «код потребителя»: импорт нужных экспортов и
`globalThis.__keep = [...]`, чтобы бандлер не выкинул их как неиспользуемые (ровно как приложение, которое эти
экспорты вызывает). synapse-storage ставится в стенд из `packages/synapse/{dist,package.json}` — побайтно то,
что приходит из npm.

| Бандлер            | Кого представляет                                            |
|--------------------|--------------------------------------------------------------|
| rolldown 1.2       | Vite 7+/8 (production) — **основная колонка документа**      |
| rollup 4 + terser  | Vite ≤ 6, библиотечные сборки                                |
| webpack 5 + terser | Next.js (webpack-режим), CRA, кастомные конфиги              |
| esbuild 0.28       | esbuild/tsup-приложения; самый консервативный к side effects |

**Правила честности.**
- `react` / `react-dom` / `react/jsx-runtime` — external для всех: это общая база React-приложения.
- `rxjs` **считается**, когда он нужен (эффекты); у конкурентов (redux-observable) — так же.
- Из каждой цифры вычтен «пустой» бандл соответствующего бандлера (его рантайм).
- KB = 1024 байта. Основная метрика — **min+gzip** (gzip level 9), как у bundlephobia; brotli на 10–12 % меньше.
- Production-режим, минификация, `process.env.NODE_ENV = "production"`.

---

## 2. Сколько весит synapse по сценариям

gzip KB. «Vite» — rolldown; «разброс» — min…max по четырём бандлерам; «min» — минифицированный размер до сжатия.

| Сценарий (что импортировано)                                                                    | **Vite** |   разброс |   min | rxjs |
|-------------------------------------------------------------------------------------------------|---------:|----------:|------:|:----:|
| **Хранилища**                                                                                   |          |           |       |      |
| `MemoryStorage`                                                                                 |  **7.1** |   7.1–7.2 |  24.0 |  —   |
| `LocalStorage`                                                                                  |  **7.2** |   7.1–7.3 |  24.4 |  —   |
| `IndexedDBStorage`                                                                              |  **9.4** |   9.4–9.7 |  33.4 |  —   |
| `WorkerCacheStorage`                                                                            | **11.7** | 11.7–12.0 |  42.0 |  —   |
| `browserStorage` (SSR-фабрика)                                                                  |  **7.1** |   7.1–7.3 |  24.1 |  —   |
| все 4 адаптера                                                                                  | **15.2** | 15.2–15.7 |  65.2 |  —   |
| `MemoryStorage` + sync logger + broadcast (синхронизация вкладок)                               |  **8.2** |   8.2–8.4 |  28.3 |  —   |
| **Селекторы**                                                                                   |          |           |       |      |
| `MemoryStorage` + `Selectors`                                                                   |  **9.2** |   9.2–9.7 |  31.4 |  —   |
| **API**                                                                                         |          |           |       |      |
| `ApiClient`                                                                                     |  **6.9** |   6.9–7.1 |  23.2 |  —   |
| `ApiClient` + `MemoryStorage`                                                                   | **13.3** | 13.3–13.7 |  46.6 |  —   |
| **Бизнес-логика**                                                                               |          |           |       |      |
| `Dispatcher`                                                                                    |  **3.1** |   3.0–3.1 |   9.3 |  —   |
| `createSynapse` + Memory + Selectors + Dispatcher (без эффектов)                                | **12.8** | 12.8–13.5 |  43.7 |  —   |
| `createEventBus`                                                                                | **11.9** | 11.8–12.1 |  39.4 |  —   |
| `Dispatcher` + `Effects` + `ofType`/`validateMap`/`mutationMap`/`fromRequest`/`apiResult`       | **13.0** | 12.4–13.6 |  41.8 |  ✓   |
| `createSynapse`-модуль + `Effects` + `ofType`                                                   | **20.9** | 20.8–22.1 |  71.4 |  ✓   |
| …то же + `ApiClient` + `validateMap`/`fromRequest`/`apiResult`                                  | **28.7** | 28.5–30.1 |  98.3 |  ✓   |
| **React**                                                                                       |          |           |       |      |
| `MemoryStorage` + `useStorageSubscribe`                                                         |  **7.3** |   7.2–7.4 |  24.5 |  —   |
| `MemoryStorage` + `Selectors` + `useSelector`                                                   |  **9.3** |   9.3–9.9 |  31.8 |  —   |
| `ApiClient` + `MemoryStorage` + `useApiQuery`/`useApiMutation`                                  | **14.0** | 14.0–14.5 |  48.6 |  —   |
| модуль без эффектов + `createSynapseCtx` + `useSelector`                                        | **13.8** | 13.8–14.6 |  46.5 |  —   |
| модуль с эффектами + `createSynapseCtx`                                                         | **21.8** | 21.7–23.0 |  73.8 |  ✓   |
| **Приложение без rxjs**: модуль + Ctx + `ApiClient` + API-хуки + `useSelector` + `LocalStorage` | **21.1** | 21.1–22.1 |  73.1 |  —   |
| **Типичное приложение с эффектами**: то же + `Effects` + операторы + `useObservable`            | **30.8** | 30.6–32.4 | 105.3 |  ✓   |
| **Максимум**                                                                                    |          |           |       |      |
| весь корень `import * from 'synapse-storage'` (без `/react`, `/reactive`)                       | **30.9** | 30.9–32.3 | 120.5 |  —   |
| всё: корень + `/react` + `/reactive`                                                            | **43.9** | 43.7–46.2 | 162.8 |  ✓   |

### 2.1. «Лестница»: сколько стоит каждый следующий шаг

| Шаг                                                                                                                             | Добавляет (gzip) | Итого |
|---------------------------------------------------------------------------------------------------------------------------------|-----------------:|------:|
| Ядро хранилища: `MemoryStorage`/`LocalStorage` (события, подписки по путям, middleware-конвейер, миграции, гидрация, singleton) |              7.1 |   7.1 |
| + `IndexedDBStorage` вместо Memory                                                                                              |             +2.3 |   9.4 |
| + `Selectors` к Memory (мемоизация, `combine`, cross-store)                                                                     |             +2.1 |   9.2 |
| + `useSelector` (React)                                                                                                         |             +0.1 |   9.3 |
| + `Dispatcher` + `createSynapse` (модуль)                                                                                       |             +3.5 |  12.8 |
| + `createSynapseCtx` (React-провайдер, SSR)                                                                                     |             +1.0 |  13.8 |
| + `ApiClient` + API-хуки (кэш с тегами, дедупликация, retry, таймаут, `ApiError`) + `LocalStorage`                              |             +7.3 |  21.1 |
| + RxJS-эффекты (`Effects` + операторы), **из них rxjs ≈ 6.4**                                                                   |             +9.7 |  30.8 |
| Всё остальное сразу (Worker/SharedWorker, EventBus, awaiter, все middleware и адаптеры)                                         |            +13.1 |  43.9 |

### 2.2. Из чего состоит наш вес (кандидаты на оптимизацию)

- **Минимальный стор** (24 KB min): `sync-base-storage` 7.4 · `storage-core` 4.0 · `singleton.util` 3.5 ·
  `middleware-module` 1.7 · `state-diff` 1.5 · `memory-storage` 1.2 · `path.utils` 1.0 · `hydration-meta` 0.6 ·
  встроенные middleware (batching/logger/shallowCompare) ≈ 1.3. Стор всегда несёт singleton-менеджер, конвейер
  middleware и три встроенных middleware — если захочется опустить порог ниже ~5 KB, это первые кандидаты на ленивое
  подключение.
- **ApiClient** (24.5 KB min): `endpoint` 7.4 · `query-storage` 6.2 · `fetch-base-query` 3.4 · `api.module` 2.4 ·
  `cache.util` 1.5 · `file-utils` 1.3.
- **Модуль без эффектов** добавляет к стору `selector.module` 6.6 · `dispatcher.base` 3.9 · `dispatcher.module` 3.6 ·
  `syncModule` 3.5 · interop-потоки 1.9.
- **`createEventBus`** (11.9 KB) тянет `MemoryStorage` + `Dispatcher` + `createSynapse` — дорого для event bus.
- **rxjs** в сценариях с эффектами стоит ≈ 6.4 KB gzip; rxjs 7 по умолчанию резолвится в `esm5` с `tslib`
  (+3.9 KB min) — у redux-observable так же, сравнение честное.

---

## 3. Сравнение с конкурентами по ступеням

Сравниваем с тем, что реально используют в продакшене: **Redux-экосистема** (redux, RTK, RTK Query, react-redux,
redux-saga, redux-observable), **effector** (+ его штатный API-слой farfetched), **MobX**, **zustand**,
**TanStack Query**. Нишевые и
pet-project-решения в сравнение не входят.

gzip KB, rolldown (Vite). Версии: redux 5.0.1, @reduxjs/toolkit 2.13.0, react-redux 9.3.0, zustand 5.0.15,
mobx 7.0.6, mobx-react-lite 5.1.0, effector 23.4.4, effector-react 23.3.0, @farfetched/core 0.15.0,
@tanstack/react-query 5.104.1,
rxjs 7.8.2, redux-observable 3.0.0-rc.3, redux-saga 1.5.1. Разброс между бандлерами у конкурентов ≤ 0.7 KB.

### Ступень 1. Хранилище, без React

| Решение                                                                           |    gzip |
|-----------------------------------------------------------------------------------|--------:|
| zustand/vanilla (`createStore`)                                                   |     0.2 |
| redux (`createStore`, `combineReducers`, `applyMiddleware`)                       |     1.1 |
| RTK (`configureStore` + `createSlice`, с immer)                                   |     7.0 |
| **synapse `MemoryStorage`**                                                       | **7.1** |
| effector                                                                          |     8.1 |
| **synapse `MemoryStorage` + `Selectors`**                                         | **9.2** |
| mobx                                                                              |    11.3 |
| RTK полный core (+ asyncThunk, entityAdapter, createSelector, listenerMiddleware) |    11.8 |

Если нужен только стор — synapse не конкурент zustand/redux по весу и не должен им быть. Мы на уровне RTK
и effector, но стор сразу включает подписки по путям, middleware, миграции персиста и SSR-гидрацию.

### Ступень 2. Хранилище + React

| Решение                                                   |    gzip |
|-----------------------------------------------------------|--------:|
| zustand (`create`)                                        |     0.3 |
| redux + react-redux                                       |     2.7 |
| **synapse `MemoryStorage` + `useStorageSubscribe`**       | **7.3** |
| RTK + react-redux                                         |     8.6 |
| **synapse `MemoryStorage` + `Selectors` + `useSelector`** | **9.3** |
| effector + effector-react                                 |    10.3 |
| mobx + mobx-react-lite                                    |    12.7 |
| RTK (полный core) + react-redux                           |    13.4 |

### Ступень 3. Персистентность

| Решение                                                               |                                  gzip |
|-----------------------------------------------------------------------|--------------------------------------:|
| zustand + middleware (`persist`, `devtools`, `subscribeWithSelector`) |                                   2.6 |
| **synapse `LocalStorage`** (вместо Memory, с миграциями версий)       |               **7.2** (+0.1 к Memory) |
| **synapse `IndexedDBStorage`**                                        |                               **9.4** |

В RTK, effector и MobX персиста из коробки нет — только сторонние библиотеки или своя обвязка. У zustand
`persist` IndexedDB — только через сторонний адаптер (localforage/idb-keyval, +1–8 KB).

### Ступень 4. API-клиент / кэш запросов

| Решение                                                                          |     gzip |
|----------------------------------------------------------------------------------|---------:|
| **synapse `ApiClient`**                                                          |  **6.9** |
| @tanstack/query-core                                                             |      9.0 |
| @tanstack/react-query                                                            |      9.8 |
| **synapse `ApiClient` + `MemoryStorage` + `useApiQuery`/`useApiMutation`**       | **14.0** |
| farfetched (`createJsonQuery`/`createJsonMutation`, `cache`, `retry`) + effector |     17.3 |
| RTK Query (без React) + configureStore                                           |     20.7 |
| RTK Query React + configureStore + react-redux                                   |     24.8 |

react-query — кэш + хуки, HTTP-слой (fetch, таймаут, разбор тела, модель ошибки) пишется сверху своими руками.
У нас, у RTK Query (`fetchBaseQuery`) и у farfetched (`createJsonQuery`) HTTP-слой уже внутри. farfetched
без effector не работает, поэтому меряется вместе с ним (сам farfetched ≈ 9 KB gzip поверх effector).

### Ступень 5. Бизнес-логика

| Решение                                                                              |     gzip | rxjs |
|--------------------------------------------------------------------------------------|---------:|:----:|
| redux-saga (+ effects)                                                               |      5.5 |  —   |
| redux-observable + rxjs                                                              |      7.4 |  ✓   |
| effector (`createStore`, `createEvent`, `createEffect`, `sample`)                    |      8.1 |  —   |
| RTK полный core (asyncThunk, listenerMiddleware, …)                                  |     11.8 |  —   |
| **synapse модуль без эффектов** (storage + selectors + dispatcher + `createSynapse`) | **12.8** |  —   |
| **synapse `Dispatcher` + `Effects` + операторы**                                     | **13.0** |  ✓   |
| **synapse модуль с эффектами**                                                       | **20.9** |  ✓   |

### Ступень 6. Полные стеки «стор + API + бизнес-логика»

| Стек                                                                                |     gzip | Чего в стеке нет относительно synapse                             |
|-------------------------------------------------------------------------------------|---------:|-------------------------------------------------------------------|
| zustand + middleware + @tanstack/react-query                                        |     12.1 | слой экшенов/эффектов, IndexedDB, SSR-гидрация стора, HTTP-клиент |
| effector + effector-react + farfetched                                              |     19.2 | персист, IndexedDB, cross-tab                                     |
| effector + effector-react + @tanstack/react-query                                   |     19.9 | HTTP-клиент, персист, IndexedDB, cross-tab                        |
| **synapse: приложение без rxjs** (модуль + Ctx + `ApiClient` + хуки + LocalStorage) | **21.1** | RxJS-эффекты (не нужны — бизнес-логика в экшенах)                 |
| mobx + mobx-react-lite + @tanstack/react-query                                      |     22.1 | слой эффектов, HTTP-клиент, персист                               |
| RTK + react-redux + RTK Query React                                                 |     24.8 | персист, реактивные эффекты                                       |
| RTK + react-redux + RTK Query React + redux-saga                                    |     30.0 | персист, IndexedDB, cross-tab                                     |
| **synapse: типичное приложение с эффектами**                                        | **30.8** | —                                                                 |
| RTK + react-redux + RTK Query React + redux-observable + rxjs                       |     33.4 | персист, IndexedDB, cross-tab                                     |
| **synapse: всё**                                                                    | **43.9** | —                                                                 |

**Для разговора «библиотека слишком тяжёлая».** Сравнивать 43.9 KB всего пакета с 1 KB redux некорректно.
Корректно — сравнивать то, что реально попадает в бандл, со стеком, который человек собрал вокруг redux:
RTK + RTK Query + react-redux — уже 24.8 KB, с saga/observable — 30–33 KB, и это без персиста и самописных
обвязок (обработка ошибок, ретраи, гидрация). Приложение на synapse без rxjs — 21.1 KB, с RxJS-эффектами — 30.8 KB.
Effector-стек — ближайший по весу соперник (19–20 KB): он на 1–2 KB легче, но персист и IndexedDB там пришлось бы
добавлять самим.

---

## 4. Что разработчик получает за эту цену

На уровне «приложение» (synapse 21–31 KB) против двух популярных стеков.
✅ — из коробки, ➕ — нужна доп. библиотека/своя обвязка, ❌ — нет.

| Возможность                                                                            |      synapse      |    RTK + RTKQ + react-redux (+ saga/observable)        |      zustand + react-query      |
|----------------------------------------------------------------------------------------|:-----------------:|:------------------------------------------------------:|:-------------------------------:|
| Framework-agnostic ядро без обязательных `rxjs`/`react`                                |         ✅         |                           ✅                            |                ✅                |
| Стор с «мутирующими» апдейтами                                                         |         ✅         |                       ✅ (immer)                        |      ➕ (immer middleware)       |
| Подписка на путь/слайс стора, `useSyncExternalStore`                                   |         ✅         |                           ✅                            |                ✅                |
| Мемоизированные селекторы, cross-store зависимости                                     |         ✅         |                 ✅ внутри одного стора                  |                ➕                |
| Хранилища memory / localStorage / **IndexedDB** / **Shared/Worker cache** с единым API |         ✅         |                ➕ сторонние библиотеки                  |  ➕ persist (+ адаптер для IDB)  |
| Миграции персиста по версиям                                                           |         ✅         |                ➕ сторонние библиотеки                  |            ✅ persist            |
| Синхронизация вкладок (BroadcastChannel / SharedWorker)                                |         ✅         |                           ➕                            |                ➕                |
| Middleware стора (batching, shallowCompare, logger, свои)                              |         ✅         |                           ✅                            |                ✅                |
| Экшены + жизненный цикл API-вызова (`apiActions`: loading/success/failure/reset)       |         ✅         |                  ➕ (createAsyncThunk)                  |                ❌                |
| Реактивные эффекты (RxJS, `ofType`, `validateMap`, `mutationMap`) — опционально        |         ✅         |                   ➕ redux-observable                   |                ❌                |
| Модуль как единица (storage + selectors + dispatcher + effects + DI зависимостей)      | ✅ `createSynapse` |                     ❌ (соглашения)                     |                ❌                |
| HTTP-клиент: fetch, таймаут, разбор тела, бинарные ответы                              |         ✅         |                    ✅ fetchBaseQuery                    |       ➕ своя обвязка fetch      |
| Кэш запросов, теги/инвалидация, дедупликация in-flight                                 |         ✅         |                           ✅                            |                ✅                |
| Единая модель ошибки (`ApiError`, `status 0` для сети/таймаута)                        |         ✅         |                        частично                        |                ➕                |
| Retry только идемпотентных методов                                                     |         ✅         |                   ➕ (retry для всех)                   |           ✅ (queries)           |
| Кэш API в персистентном хранилище (IndexedDB)                                          |         ✅         |                           ➕                            |      ➕ persistQueryClient       |
| SSR-гидрация стора, server-safe фабрика (`browserStorage`)                             |         ✅         |                      ➕ (вручную)                       |    ✅ для query, ➕ для стора     |
| Event bus между модулями                                                               |         ✅         |                           ❌                            |                ❌                |
| Redux DevTools                                                                         |         ❌         |                           ✅                            |     ✅ (devtools middleware)     |
| Polling / refetch on focus / optimistic updates в API-слое                             |         ❌         |                           ✅                            |                ✅                |
| Экосистема, документация, сообщество                                                   |     маленькие     |                        огромные                        |            огромные             |

Последние три строки — честные минусы, их стоит указать на странице «Нужен ли вам Synapse?».

---

## 5. Внешняя проверка (ссылки)

bundlephobia/pkg-size меряют **главный энтрипоинт целиком** (как `import *`), peer-зависимости — external.
Наши цифры — tree-shaken сценарии, поэтому они ≤ bundlephobia.

| Пакет                         | bundlephobia, min / gzip | Наш замер, сопоставимый сценарий (gzip) | Ссылки                                                                                                                                  |
|-------------------------------|--------------------------|-----------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| synapse-storage 7.0.0         | проверить по ссылке      | весь корень `import *`: 30.9            | [bundlephobia](https://bundlephobia.com/package/synapse-storage@7.0.0) · [pkg-size](https://pkg-size.dev/synapse-storage)               |
| redux 5.0.1                   | 3.27 / **1.37**          | 3 функции: 1.1                          | [bundlephobia](https://bundlephobia.com/package/redux@5.0.1) · [pkg-size](https://pkg-size.dev/redux)                                   |
| @reduxjs/toolkit 2.13.0       | 39.01 / **14.21**        | полный core: 11.8                       | [bundlephobia](https://bundlephobia.com/package/@reduxjs/toolkit@2.13.0) · [pkg-size](https://pkg-size.dev/@reduxjs/toolkit)            |
| react-redux 9.3.0             | 9.50 / **3.68**          | Provider + хуки (с redux): 2.7          | [bundlephobia](https://bundlephobia.com/package/react-redux@9.3.0) · [pkg-size](https://pkg-size.dev/react-redux)                       |
| zustand 5.0.15                | 0.84 / **0.48**          | `create`: 0.3                           | [bundlephobia](https://bundlephobia.com/package/zustand@5.0.15) · [pkg-size](https://pkg-size.dev/zustand)                              |
| mobx 7.0.6                    | 51.36 / **14.59**        | 4 функции: 11.3                         | [bundlephobia](https://bundlephobia.com/package/mobx@7.0.6) · [pkg-size](https://pkg-size.dev/mobx)                                     |
| @tanstack/react-query 5.104.1 | 49.43 / **13.43**        | 4 экспорта: 9.8                         | [bundlephobia](https://bundlephobia.com/package/@tanstack/react-query@5.104.1) · [pkg-size](https://pkg-size.dev/@tanstack/react-query) |
| rxjs 7.8.2                    | 63.59 / **17.35**        | 12 экспортов: 6.1                       | [bundlephobia](https://bundlephobia.com/package/rxjs@7.8.2) · [pkg-size](https://pkg-size.dev/rxjs)                                     |
| effector 23.4.4               | не получено (HTTP 429)   | 8.1                                     | [bundlephobia](https://bundlephobia.com/package/effector@23.4.4) · [pkg-size](https://pkg-size.dev/effector)                            |
| redux-observable 3.0.0-rc.3   | не получено (HTTP 429)   | с rxjs: 7.4                             | [bundlephobia](https://bundlephobia.com/package/redux-observable@3.0.0-rc.3) · [pkg-size](https://pkg-size.dev/redux-observable)        |
| redux-saga 1.5.1              | не получено (HTTP 429)   | 5.5                                     | [bundlephobia](https://bundlephobia.com/package/redux-saga@1.5.1) · [pkg-size](https://pkg-size.dev/redux-saga)                         |
| @tanstack/query-core 5.104.1  | не получено (HTTP 429)   | 9.0                                     | [bundlephobia](https://bundlephobia.com/package/@tanstack/query-core@5.104.1) · [pkg-size](https://pkg-size.dev/@tanstack/query-core)   |

Все полученные значения bundlephobia согласуются с нашими (полный пакет ≥ tree-shaken сценарий). Проверить
tree-shaken сценарий руками — [bundlejs.com](https://bundlejs.com) (esbuild в браузере), например
`https://bundlejs.com/?q=zustand&treeshake=[{create}]&config={"esbuild":{"external":["react"]}}`.

---

## 6. Реальное приложение (sn_client)

Next 16 / Turbopack, переход 6.2.0 → 7.0.0, First Load JS gzip: **−6.7…−8.0 kB на роут** (`(app)/*` 681–692 →
674–686 kB; `(content)` 449–459 → 441–451 kB). Скромно и ожидаемо: sn_client сам плотно использует rxjs в
эффектах, выигрыш — только от tree-shaking библиотеки. У проектов без rxjs/react он больше.

Методика для Next 16 + Turbopack (он не печатает First Load JS в `next build`): считать по `entryJSFiles` из
`.next/server/app/**/page_client-reference-manifest.js` + `rootMainFiles` из `.next/build-manifest.json`.

---

## 7. Выводы и открытые вопросы

1. **Позиционирование по весу:** synapse — не «лёгкий стор», а замена стека «стор + API + бизнес-логика + персист».
   На этом уровне мы легче или наравне с Redux-стеками (без персиста у них) и на 1–2 KB тяжелее effector-стека,
   давая больше (§4).
2. **Без rxjs вход дешевле:** модуль 12.8 KB, приложение 21.1 KB. RxJS-эффекты — осознанная опция (+9.7 KB,
   из них rxjs ≈ 6.4).
3. **Кандидаты на оптимизацию** (не срочно, §2.2): ленивые встроенные middleware и singleton-менеджер в
   минимальном сторе; `createEventBus` без полного модуля.
4. **Бейдж bundlephobia в README** показывает главный энтрипоинт целиком (≈ 31 KB для 7.0.0) — стоит дополнить
   ссылкой на таблицу сценариев («хранилище 7 KB, модуль 13 KB, приложение 21 KB»).
5. **Честные минусы для страницы:** нет Redux DevTools, нет polling/refetch-on-focus/optimistic updates в API-слое,
   маленькая экосистема.

---

## 8. Автоматизация

| Команда (из корня) | Что делает                                                                                                                                                  | Время  |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| `yarn size`        | сборка + таблица: каждый сценарий synapse (rolldown, gzip) против **последней версии на npm** с Δ (▲ рост / ▼ падение), затем «лестница» против конкурентов | ~10 с  |
| `yarn size:quick`  | то же без пересборки (по текущему `dist`)                                                                                                                   | ~5 с   |
| `yarn size:full`   | сборка + все сценарии × 4 бандлера, обновляет `results/report.md`, `results.json` и `competitors.json`                                                      | ~2 мин |

- **При каждой сборке** (`packages/synapse` → `postbuild`) печатается та же таблица, что у `yarn size`.
  Отключить: `SYNAPSE_SIZE=0 yarn build`. Ошибки замера (нет сети и т.п.) сборку не валят.
- База сравнения — `synapse-storage@latest` из npm: скрипт скачивает tarball, мерит теми же сценариями, кэширует в
  `scripts/bundle-size/.cache/`. Другая база: `node scripts/bundle-size/run.mjs --baseline=6.2.0`.
- Конкуренты меняются редко: их цифры в закоммиченном `competitors.json`, версии зафиксированы
  `scripts/bundle-size/package-lock.json` (обновить: `cd scripts/bundle-size && npm update`, затем `yarn size:full`).
- Сценарии и «лестница» — `scripts/bundle-size/scenarios.mjs`: новый сценарий добавляется одной строкой.

---

## 9. Заготовка для страницы «Нужен ли вам Synapse?»

- **Вам НЕ нужен Synapse**, если: нужен только глобальный стейт для UI → zustand (0.3 KB) / redux; нужен
  только кэш запросов → TanStack Query (~10 KB); важны Redux DevTools, polling/refetch-on-focus, огромная
  экосистема.
- **Synapse имеет смысл**, если вы всё равно собираете стек «стор + API + бизнес-логика (+ персист / SSR / вкладки)»:
  - за ~13 KB — модуль `storage + selectors + dispatcher`, без rxjs (сопоставимо с полным RTK core 11.8 KB);
  - за ~21 KB — модуль + React + API-клиент с кэшем (RTK + RTK Query + react-redux — 24.8 KB);
  - за ~31 KB — то же + RxJS-эффекты (RTK-стек с saga/observable — 30–33 KB, без персиста);
  - части берутся по отдельности: хранилище 7 KB, `ApiClient` 7 KB, IndexedDB 9 KB, `Dispatcher` 3 KB;
  - `rxjs` и `react` не обязательны — корень работает с любым фреймворком.
- Визуально: «лестница» из §2.1 и ступени §3 (synapse vs RTK-стек vs zustand-стек) хорошо ложатся на step-chart.
  Данные — `scripts/bundle-size/results/results.json`; при сборке сайта их можно подхватывать скриптом, чтобы цифры
  не устаревали.
