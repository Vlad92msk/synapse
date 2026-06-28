# Анализ ApiClient: standalone-использование, хуки и SSR

> Дата: 2026-06-28. Только анализ, код не менялся.
> Область: `packages/synapse/src/api`, плюс смежные `core/storage` (гидрация) и `react`.

---

## TL;DR

1. **`api/example.ts` — можно и нужно удалить.** Это playground-файл с top-level
   `await`, который нигде не импортируется. Канонический пример живёт в
   `packages/examples` (`pokemon.api.ts`), на него же ссылается документация.
   Файл вреден: он экспортируется из бандла? — нет, из `api/index.ts` он не
   реэкспортируется, но он содержит top-level await и боевой запрос к PokeAPI,
   что является миной (см. ниже).

2. **`useQuery`-хук в стиле React Query — реализуем, причём малой кровью.**
   Вся механика (дедупликация, кэш по тегам, подписки на состояние запроса,
   отмена) уже есть в `EndpointClass`. Хук — это тонкая обёртка над
   `endpoint.request(params).subscribe(...)` через `useSyncExternalStore`.
   ApiClient **полностью самостоятелен**: он не зависит ни от `reactive`/RxJS,
   ни от `createSynapse`. Пользователь может взять только `synapse-storage/api`
   + `synapse-storage/core` и ничего больше.

3. **SSR (серверный запрос → дегидрация → гидрация на клиенте) — принципиально
   возможен уже сейчас**, потому что:
   - сетевой слой server-safe (`fetch` глобальный, `fetchFn` конфигурируем,
     все обращения к `window`/`document`/`localStorage` спрятаны за
     `typeof ... !== 'undefined'`);
   - `MemoryStorage` синхронно-готов и работает на сервере;
   - у любого `IStorage` уже есть `hydrate()` / `getStateSync()`, а кэш-метки
     времени абсолютные (`expiresAt = Date.now() + ttl`), поэтому переживают
     перенос с сервера на клиент;
   - `QueryStorage.rebuildTagIndex()` восстанавливает индекс тегов из засеянного
     состояния при `init()`.

   **НО** «из коробки» не хватает двух вещей для UX-паритета с React Query:
   (а) удобного API дегидрации/гидрации на уровне самого `ApiClient`
   (сейчас это можно сделать только вручную через storage-инстанс);
   (б) **синхронного чтения кэша** — сейчас `getCachedResult` всегда `async`,
   поэтому при первом клиентском рендере после гидрации будет «вспышка» loading,
   даже если данные уже лежат в засеянном сторе.

   То есть мы **не ограничены только клиентом** — серверный путь реален.
   Ограничение по IndexedDB (нет на сервере) решается выбором стораджа:
   `MemoryStorage` на сервере, любой на клиенте — ровно как ты и предполагал.

---

## 1. `api/example.ts` — удалять

### Что это
`packages/synapse/src/api/example.ts` (152 строки) — демонстрация: типы PokeAPI,
создание `IndexedDBStorage`/`MemoryStorage`, `new ApiClient({...})`, и
**top-level**:

```ts
export const pokemonApi = await api.init()        // top-level await + сетевой init
export const pokemonEndpoints = pokemonApi.getEndpoints()
```

### Почему удалять
- **Нигде не импортируется.** Grep по `src` (кроме самого файла) не нашёл ни
  одного потребителя `example` / `pokemonApi`.
- **Не реэкспортируется** из `api/index.ts` (там только `api.module`,
  `ResponseFormat`/`RetryConfig`, `api-helpers`). То есть в публичном API его нет.
- **Top-level `await` + реальный запрос к сети как сайд-эффект модуля** — это
  потенциальная мина: при любом случайном импорте файла модуль полезет в
  `pokeapi.co` и в IndexedDB на этапе загрузки. `console.log('Starting API
  initialization...')` это подтверждает — это отладочный скетч, а не код.
- **Дублирует канонический пример.** Реальный, поддерживаемый пример —
  `packages/examples/.../pokemon.api.ts`, и именно на него ссылается
  `docs/ru/api-client.md`.

