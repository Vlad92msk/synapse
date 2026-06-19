# SSR / гидрация в Synapse — разбор на примере ленты постов

> Документ образовательный. Цель — объяснить **как работает концепция** SSR-гидрации
> в нашем стейт-менеджере: что такое `dehydrate` / `hydrate` / `fork` / `ssr`, какие
> методы вызываются на каждом шаге, как при этом трансформируются данные и зачем.
> Разбор идёт по реальному коду профиля (`sn_client`) + ядру (`packages/synapse`).
>
> ✅ Обновлено: лишний клиентский запрос на постах устранён. Корень был не в директиве
> `'use client'` у библиотечной `dehydrate` (её там нет), а в том, что **прогрев основного
> handle жил только внутри замыкания `dehydrate`**, доступного лишь через клиентский HOC
> `createSynapseCtx` (а тот — в `'use client'`-модуле, на сервер не импортнуть). Поэтому
> ручной `dehydratePostsFeed` форкал отдельный handle и main-стор не прогревал → на сервере
> `getStoreIfReady()` пуст → рендерился `loadingComponent`, а клиент догружал ленту.
> Решение — server-safe `dehydrateModule` из `synapse-storage/utils` (без React, импортируется
> в RSC напрямую): тот же форк + прогрев main handle при `ssr: true`. На неё теперь опираются и
> `dehydratePostsFeed`, и замыкание `dehydrate` (одна логика, без дубля). См. ШАГ 2.

---

## 0. TL;DR в трёх предложениях

1. **На сервере** мы фетчим данные, создаём временный изолированный стор (`fork`),
   заливаем туда данные (`hydrate`) и снимаем с него **plain-JSON-снапшот**
   (`getStateSync`) — это и есть «обезвоживание» (`dehydrate`).
2. Снапшот едет пропом `dehydratedState` в клиентский компонент и **синхронно
   заливается** в клиентский стор **до первого рендера** (`seedHydration → hydrate`).
3. Поэтому первый рендер на клиенте даёт **тот же HTML**, что на сервере → React
   DOM-гидрация проходит без mismatch, контент виден сразу (SEO), без `useEffect`-запроса.

---

## 1. Два разных смысла слова «гидрация»

Слово перегружено, и из-за этого вся путаница. Их **два**:

| Термин | Уровень | Что делает | Где в коде |
|---|---|---|---|
| **DOM-гидрация** | React | `hydrateRoot` берёт готовый серверный HTML и «оживляет» его: навешивает обработчики, переиспользует DOM | внутри Next.js, нам не виден |
| **State-гидрация** | Synapse | заливает plain-снапшот данных в живой стор | `storage.hydrate()` |

> «Тут же нет HTML, только данные» — **верно**. `storage.hydrate()` — это про **данные**.
> Но он **обслуживает** DOM-гидрацию: чтобы React DOM-гидрация прошла без mismatch,
> первый клиентский рендер обязан дать **тот же markup**, что сервер. Markup зависит от
> состояния стора. ⇒ стор на первом клиентском рендере должен содержать **те же данные**,
> что на сервере. Поэтому state-гидрация (данные) и DOM-гидрация (HTML) — две стороны
> одного процесса.

---

## 2. Почему нельзя «просто initialState» и нельзя `useEffect`

- **SEO требует контент в серверном HTML.** Контент зависит от данных. Значит данные
  нужны **синхронно в момент серверного рендера**.
- **`useEffect` не подходит:** на сервере он не запускается вообще, а на клиенте
  срабатывает уже *после* первой отрисовки. ⇒ контента в серверном HTML не будет.
- **`initialState` тоже не решает:** это **статический дефолт**, зашитый в фабрику
  модуля (`posts.synapse.ts`, `list: []`). А нам нужны **динамические данные под
  конкретный запрос** (посты именно этого профиля). Это разные вещи:

