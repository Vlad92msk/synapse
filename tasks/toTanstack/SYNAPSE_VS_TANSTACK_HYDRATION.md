# SSR-гидрация: Synapse vs TanStack Query — сравнение реализаций

> Документ-сравнение (не код). Цель — ответить на два вопроса:
> 1. У TanStack Query аналогичный механизм гидрации? — **Да, концептуально тот же.**
> 2. Реализация в Synapse — продакшен? — **Да для типового SSR-кейса; нет для ряда
>    продвинутых сценариев** (см. раздел «Вердикт»).
>
> Источники: TanStack Query — реальные исходники ветки `main`
> (`packages/query-core/src/hydration.ts`, `packages/react-query/src/HydrationBoundary.tsx`),
> сверено 2026-06-28. Synapse — `utils/dehydrateModule.ts`, `utils/createSynapse/factory.ts`,
> `utils/createSynapseAwaiter.ts`, `react/utils/createSynapseCtx.tsx`,
> `core/storage/adapters/sync-base-storage.service.ts`.

---

## 0. Короткий ответ

Обе библиотеки решают одну задачу одинаковой триадой фаз:

```
СЕРВЕР: собрать сериализуемый снапшот   →   ГРАНИЦА: JSON в payload   →   КЛИЕНТ: залить ДО первого рендера
```

- **TanStack:** `dehydrate(queryClient)` → `state` → `<HydrationBoundary state={…}>` → `hydrate(client, state)`.
- **Synapse:** `dehydrateModule(module)` → `dehydratedState` (проп) → `createSynapseCtx` (seedHydration) → `storage.hydrate(state)`.

Роли `fork` / `dehydrate` / `hydrate` у тебя названы индустриально (как в TanStack, effector,
Redux), и реализованы корректно. Различия — не в идее, а в **гранулярности, семантике
слияния и охвате продвинутых сценариев** (streaming SSR, кастомная сериализация, мердж по
свежести).

---

## 1. Карта соответствий «механизм → механизм»

| Задача | TanStack Query | Synapse | Совпадает? |
|---|---|---|---|
| Изоляция запроса на сервере | новый `QueryClient` на запрос (создаёт приложение) | `synapseModule.fork()` внутри `dehydrateModule` | ✅ идея та же; у Synapse формализовано в API |
| Снять сериализуемый снапшот | `dehydrate(client)` обходит `QueryCache`/`MutationCache` | `fork.ready({withEffects:false})` → `hydrate(state)` → `getStateSync()` | ✅ |
| Что именно сериализуется | массив `{ queryKey, queryHash, state, dehydratedAt }` по каждому запросу | один plain-объект состояния модуля (`PokemonState`) | ⚠️ разная гранулярность |
| Перенос через границу | проп `state` у `<HydrationBoundary>` | проп `dehydratedState` у HOC `withXxx` | ✅ |
| Залить в клиентский стор | `hydrate(client, state)` | `storage.hydrate(state)` (`doSet('', state)`) | ⚠️ merge vs full-replace |
| Залить ДО рендера | new-queries в `useMemo` (фаза рендера) | seed в ленивом инициализаторе `useState` + sync fast-path | ✅ |
| Дозалить после рендера | существующие queries с более свежими данными — в `useEffect` | повторный идемпотентный `seedHydration` в `useEffect` | ⚠️ см. §4.2 |
| Не дать спиннер в SSR-HTML | боундари просто рендерит `children` | `ssr:true` + SSR-гейт (`if (!store) loadingComponent`) | ✅ |
| Серверные подписки/эффекты | нет (queries ленивые, pull-based) | `withEffects:false` + прогрев main handle (RxJS не «висит») | ➕ это специфика Synapse, решена корректно |

---

## 2. Как это делает TanStack Query (по реальному коду)

### dehydrate (`query-core/src/hydration.ts`)
- Обходит `QueryCache` и `MutationCache`.
- Фильтр `shouldDehydrateQuery` (дефолт — только `status: 'success'`), `shouldDehydrateMutation`
  (дефолт — paused-мутации).