### Риск удаления
Минимальный. Перед удалением стоит формально убедиться, что файл не попадает в
сборку как entry (он не должен — точка входа `api/index.ts`). Проверить
`rslib`-конфиг бандла на наличие явного включения `example.ts`.

**Вывод: удалить `api/example.ts`.**

---

## 2. Хук `useQuery` для standalone-использования ApiClient

### Главный вывод: ApiClient уже самодостаточен
`ApiClient` / `EndpointClass` импортируют только:
- свои типы и утилиты внутри `api/`,
- `IStorage` из `core`.

Никакого RxJS, никакого `reactive`, никакого `createSynapse`. RxJS-обёртка
(`fromRequest`) живёт в `reactive/effects` и подключается **только** если
пользователь идёт по пути эффектов. Значит сценарий «хочу только API-клиент
с хуками, без state-manager» технически уже поддержан на уровне ядра — не
хватает лишь React-обёрток.

### Что уже даёт `EndpointClass` (фундамент для хука)
`endpoint.request(params, options)` возвращает `RequestResponseModify`:
- `subscribe(listener, { autoUnsubscribe })` — стрим состояния запроса
  (`idle → loading → success/error`, с `data`, `error`, `fromCache`);
- `wait()` / `then/catch/finally` — промис результата;
- `waitWithCallbacks({ idle, loading, success, error })`;
- `abort()`.

Под капотом уже работают:
- **Дедупликация** in-flight запросов по cacheKey (`inflightRequests`);
- **Кэш** с TTL и инвалидацией по тегам;
- **Отмена** через `AbortController` (+ связывание с пользовательским `signal`);
- **Retry** с настраиваемой стратегией.

То есть всё, ради чего в React Query существует `QueryClient`, у нас уже лежит
в эндпоинте.

### Как может выглядеть хук
Паттерн уже отработан в `react/hooks/useSelector.ts` (через
`useSyncExternalStore`). Аналогично:

```ts
// псевдокод предлагаемого useApiQuery
function useApiQuery(endpoint, params, options) {
  const stateRef = useRef<RequestState>({ status: 'idle', ... })

  useEffect(() => {
    const req = endpoint.request(params, options)   // стартует запрос
    const unsub = req.subscribe((s) => {
      stateRef.current = s
      forceRender()                                 // или setState
    }, { autoUnsubscribe: false })
    return () => { req.abort(); unsub() }
  }, [endpoint, serialize(params)])                 // ре-запрос при смене params

  return stateRef.current  // { status, data, error, fromCache, refetch, ... }
}
```

Сигнатуры на выбор:
- `useApiQuery(apiClient, 'getList', params, options)` — через клиент;
- `useEndpointQuery(endpoints.getList, params, options)` — через сам эндпоинт
  (типобезопаснее: тип `params`/`data` выводится из эндпоинта).

Плюс симметричный `useApiMutation(endpoints.createPokemon)` →
`{ mutate, mutateAsync, status, data, error }` (мутация = `request()` без кэша,
с `invalidatesTags`).

### Подводные камни (важно для корректной реализации)
1. **`request()` стартует немедленно** (в `request()` синхронно вызывается
   `executeRequest`). Значит вызывать его можно только в `useEffect`/событии,
   не в теле рендера.
2. **Идентичность `params`.** Нужна стабильная сериализация ключа зависимостей
   (как `createApiKey` сортирует ключи). Иначе новый объект `{id:1}` каждый
   рендер → бесконечные ре-запросы.
3. **`autoUnsubscribe`.** В `RequestResponseModify.subscribe` дефолт
   `autoUnsubscribe: true` — подписка снимается по завершению `waitPromise`.
   Для хука, который хочет жить дольше одного запроса (рефетч, обновления из
   кэша по инвалидации), нужно `autoUnsubscribe: false` и ручная очистка.
4. **`enabled`/lazy.** React Query умеет `enabled: false`. Легко добавить —
   просто не дёргать `request()` в эффекте.