| | `initialState` | dehydratedState (снапшот) |
|---|---|---|
| Происхождение | статический дефолт в фабрике | данные, сфетченные на сервере под запрос |
| Когда известен | на этапе определения модуля | в рантайме, на каждый HTTP-запрос свой |
| Приоритет | база | **переопределяет** `initialState` |

Вся «лишняя» терминология (`dehydrate`/`hydrate`/`fork`) существует ради двух задач,
которых у простого `initialState` нет: **(а)** перенос данных через границу сервер→клиент
в виде сериализуемого JSON и **(б)** изоляция параллельных запросов на сервере.

---

## 3. Словарь терминов (коротко, перед разбором)

- **`fork`** — независимая копия модуля из той же фабрики: свой стор, свой жизненный цикл.
  Нужен на сервере: Node обслуживает много запросов в одном процессе; общий синглтон-стор
  привёл бы к «протечке» данных между запросами (request bleed).
- **`dehydrate`** — «обезвоживание»: из живого стора (методы, подписки, реактивность)
  выжать **сухой plain-снапшот** (просто данные), пригодный для JSON-сериализации.
- **`hydrate`** — обратное: залить plain-снапшот **обратно** в живой стор.
- **`ssr: true`** — флаг Provider'а: при синхронно-готовом сторе рендерить **children**
  (контент) в серверный HTML, а не `loadingComponent`.

---

## 4. Полный разбор на примере постов

### Действующие лица

| Файл | Роль |
|---|---|
| `app/[locale]/[userId]/profile/page.tsx` | RSC-страница (сервер): фетч + dehydrate |
| `modules/posts/api/posts.server.ts` | `fetchInitialFeed`, `dehydratePostsFeed` (server-only) |
| `services/api/server.ts` | `serverRequest` — прямой fetch на бэкенд с cookie |
| `app/[locale]/[userId]/_components/ProfileContent.tsx` | client-компонент, прокидывает проп |
| `modules/posts/ui/PostsFeed.tsx` | client, обёрнут в `withPosts` |
| `modules/posts/synapse/posts.context.tsx` | `withPosts = createSynapseCtx(postsSynapse, { ssr: true })` |
| `packages/synapse/.../createSynapseCtx.tsx` | ядро: Provider-HOC, `seedHydration`, `dehydrate` |
| `packages/synapse/.../factory.ts` | `fork()`, `ready({ withEffects? })` (с/без эффектов), `getSnapshot()` |
| `packages/synapse/.../sync-base-storage.service.ts` | `hydrate()` стора |
| `packages/synapse/.../storage-core.ts` | `getStateSync()`, `initialize()` |

---

### ШАГ 1 — Серверный фетч данных (RSC)

`page.tsx`:

```ts
const [resolved, feed] = await Promise.all([
  resolveViewedProfile(userId, session?.user?.email),
  fetchInitialFeed(userId),               // ← первая страница ленты
])
```

`fetchInitialFeed` (`posts.server.ts`):

```ts
export const fetchInitialFeed = async (ownerPublicId: string): Promise<PostsFeedResponseDto | null> => {
  try {
    return await serverRequest<PostsFeedResponseDto>(
      postsRequests.findAll({ owner_public_id: ownerPublicId, limit: POSTS_PAGE_SIZE }),
    )
  } catch {
    return null   // ← на ошибке: null → клиент догрузит обычным путём
  }
}
```

- **Что вызывается:** `serverRequest` → прямой `fetch(url, { cache: 'no-store' })` на
  бэкенд с проброшенной cookie сессии (см. `services/api/server.ts`). **Без** клиентского
  `ApiClient`, без кэша, без synapse.
- **Что с данными:** получаем сырой DTO `PostsFeedResponseDto` —
  `{ data: PostResponseDto[], cursor, has_more }`.
- **Зачем:** данные должны существовать **до** рендера, синхронно для сервера.
- **Важно:** `POSTS_PAGE_SIZE` тот же, что на клиенте — чтобы `cursor`/`has_more` сошлись
  и клиентская пагинация продолжилась бесшовно.