- Каждый query превращается в `dehydrateQuery()`:
  - пишет **`dehydratedAt: Date.now()`** (метка свежести),
  - прогоняет `data` через **`serializeData`** (подключаемый трансформер — напр. superjson),
  - кладёт `queryKey`, `queryHash`, опц. `meta`/`queryType`,
  - для **pending**-запросов оборачивает promise с редакцией ошибок (для streaming SSR / RSC-prefetch).
- Итог — **plain-массив** всех подходящих запросов кэша.

### hydrate (`query-core/src/hydration.ts`)
- Десериализует `data` обратным трансформером.
- Для **существующего** query обновляет состояние **только если снапшот свежее**:
  `dehydratedAt > query.state.dataUpdatedAt` (иначе не затирает более свежие клиентские данные).
- Для **нового** query создаёт запись кэша с `fetchStatus: 'idle'`.
- Pending-запросы с данными переводит в `success`; promise переподвешивает; `.catch(noop)`
  против unhandled rejection.

### `<HydrationBoundary state>` (`react-query/src/HydrationBoundary.tsx`, `'use client'`)
- **Новые** queries (которых нет в кэше) гидрируются **в `useMemo`, синхронно, ДО рендера детей**
  — комментарий в исходнике прямо говорит «hydration needs to happen _before_ children render».
- **Существующие** queries с более свежими данными — гидрируются **в `useEffect`** (commit-фаза),
  чтобы не мутировать UI во время прерванных React-transition.

---

## 3. Как это делает Synapse (по реальному коду)

### dehydrateModule (`utils/dehydrateModule.ts`)
```
fork = module.fork()                                  // изоляция запроса
forked = await fork.ready({ withEffects: false })     // собрать стор БЕЗ RxJS-эффектов
if (state) await forked.storage.hydrate({ ...getStateSync(), ...state })  // мердж поверх initialState
snapshot = forked.storage.getStateSync()              // plain-снапшот (это и есть «dehydrate»)
await fork.destroy()                                  // убрать временный форк
if (ssr) {                                            // прогрев основного handle
  main = await module.ready({ withEffects: false })
  if (main.storage.initStatus === READY) await main.storage.hydrate(snapshot)
}
```

### hydrate (`sync-base-storage.service.ts`)
```
public hydrate(state) {
  this.doSet('', state)                 // ПОЛНАЯ замена состояния (не мердж)
  this._stateCache = getRawState()
  this.notifyHydration(...)             // на сервере подписчиков нет → no-op
}
```

### seed ДО рендера (`react/utils/createSynapseCtx.tsx`)
```
const [store] = useState(() => {
  const s = resolveAwaiter().getStoreIfReady()  // sync fast-path (resolveSyncReady)
  seedHydration(s)                              // storage.hydrate(dehydratedState) — синхронно
  return s
})
useEffect(() => { seedHydration(getStoreIfReady()); /* подписки */ }, [])  // повтор + оживление
```

Сильные стороны, которых нет «из коробки» у TanStack (потому что у него нет always-on
эффектов): **`withEffects:false`** на сервере и **прогрев синглтон-handle**, чтобы RxJS-
подписки/таймеры/сокеты не «зависали» навсегда в Node-процессе. Это тонкий и правильно
закрытый момент.

---

## 4. Ключевые различия (где Synapse проще, а где TanStack дальше)

### 4.1 Гранулярность: один стор-объект vs кэш многих запросов
- **TanStack:** дегидрирует **весь кэш** как массив запросов по `queryKey`. Одна
  `<HydrationBoundary>` поднимает данные **всех** запросов страницы сразу.
- **Synapse:** дегидрирует **один модуль** = один plain-объект. На странице с несколькими
  модулями нужен **свой `dehydratedState` на каждый провайдер** (твой passthrough-паттерн:
  посты → внешний HOC, комменты → отдельный проп до `CommentsProvider`). Больше «проводки».

### 4.2 Слияние: full-replace vs merge-по-свежести
- **TanStack:** `hydrate` **не затирает** более свежие клиентские данные
  (`dehydratedAt > dataUpdatedAt`) и **мерджит** запросы. Это критично для streaming SSR,
  повторных боундари и concurrent-рендера.