5. **`fetchCounts` растёт на каждый `request()`** — это счётчик, не ломает
   логику, но в StrictMode (двойной маунт) надо быть аккуратным с abort.
6. **Реакция на инвалидацию по тегам.** Сейчас при `invalidatesTags` кэш
   удаляется, но **активные подписчики других эндпоинтов об этом не узнают**
   (нет «cache-event bus»). React Query при инвалидации авто-рефетчит активные
   запросы. У нас этого механизма нет — для полноценного паритета понадобится
   событие об инвалидации, на которое хук подпишется и сделает рефетч.
   Без него `useApiQuery` будет отдавать кэш до истечения TTL, но не
   «оживать» после мутации соседнего эндпоинта.

### Вывод по хуку
Реализуемо. Базовый `useApiQuery`/`useApiMutation` — небольшая обёртка поверх
уже готового эндпоинта, кладётся в `react/hooks` и экспортируется из
`synapse-storage/react` (или в отдельный `synapse-storage/api-react`, чтобы не
тащить React в чисто-серверные сценарии). Для **полного** паритета с React Query
не хватает шины событий инвалидации (п. 6) и синхронного чтения кэша (см. §3).

---

## 3. SSR: серверный запрос → дегидрация → гидрация на клиенте

### Что уже есть
- **Сетевой слой server-safe.** `fetchBaseQuery` использует глобальный `fetch`
  (Node ≥18) и допускает кастомный `fetchFn`; `buildRequestUrl` корректно
  обрабатывает серверный кейс; `createHeaderContext` обращается к
  `localStorage`/`document` только под `typeof ... !== 'undefined'`.
- **Storage-гидрация.** `IStorage.hydrate(state)` (и sync, и async варианты):
  вызванная **до** `initialize()` — засевает стор так, что `initialState` его не
  перезатрёт; после — заменяет и уведомляет подписчиков. Покрыто тестом
  `core/storage/__tests__/hydrate.test.ts` для memory/localStorage/indexedDB.
- **Снимок состояния.** `getStateSync()` / `getState()` отдают всё состояние
  стора, включая записи кэша API (они хранятся прямо в state стора под
  cache-key’ами).
- **Время жизни кэша переносимо.** `CacheUtils.createMetadata` пишет абсолютные
  `expiresAt` — после переноса на клиент TTL продолжает считаться корректно.
- **Индекс тегов восстановим.** `QueryStorage.rebuildTagIndex()` при `init()`
  заново строит `tagIndex` из засеянных записей — инвалидация по тегам на
  клиенте после гидрации работает.
- **Прецедент уже есть на уровне state-manager.** `utils/dehydrateModule.ts` +
  `react/utils/createSynapseCtx.tsx` делают полноценный SSR для синапс-модулей
  (форк per-request, `ready({ withEffects: false })`, `hydrate`, прогрев main
  handle при `ssr: true`). Это готовый шаблон, который можно повторить для
  ApiClient.

### Как это работает уже сейчас (вручную, без изменений кода)
Поскольку **storage создаёт пользователь и держит ссылку на него**, SSR-связку
можно собрать руками:

```ts
// --- server ---
const storage = await new MemoryStorage({ name: 'api-cache', initialState: {} }).initialize()
const api = new ApiClient({ storage, baseQuery: {...}, endpoints })
await api.init()
await api.request('getList', { limit: 12, offset: 0 })   // прогрев кэша
const dehydrated = storage.getStateSync()                // → сериализовать в HTML

// --- client ---
const storage = new MemoryStorage({ name: 'api-cache', initialState: {} })
storage.hydrate(dehydrated)        // ДО init → init не затрёт
const api = new ApiClient({ storage, baseQuery: {...}, endpoints })
await api.init()                   // rebuildTagIndex поднимет теги
// первый request('getList', sameParams) → попадание в кэш
```

Это **работает уже сегодня**. Значит ответ на твой вопрос: мы **не** ограничены
клиентом — серверный путь реален, и для NextJS достаточно `MemoryStorage` на
сервере, а на клиенте пользователь волен взять любой стор.