> Данные на этом шаге — **сырой ответ API**. Это ещё **не** форма стора. Форму придаёт шаг 2.

---

### ШАГ 2 — `dehydratePostsFeed`: сборка снапшота (сердце серверной части)

`posts.server.ts`:

```ts
export const dehydratePostsFeed = async (
  feed: PostsFeedResponseDto | null,
  ownerPublicId: string,
): Promise<PostsState | null> => {
  if (!feed) return null
  try {
    // вся серверная механика (форк → ready(без эффектов) → hydrate → снапшот → destroy + прогрев main)
    // живёт в server-safe dehydrateModule; здесь — только маппинг DTO → PostsState
    return await dehydrateModule(postsSynapse, {
      ssr: true,                              // ← прогрев основного handle (см. 2.seed)
      state: {                                // ← накладывается поверх initialState форка
        list: feed.data,
        cursor: feed.cursor,
        hasMore: feed.has_more,
        ownerPublicId,
        api: { postsRequest: { status: ApiStatus.Success, error: null }, /* + дефолты ячеек */ },
      },
    })
  } catch {
    return null
  }
}
```

Раньше эти шаги (форк → ready → getStateSync → hydrate → getStateSync → destroy) писались здесь
руками, **но без прогрева основного handle** — отсюда и баг (на сервере стор пуст → спиннер →
клиентская догрузка). Теперь они инкапсулированы в `dehydrateModule` (`synapse-storage/utils`):
server-safe, импортируется в RSC напрямую (React-зависимостей нет). Разберём, что она делает
внутри — это ровно те под-шаги:

#### (2.1) `postsSynapse.fork()` — изоляция запроса

`factory.ts`:

```ts
fork() {
  // Независимый handle из той же фабрики — со своим стором и жизненным циклом.
  return createSynapseModule<TState, TDispatcher, TSelectors>(factory)
},
```

- **Что вызывается:** создаётся **новый ленивый handle** поверх той же фабрики
  `postsSynapse` (та, что в `posts.synapse.ts` через `createSynapse(async () => {...})`).
  Фабрика пока **не** исполнена — handle ленивый.
- **Что с данными:** пока ничего. Просто получили независимый «завод».
- **Зачем (тезисно):**
  - Node-сервер обслуживает **много запросов параллельно в одном процессе**.
  - Если бы все они делили модульный синглтон-стор `postsSynapse`, посты запроса A
    протекли бы в HTML запроса B (**request bleed**).
  - `fork()` даёт **каждому запросу свой стор** → изоляция.

#### (2.2) `await fork.ready({ withEffects: false })` — сборка стора БЕЗ эффектов

`factory.ts` (`buildSynapse`): `ready({ withEffects: false })` исполняет фабрику **один раз**
в режиме `withEffects: false` — собирает стор, но **пропускает** `effectsModule.start()`:

```
config = await factory()        // getPostsEndpoints, getCoreSynapse, new MemoryStorage(...)
await storage.initialize()      // стор переходит IDLE → LOADING → READY, засевается initialState
dispatcher[FINALIZE](); ...     // финализация слоёв
state$ = toObservable(storage)
// effectsModule.start() ПРОПУЩЕН — на сервере эффекты не нужны (см. 2.seed)
```

- **Что вызывается:** фабрика `postsSynapse` → создаётся `MemoryStorage<PostsState>` с
  `initialState` (`list: []`, `cursor: null`, ...), `storage.initialize()` доводит стор
  до `READY`. Эффекты (`connection`, `counterPolling`, сокет) **не стартуют**.
- **Что с данными:** стор сейчас содержит **дефолтный `initialState`** (пустая лента).
- **Зачем:** получить **готовый** изолированный стор для снапшота, не запуская на сервере
  ни одной RxJS-подписки/таймера/сокета. Раньше тут был `ready()` (со `start()`) — лишняя
  работа: эффекты стартовали лишь чтобы тут же быть уничтоженными в `destroy()`.