- **Synapse:** `storage.hydrate` = **полная замена** (`doSet('', state)`). Для первого
  paint это ок. Но если на клиенте уже есть более свежее состояние (повторный seed,
  клиентская навигация, прерванный transition) — оно будет затёрто. Нет метки свежести
  типа `dehydratedAt`.

### 4.3 Сериализация: plain-JSON vs подключаемый трансформер
- **TanStack:** `serializeData`/`deserializeData` (можно superjson) → корректно переносит
  `Date`, `Map`, `Set`, `BigInt`, `undefined`.
- **Synapse:** опирается на JSON-сериализуемость состояния через RSC-границу. Нежурналируемые
  типы в сторе (Date/Map/…) потеряют точность или сломаются. Хука для кастомной сериализации
  нет.

### 4.4 Streaming SSR / pending-promises
- **TanStack:** умеет дегидрировать **in-flight promise** (для streaming/RSC-prefetch),
  редактирует ошибки.
- **Synapse:** отгружает только **уже разрешённые** снапшоты. Streaming-сценарий не покрыт
  (для большинства приложений и не нужен, но это «потолок» зрелости).

### 4.5 Тайминг под React 18 (transitions/Suspense)
- **TanStack** осознанно расщепил гидрацию на render-фазу (новое) и effect-фазу
  (обновления), чтобы не мутировать UI при прерванных transition.
- **Synapse** делает seed в `useState`-инициализаторе + повтор в `useEffect`. Для типового
  кейса эквивалентно, но крайние случаи concurrent-рендера стоит покрыть тестами.

---

## 5. Вердикт: продакшен или нет?

**Архитектура — зрелая и верная.** Примитивы выбраны правильно (fork-изоляция,
`withEffects:false`, sync fast-path, seed-before-render, SSR-гейт, прогрев main handle),
а найденный баг с «лишним клиентским запросом» диагностирован и устранён по-настоящему
(в корне, а не симптоматически).

**Готово к проду для типового кейса:** первый paint SSR + SEO для **JSON-сериализуемого**
состояния, один/несколько модулей на страницу, обычный (не streaming) рендер. Здесь Synapse
делает ровно то же, что TanStack, и делает корректно.

**Пока НЕ дотягивает до уровня TanStack по робастности** в следующем:

| # | Что добавить | Зачем | Приоритет |
|---|---|---|---|
| 1 | Мердж-по-свежести в `hydrate` (опц. метка `hydratedAt` + «не затирать более свежее») | защита от клобберинга при повторном seed / навигации / transition | высокий |
| 2 | Подключаемый `serialize`/`deserialize` (superjson-совместимо) | Date/Map/Set/BigInt в сторе | средний |
| 3 | Переименовать `createSynapseCtx.dehydrate({ initialState })` → `serverState`/`preloadedState` | устранить конфляцию с модульным `initialState` (ты сам это отметил) | низкий, но дешёвый |
| 4 | Эргономика мульти-модульных страниц (один контейнер на несколько снапшотов) | убрать passthrough-проводку нескольких `dehydratedState` | средний |
| 5 | Тесты SSR: no request-bleed между форками, seed-before-render, async-store путь, идемпотентность повторного seed, concurrent-рендер | «production» = покрыто тестами | высокий |
| 6 | (Опц.) streaming SSR / dehydrate pending-promise | паритет с TanStack на RSC-streaming | низкий |

### Итого
- Как **внутренняя/продуктовая** библиотека под конкретное приложение — **да, это продакшен**
  (с документированными ограничениями: JSON-only состояние, full-replace hydrate, по снапшоту
  на модуль).
- Как **публичная замена TanStack Query общего назначения** — нужно закрыть пункты 1, 2, 5
  (мердж/свежесть, сериализация, тесты), тогда будет «по-настоящему робастно».

То, что ты понял один механизм (Synapse) — значит понял и TanStack: различия здесь
инженерные (гранулярность, мердж, сериализация, streaming), а **базовая модель
«snapshot → граница → seed перед рендером» у вас одна и та же**.