### Чего не хватает для нормального DX и UX
1. **API дегидрации/гидрации на уровне `ApiClient`.** Сейчас приходится
   дёргать `storage.getStateSync()` / `storage.hydrate()` напрямую. Просится
   симметрия с `dehydrateModule`:
   - `apiClient.dehydrate(): Promise<TCacheState>` — снимок кэша;
   - `apiClient.hydrate(state)` — засев (до/после init).
   `queryStorage` и сам `storage` сейчас **приватны** в `ApiClient`
   (`private queryStorage`), публичного доступа к снапшоту кэша через клиент нет
   — это и есть пробел.

2. **Синхронное чтение кэша — ключевое для SSR-UX.** `QueryStorage.getCachedResult`
   — `async` (он и для IndexedDB должен быть async). Но `MemoryStorage` умеет
   `getStateSync()`. Из-за async-чтения `executeRequest` всегда делает минимум
   один «тик» в `loading`, **даже если данные уже в засеянном сторе**. Итог:
   на первом клиентском рендере после гидрации будет вспышка loading вместо
   мгновенного показа серверных данных. Для паритета с React Query нужен
   **синхронный fast-path чтения кэша** для sync-сторов (Memory/LocalStorage):
   `endpoint.getCachedSync(params)` → хук возвращает данные на первом рендере
   (как `getServerSnapshot` в `useSelector`).

3. **`request()` как «прогрев» (prefetch) на сервере.** Уже доступно через
   `api.request(...)`, но просится явный `prefetch`-хелпер и документированный
   рецепт для NextJS (App Router / RSC), по аналогии с тем, как
   `dehydrateModule` оформлен «server only».

4. **Cache-key стабильность server↔client.** Ключ кэша включает
   `cacheableHeaderKeys`. Если на сервере и клиенте набор влияющих на кэш
   заголовков различается (например, auth), ключи разойдутся и гидрация «не
   попадёт». Это стандартный для SSR нюанс — нужно задокументировать и/или
   позволять исключать заголовки из ключа для SSR-эндпоинтов
   (`excludeCacheableHeaderKeys` уже есть — годится).

### Вывод по SSR
Серверный сценарий реален и частично работает уже сейчас. Чтобы довести до
уровня RTK Query/React Query c SSR:
- (минимум) добавить `apiClient.dehydrate()/hydrate()` как тонкие обёртки над
  storage — чисто DX;
- (важно для UX) добавить синхронный fast-path чтения кэша для sync-сторов,
  иначе будет loading-вспышка после гидрации;
- (для паритета хуков) добавить шину событий инвалидации, чтобы активные
  `useApiQuery` рефетчились после мутаций.

---

## Итоговые рекомендации (приоритезированно)

| # | Действие | Объём | Зачем |
|---|----------|-------|-------|
| 1 | Удалить `api/example.ts` | тривиально | мёртвый код + top-level сетевой сайд-эффект |
| 2 | `useApiQuery` / `useApiMutation` в `react/hooks` | малый | standalone-использование без BLL/RxJS |
| 3 | `ApiClient.dehydrate()/hydrate()` (обёртки над storage) | малый | удобный SSR-API, симметрия с `dehydrateModule` |
| 4 | Синхронный fast-path чтения кэша для sync-сторов | средний | убрать loading-вспышку при SSR-гидрации |
| 5 | Шина событий инвалидации кэша | средний | авто-рефетч активных хуков после мутаций (паритет с RQ) |
| 6 | Док-рецепт SSR для NextJS (Memory на сервере) | малый | оформить уже работающий путь |

**Ответ на исходные вопросы:**
- `example.ts` — **удалить**.
- `useQuery`-хук — **можно**, ядро уже всё умеет, нужен тонкий React-слой.
- SSR-дегидрация/гидрация — **не ограничены клиентом**, серверный путь реален
  (Memory на сервере, любой стор на клиенте); базово работает уже сейчас,
  для UX-паритета стоит добавить п.3–5.
</content>
</invoke>