#### (2.3) `const snapshot = storage.getStateSync()` — снимаем дефолт

`storage-core.ts`:

```ts
public getStateSync(): T {
  return this._stateCache
}
```

- **Что вызывается:** синхронное чтение текущего состояния (внутренний `_stateCache`).
- **Что с данными:** получаем объект `PostsState` = текущий `initialState` форка.
- **Зачем:** взять **базу со всеми полями** (включая `api`, `editingPostId` и пр.),
  чтобы дальше переопределить только нужные поля и не потерять структуру.

#### (2.4) `await storage.hydrate({...})` — заливаем данные в форк

Здесь сырой DTO **превращается в форму стора** `PostsState`:

```ts
await storage.hydrate({
  ...snapshot,                                 // база: api, editingPostId, deletingPostId...
  list: feed.data,                             // DTO.data        → PostsState.list
  cursor: feed.cursor,                         // DTO.cursor      → PostsState.cursor
  hasMore: feed.has_more,                       // DTO.has_more    → PostsState.hasMore
  ownerPublicId,                               // из аргумента    → PostsState.ownerPublicId
  api: { ...snapshot.api,
         postsRequest: { status: ApiStatus.Success, error: null } }, // запрос «как будто уже успешно выполнен»
})
```

`hydrate` в сторе (`sync-base-storage.service.ts`):

```ts
public hydrate(state: T): void {
  this.doSet('', state)                  // заменяет ВСЁ состояние
  this._stateCache = this.getRawState()  // обновляет синхронный кэш
  if (this.config.version !== undefined) this.writePersistedVersion(this.config.version)
  this.notifyHydration(this._stateCache) // уведомляет подписчиков (на сервере их нет → no-op)
}
```

- **Что вызывается:** `doSet('', state)` — **полная замена** состояния стора снапшотом.
- **Что с данными:** разрозненные поля DTO **разложены по форме `PostsState`**. Обрати
  внимание на `api.postsRequest = Success`: мы помечаем «первичная загрузка уже сделана»,
  чтобы клиент **не** считал, что надо грузить заново (это и есть точка, в которой по
  задумке клиентского запроса быть не должно).
- **Зачем (тезисно):** превратить сырой ответ сервера в **точное состояние стора**, какое
  было бы после успешной клиентской загрузки.

> 📌 Важная деталь дизайна: `hydrate` **намеренно не требует** `ready()` и может
> вызываться даже **до** `initialize()` — тогда инициализация не перезатрёт залитое
> состояние своим `initialState`. Здесь (на сервере) мы зовём его после `ready()`,
> поэтому `hydrate` просто **заменяет** уже готовое состояние. Та же `hydrate` на клиенте
> (шаг 6) работает по тому же контракту.

#### (2.5) `return storage.getStateSync()` — снимаем готовый снапшот

- **Что вызывается:** снова `getStateSync()` — но теперь стор уже **залит данными**.
- **Что с данными:** получаем **финальный `PostsState`** с реальной лентой. Это **plain
  JS-объект** (никаких методов/классов) → сериализуем в JSON. Это и есть результат
  «обезвоживания».
- **Зачем:** именно этот объект уедет на клиент пропом `dehydratedState`.

#### (2.6) `fork.destroy()` — убираем форк

`factory.ts` `destroy()` → `synapse.destroy()` → `teardown(cleanup)` в LIFO:
чистит dispatcher/selectors/storage (эффекты в режиме `ready({ withEffects: false })` не
стартовали — останавливать нечего).

- **Зачем:** форк был временным, нужным только чтобы родить снапшот. Утечки памяти/
  подписок/сокетов на сервере недопустимы → форк всегда уничтожается.

#### (2.seed) Прогрев основного handle (только при `ssr: true`) — суть фикса

```ts
if (ssr) {
  const main = await synapseModule.ready({ withEffects: false })  // основной (не форк!) handle, БЕЗ эффектов
  if (main.storage.initStatus.status === StorageStatus.READY) {
    await main.storage.hydrate(snapshot)                          // заливаем тот же снапшот
  }
}
```

- **Что вызывается:** `ready({ withEffects: false })` основного (общего) handle модуля +
  `hydrate(snapshot)` в его стор. Он собирает стор так же, как обычный `ready()`, но
  **без `effectsModule.start()`** — это
  критично именно для main handle: он синглтон, живёт между запросами в Node-процессе и
  **никогда не destroy-ится**, поэтому стартованные на сервере эффекты «висели» бы навсегда.
  На клиенте main handle оживляет только `ready()` (через awaiter), который эффекты запускает.
- **Зачем (это и был пропущенный шаг):** провайдер на сервере берёт стор через
  `awaiter.getStoreIfReady()`, а его sync-fast-path (`resolveSyncReady`) отдаёт стор синхронно
  **только если `synapseModule.getSnapshot()` вернул собранный READY-handle**. Форк прогревает
  *свой* стор, но `getSnapshot()` смотрит на *основной* handle. Без этого прогрева на сервере
  `getStoreIfReady()` → `undefined` → рендерится `loadingComponent`, а лента догружается клиентом.
  Прогрев основного handle закрывает именно эту дыру. `seedHydration` в Provider всё равно
  переприменяет переданный `dehydratedState` синхронно перед каждым рендером — поэтому общий
  прогретый handle не ломает изоляцию деревьев.

> **Итог шага 2:** на выходе — `PostsState` как plain-объект (сырой DTO превратился в точную
> форму стора, временный форк отработал и уничтожен), а при `ssr: true` основной handle прогрет
> тем же снапшотом → на сервере провайдер отдаёт готовый стор и рендерит ленту в HTML.

---

### ШАГ 3 — Снапшот едет в дерево компонентов как проп

`page.tsx`:

```ts
const [dehydratedState, dehydratedComments] = await Promise.all([
  dehydratePostsFeed(feed, userId),     // ← PostsState | null
  dehydrateFeedComments(feed),
])

return (
  <ProfileContent
    fallbackProfile={resolved.view}
    dehydratedState={dehydratedState}        // снапшот постов
    dehydratedComments={dehydratedComments}  // снапшот комментов
  />
)
```

`ProfileContent.tsx` (client) — просто **прокидывает** проп дальше:

```tsx
<PostsFeed
  isOwn={profile.isOwn}
  dehydratedState={dehydratedState ?? undefined}
  dehydratedComments={dehydratedComments ?? undefined}
/>
```

- **Что с данными:** `PostsState` как сериализуемый объект проходит границу
  RSC (сервер) → client-компонент. При обычном Next.js это значит, что объект будет
  **сериализован в HTML-payload** и доступен на клиенте.
- **Зачем:** доставить серверный снапшот в то место, где живёт клиентский Provider стора.

> Заметь passthrough-паттерн: `dehydratedState` (посты) забирает **внешний** `withPosts`,
> а `dehydratedComments` едет отдельным пропом до `CommentsProvider` (см. `PostsFeed.tsx`).
> Одного пропа `dehydratedState` хватает только одному провайдеру в цепочке HOC, поэтому
> два разных снапшота разводят явной вложенностью провайдеров.

---

### ШАГ 4 — `PostsFeed` обёрнут в `withPosts`

`PostsFeed.tsx`:

```tsx
const PostsFeedShell = withPosts((props: PostsFeedShellProps) => {
  const { isOwn, dehydratedComments } = props
  return (
    <CommentsProvider dehydratedState={dehydratedComments}>
      <ReactionsProvider>
        <PostsBody isOwn={isOwn} />
      </ReactionsProvider>
    </CommentsProvider>
  )
})
```

`posts.context.tsx`:

```tsx
export const {
  contextSynapse: withPosts,
  // ...
} = createSynapseCtx(postsSynapse, { loadingComponent: <p>Loading posts…</p>, ssr: true })
```

- **Что вызывается:** `createSynapseCtx(postsSynapse, { ssr: true })` создаёт HOC
  `withPosts`. Когда `PostsFeed` рендерится, проп `dehydratedState` попадает **внутрь
  обёртки `WrappedComponent`** из `createSynapseCtx.tsx`.
- **Зачем `ssr: true`:** разрешить Provider'у рендерить **контент** (ленту) в серверный
  HTML при синхронно-готовом сторе — вместо `loadingComponent`.

---

### ШАГ 5 — Provider синхронно засевает стор (ядро гидрации)

Теперь — внутрь `createSynapseCtx.tsx`, `WrappedComponent`.

#### (5.1) Выбор awaiter — изоляция server-дерева

```ts
const resolveAwaiter = (): SynapseAwaiter<ReadySynapse> => {
  if (dehydratedState !== undefined) {
    if (!treeAwaiterRef.current) treeAwaiterRef.current = createSynapseAwaiter(synapseModule)
    return treeAwaiterRef.current     // per-tree awaiter (есть снапшот → SSR-путь)
  }
  return getClientAwaiter()           // общий клиентский синглтон (нет снапшота)
}
```

- **Что с данными:** раз `dehydratedState` пришёл — используется **per-tree awaiter**
  (изоляция server-рендера), а не общий клиентский синглтон.
- **Зачем:** на сервере нельзя шарить awaiter между деревьями/запросами (тот же request
  bleed, что и для стора).

#### (5.2) `seedHydration` — синхронный засев ДО первого рендера

```ts
const seedHydration = (store: ReadySynapse | undefined) => {
  if (store && dehydratedState !== undefined && store.storage.initStatus.status === StorageStatus.READY) {
    store.storage.hydrate(dehydratedState)    // ← та же hydrate, что на сервере
  }
}

const [synapseStore, setSynapseStore] = useState<ReadySynapse | undefined>(() => {
  const store = resolveAwaiter().getStoreIfReady()  // синхронно: готов ли стор?
  seedHydration(store)                              // если да — заливаем снапшот
  return store
})
```

- **Что вызывается:**
  1. `getStoreIfReady()` (awaiter) — синхронно вернуть стор, если он уже готов. На
     клиенте `MemoryStorage` готов синхронно (sync-стор), поэтому `getStoreIfReady()`
     отдаёт его сразу (см. `createSynapseAwaiter.ts`, `resolveSyncReady` — SSR sync-fast-path).
  2. `seedHydration(store)` → `store.storage.hydrate(dehydratedState)` — **заливаем
     серверный снапшот в клиентский стор СИНХРОННО, внутри ленивого инициализатора
     `useState`, то есть ДО первого рендера**.
- **Что с данными:** клиентский стор постов мгновенно получает **ту же ленту**, что была
  на сервере. `list`, `cursor`, `hasMore`, `api.postsRequest = Success`.
- **Зачем (тезисно):**
  - Первый клиентский рендер должен дать **тот же HTML**, что сервер → нет hydration
    mismatch.
  - Контент виден сразу, без `loadingComponent`, без `useEffect`-запроса.

#### (5.3) SSR-гейт: рендерим контент, а не спиннер

```ts
if (!synapseStore) return <>{loadingComponent}</>   // нет стора → спиннер

return (
  <SynapseContext.Provider value={synapseStore}>
    <Component {...restProps} ref={ref} />          // есть стор → контент в HTML
  </SynapseContext.Provider>
)
```

- **Что вызывается:** проверка `synapseStore`. Благодаря (5.2) на сервере (и на первом
  клиентском кадре) стор уже есть → рендерится `<Component/>` (лента), **не**
  `loadingComponent`.
- **Зачем:** без `ssr: true` + sync-стора здесь был бы спиннер (потому что обычно стор
  доезжает в `useEffect`, а он на сервере не идёт) → в серверном HTML был бы спиннер,
  без SEO. Здесь — реальный контент.

#### (5.4) `useEffect` — оживление на клиенте

```ts
useEffect(() => {
  // На сервере не исполняется. Здесь стартуют подписки/догрузка.
  const instance = resolveAwaiter()
  const current = instance.getStoreIfReady()
  seedHydration(current)               // повторный синхронный засев (идемпотентно)
  setSynapseStore(current)
  // ... onReady / onError подписки
}, [])
```

- **Что вызывается:** только на клиенте — подписки на готовность стора, синхронизация
  состояния, старт реактивности.
- **Что с данными:** стор уже засеян (5.2); тут он становится полностью «живым» —
  подписки, эффекты, дальнейшая пагинация/мутации идут отсюда.
- **Зачем:** разделить «первый кадр идентичен серверу» (синхронно, 5.2) и «дальнейшая
  жизнь стора» (асинхронно, тут).

---

### ШАГ 6 — Дальше: чтение через хуки/селекторы

Внутри `PostsBody` (под Provider'ом) компоненты читают ленту через
`usePostsSelectors()` / `usePostsActions()` (из `posts.context.tsx`). Они берут
**тот же** засеянный стор из контекста. На первом рендере селектор `list` уже отдаёт
серверные посты → карточки рендерятся и на сервере, и на клиенте идентично.

---

## 5. Поток данных целиком (схема)

```
СЕРВЕР (RSC, на каждый HTTP-запрос)
┌──────────────────────────────────────────────────────────────────────────┐
│ page.tsx                                                                    │
│  fetchInitialFeed(userId)                                                   │
│    └─ serverRequest(...) ─► fetch(no-store, cookie) ─► PostsFeedResponseDto │  сырой DTO
│                                                                            │
│  dehydratePostsFeed(feed, userId):                                          │
│    fork()                ─► изолированный handle (свой стор)                │
│    await ready({withEffects:false}) ─► MemoryStorage + initialState, READY (БЕЗ эффектов) │ стор = дефолт
│    getStateSync()        ─► snapshot базы (все поля)                        │
│    hydrate({...snapshot, list: feed.data, cursor, hasMore, api:Success})    │  DTO → форма стора
│    getStateSync()        ─► ИТОГОВЫЙ PostsState (plain JSON)                │  ← «обезвоживание»
│    fork.destroy()        ─► временный стор уничтожен                        │
│                                                                            │
│  <ProfileContent dehydratedState={PostsState}/>                            │
│  renderToString(...)     ─► HTML С КОНТЕНТОМ ленты (SEO)                    │
│  + PostsState сериализуется в payload                                       │
└──────────────────────────────────────────────────────────────────────────┘
                    │  HTML(с лентой) + сериализованный PostsState
                    ▼
КЛИЕНТ (hydrateRoot)
┌──────────────────────────────────────────────────────────────────────────┐
│ ProfileContent ─► PostsFeed (dehydratedState=PostsState)                    │
│  withPosts / createSynapseCtx.WrappedComponent:                            │
│    resolveAwaiter()       ─► per-tree awaiter (есть снапшот)                │
│    getStoreIfReady()      ─► клиентский MemoryStorage готов синхронно       │
│    seedHydration ─► storage.hydrate(dehydratedState)  СИНХРОННО до рендера  │  ← «возврат воды»
│    if (synapseStore) ─► рендер <PostsBody/> (НЕ loadingComponent)           │  HTML == серверный
│  ⇒ нет hydration mismatch, лента видна сразу, без useEffect-запроса        │
│    useEffect ─► подписки/эффекты, стор полностью «живой»                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Сводная таблица: метод → что делает с данными → зачем

| # | Вызов | Где | Данные до → после | Зачем |
|---|---|---|---|---|
| 1 | `serverRequest(findAll)` | `posts.server.ts` | — → `PostsFeedResponseDto` | взять данные на сервере, синхронно для рендера |
| 2 | `postsSynapse.fork()` | `factory.ts` | — → новый handle | изоляция запроса (no request bleed) |
| 3 | `fork.ready({ withEffects: false })` | `factory.ts` | — → готовый стор с `initialState` (без эффектов) | получить изолированный стор для снапшота, не стартуя эффекты на сервере |
| 4 | `getStateSync()` | `storage-core.ts` | стор → `PostsState` (дефолт) | взять базу со всеми полями |
| 5 | `hydrate({...})` | `sync-base-storage.ts` | DTO → `PostsState` (с лентой) | разложить DTO по форме стора, пометить `api=Success` |
| 6 | `getStateSync()` | `storage-core.ts` | стор → `PostsState` (plain JSON) | снять сериализуемый снапшот |
| 7 | `fork.destroy()` | `factory.ts` | стор → уничтожен | убрать временный стор (no leak) |
| 8 | проп `dehydratedState` | `page → ProfileContent → PostsFeed` | JSON через границу RSC | доставить снапшот в клиентский Provider |
| 9 | `getStoreIfReady()` | `createSynapseAwaiter.ts` | — → клиентский стор (sync) | синхронно получить стор до рендера |
| 10 | `seedHydration → hydrate` | `createSynapseCtx.tsx` | снапшот → клиентский стор | первый кадр == серверный, без mismatch |
| 11 | SSR-гейт `if (synapseStore)` | `createSynapseCtx.tsx` | — | контент в HTML вместо спиннера |
| 12 | `useEffect` | `createSynapseCtx.tsx` | — | оживить стор на клиенте (подписки/эффекты) |

---

## 7. Ответы на исходные вопросы

- **«Что такое гидрация?»** — заливка plain-снапшота данных в живой стор
  (`storage.hydrate`). Она существует, чтобы первый клиентский рендер совпал с серверным
  (обслуживает React DOM-гидрацию).
- **«Тут же только данные, не HTML»** — верно: `hydrate` про данные. HTML «оживляет»
  React (`hydrateRoot`); наша задача — дать React **одинаковые данные** на сервере и
  клиенте.
- **«Что за `ssr`?»** — флаг Provider'а: при синхронно-готовом сторе рендерить контент в
  серверный HTML (SEO) вместо `loadingComponent`.
- **«Что такое `fork`?»** — независимая копия модуля со своим стором; изоляция параллельных
  серверных запросов.
- **«Что такое `dehydrate`?»** — снять с (форкнутого, залитого) стора сериализуемый
  plain-снапшот для передачи на клиент.
- **«Всё сводится к initialState?»** — концептуально да («с каким состоянием стартует
  стор»), но механизм решает две доп. задачи: сериализуемый перенос сервер→клиент и
  изоляцию запросов. Плюс снапшот — это **динамика под запрос**, а `initialState` —
  статический дефолт, и снапшот его **переопределяет**.

---

## 8. Заметка про нейминг

Термины `hydrate` / `dehydrate` / `fork` / `ssr` / `dehydratedState` — индустриальный
стандарт (TanStack Query: `dehydrate` + `<HydrationBoundary>`; effector: `fork` +
`serialize`/`hydrate`; Redux: `preloadedState`). Менять их смысла нет — узнаваемо.

Единственное реально мутное место: в `createSynapseCtx.dehydrate(opts?: { initialState })`
аргумент назван **`initialState`**, хотя семантически это **серверные данные под запрос**,
а не статический `initialState` модуля. Из-за этого и кажется, что «всё про initialState».
В проде профиля эта функция не используется (там свой `dehydratePostsFeed`), но в ядре
аргумент стоит переименовать в `preloadedState` / `serverState`, чтобы убрать конфляцию.
```
