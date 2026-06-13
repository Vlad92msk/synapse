# Research 05: Паттерны использования synapse-storage в живом приложении (sn_client)

> Примечание: фоновый субагент не имел прав на чтение `/Users/vlad/web_dev/sn_client`,
> поэтому это исследование выполнено основной сессией напрямую по исходникам приложения.

## 0. Инвентаризация модулей

В приложении **8 синапсов** (7 фичевых + core):

| Синапс | Папка | Файлы (строк) | Особенности |
|---|---|---|---|
| core | `src/store/core/` | synapse 29, dispatcher 55, selectors 14, hooks 31, types 31, CoreProvider 25 | Tier-1, без эффектов, без api-веток |
| posts | `src/modules/posts/synapse/` | synapse 158, dispatcher 376, effects 575, selectors 37, context 18 | самый большой; externalSelectors + externalStates + socket |
| comments | `src/modules/comments/synapse/` | dispatcher 330, effects 284, synapse 106, selectors 24 | keyed api actions (`createKeyedApiActions`) |
| messenger | `src/modules/messenger/synapse/` | dispatcher 235, effects 214, synapse 84, selectors 20 | socket + externalStates |
| reactions | `src/modules/reactions/synapse/` | dispatcher 76, effects 84, synapse 62, selectors 12 | keyed, маленький листовой модуль |
| user | `src/modules/user/synapse/` | dispatcher 157, effects 149, synapse 62 | |
| media (3 синапса) | `src/modules/media/synapse/` | media/folders/galleryPicker, в сумме ~1000 | три синапса в одной папке |
| media-player | `src/modules/media-player/synapse/` | dispatcher 187, без effects | синапс без эффектов |

Итого ~4800 строк synapse-кода в приложении. Структура каждого модуля идентична:
`X.synapse.ts` (стейт + сборка) → `X.dispatcher.ts` → `X.selectors.ts` → `X.effects.ts` → `X.context.tsx`.

---

## 1. Повторяющийся boilerplate (что хочется убрать)

### 1.1 Ручное перечисление 5×N экшенов жизненного цикла API

Самая большая боль. `createApiActions` создаёт группу `init/loading/success/failure/reset`,
но `createDispatcher` требует ПЛОСКИЙ объект — каждую пятёрку расплющивают вручную.

`posts.dispatcher.ts:313-373` — итоговый вызов `createDispatcher` на **60 строк**, из них
25 строк — чисто механическое перечисление пятёрок:

```typescript
return createDispatcher(
  { storage },
  {
    mounted,
    unmounted,
    loadPosts: postsReq.init,
    loadPostsLoading: postsReq.loading,
    loadPostsSuccess: postsReq.success,
    loadPostsFailure: postsReq.failure,
    loadPostsReset: postsReq.reset,
    loadMore: loadMoreReq.init,
    loadMoreLoading: loadMoreReq.loading,
    // ... ×5 групп = 25 строк
    applyPosts,
    appendPosts,
    // ... ещё 9 чистых экшенов
  },
)
```

В posts 5 групп createApiActions (`posts.dispatcher.ts:132-139`), в comments — 5 keyed-групп
(`comments.dispatcher.ts:96-101`), в messenger — 3, в user — 3, в media — по 2-3.
**Суммарно по приложению ~20 групп × 5 = ~100 строк ручного «расплющивания»**, и имена
(`loadPostsLoading` и т.п.) собираются конкатенацией в голове, без проверки консистентности.

### 1.2 Двойное объявление каждого экшена: const + ключ в объекте

Каждый экшен объявляется константой, а потом повторяется ключом в `createDispatcher`:
`const applyPosts = action({...})` (`posts.dispatcher.ts:204`) и `applyPosts,`
(`posts.dispatcher.ts:363`). В posts — 14 чистых экшенов + 5 групп = **каждое имя написано
дважды**, и при добавлении экшена легко забыть включить его в объект (тогда он молча не существует).

В class-стиле `readonly applyPosts = this.action(...)` имя пишется один раз — поле класса и есть регистрация.

### 1.3 Обёртка `action({ meta, action: fn })` и сигнальные экшены

Каждый чистый «сигнальный» экшен — 3-4 строки церемонии (`posts.dispatcher.ts:146-149`):

```typescript
const mounted = action({
  meta: { description: 'Лента постов смонтирована (триггер начальной загрузки)' },
  action: (_store, payload: FeedLifecyclePayload) => payload,
})
```

Сигнатура `(_store, payload) => payload` для сигналов (store не используется) встречается в
posts 7 раз (`mounted/unmounted/startEdit/togglePin/repostPost/loadCounters/openPost/closePost`),
в comments — 5+ раз. Просится сахар вида `this.signal<FeedLifecyclePayload>('описание')`.

### 1.4 Шаблонная шапка каждого диспетчера

В каждом из 9 диспетчеров одинаково (`posts.dispatcher.ts:127-128`, `core.dispatcher.ts:12-13`,
`comments.dispatcher.ts:91-92`):

```typescript
export function createPostsDispatcher(storage: IStorage<PostsState>) {
  const action = defineAction<PostsState>()
  // ...
}
export type PostsDispatcher = ReturnType<typeof createPostsDispatcher>
```

— фабрика, локальный `action`, и экспорт типа через `ReturnType`. В class-стиле тип — это сам класс.

### 1.5 Шестипараметровый generic типа Effect + index-signature хак

В каждом модуле с эффектами объявляется локальный alias (`posts.effects.ts:25-42`):

```typescript
interface Services { api: PostsEndpoints; socket: PostsSocketService }
interface ExtStates {
  core$: Observable<CoreState>
  [key: string]: Observable<unknown>   // ← хак: без index signature тип не совместим
}
type PostsEffect = Effect<
  PostsState, PostsDispatcher, Services,
  Record<string, never>, Record<string, never>,  // ← два неиспользуемых слота
  ExtStates
>
```

Боли: (а) 6 позиционных generic-параметров, два из которых почти всегда `Record<string, never>`;
(б) обязательная index signature в ExtStates; (в) каждый эффект пишется как
`const xEffect: PostsEffect = (action$, state$, { dispatcher, services: { api } }) => ...` —
деструктуризация контекста повторяется 13 раз в posts.

### 1.6 Ручной массив эффектов

`posts.effects.ts:561-575` — 13 эффектов перечислены руками в `postsEffects = [...]`.
Забыть добавить новый эффект в массив — типичная ошибка (ничего не упадёт, эффект просто
не запустится). В class-стиле поля класса перечисляются автоматически.

### 1.7 `dispatcher.dispatch.X` — лишний уровень вложенности

Внутри эффектов везде `dispatcher.dispatch.loadPosts(...)` (`posts.effects.ts:66,88,96-97...`).
В posts.effects.ts строка `dispatcher.dispatch.` встречается **40+ раз**. Просится `this.dispatch.loadPosts`
или просто инстанс диспетчера с методами: `this.d.loadPosts(...)`.

### 1.8 Стейт: api-ветки и initialState

Каждый стейт содержит блок `api: { xRequest: ApiRequestState, ... }` + зеркальный initialState
с `initialApiState` (`posts.synapse.ts:27-86`, `reactions.synapse.ts:27-44`). Приложение даже
завело себе frozen-синглтон `initialApiState` (`src/store/apiState.ts:11-14`). Это не главная боль,
но если новый API сможет выводить/генерировать api-ветку — будет бонус. Messenger вообще
продублировал типы `ApiStatus`/`ApiRequestState` локально (`messenger.synapse.ts:11-18`) —
признак, что импорт из библиотеки неочевиден.

---

## 2. createFeatureSynapse vs createSynapse

`createFeatureSynapse` — **утилита приложения**, не библиотеки (`src/store/createFeatureSynapse.ts:19-22`):

```typescript
export function createFeatureSynapse<S extends AnySynapseStore>(factory: FeatureFactory<S>): () => Promise<S> {
  let promise: Promise<S> | null = null
  return () => (promise ??= factory({ core: getCoreSynapse() }))
}
```

Делает две вещи:
1. **Ленивый клиентский синглтон** — убирает повторяющийся `let p; () => (p ??= create())`
   (раньше был в каждом модуле; у core он до сих пор написан руками — `core.synapse.ts:24-29`).
2. **Инжектит промис core-синапса** в фабрику — чтобы фича могла объявить `dependencies: [core]`
   и взять `coreSynapse.selectors` / `coreSynapse.storage`.

Вывод для нового API: лениво-синглтонная природа и async-зависимости — это норма жизни,
новый `CreateSynapse` должен покрывать этот паттерн из коробки (фабрика, которая дёргается
один раз при первом обращении), иначе приложения снова напишут эту обёртку сами.

## 3. externalSelectors: как используется и где неудобно

Используется **только в posts** (один cross-store селектор):

- Декларация при сборке: `externalSelectors: { core: coreSynapse.selectors }` (`posts.synapse.ts:102`)
- Ручной тип во втором файле: `type ExternalSelectors = { core: CoreSynapse['selectors'] }`
  (`posts.selectors.ts:7`)
- Использование: `sm.createSelector([ext.core.profile], (profile) => profile?.user_info?.id ?? null)`
  (`posts.selectors.ts:35`)

**Неудобства:**
1. **Двойная декларация**: форма external-объекта описывается в `posts.synapse.ts` (значение) и
   повторно в `posts.selectors.ts` (тип). Типы не текут от сборки к фабрике селекторов — связь
   держится на дисциплине. Переименуешь ключ `core` в одном месте — второе узнает только в рантайме.
2. Сам механизм (передать чужой `SelectorAPI` в deps combined-селектора) работает нормально и
   реактивен — менять семантику не нужно, только убрать двойную декларацию (конструкторная
   инъекция типизированных селекторов решает это полностью: `constructor(core: CoreSelectors)`).

## 4. externalStates / externalDispatchers в эффектах

**externalStates** — 2 использования, оба идентичны: подключение сокета по `core.profile`.

`posts.effects.ts:497-512`:
```typescript
const connectionEffect: PostsEffect = (_action$, _state$, { services: { socket }, externalStates: { core$ } }) =>
  core$.pipe(
    map((core) => core.profile),
    distinctUntilChanged((a, b) => a?.id === b?.id),
    tap((profile) => { profile ? socket.connect({...}) : socket.disconnect() }),
  )
```
То же в `messenger.effects.ts:134`. Декларация при сборке: `externalStates: { core$: coreSynapse.storage }`
(`posts.synapse.ts:107`) — синапс сам конвертирует `IStorage` в Observable. Снова двойная
декларация типа (ExtStates в effects + значение в synapse.ts) + index-signature хак (§1.5).

**externalDispatchers — в приложении НЕ используется ни разу** (grep по `src/` дал 0 вхождений
вне набросков). Вся cross-module коммуникация сегодня идёт через два канала: чтение чужого
стора (externalStates) и чтение чужих селекторов (externalSelectors). Реакция на чужие экшены
(например `core.logout`) пока решается реакцией на данные (профиль исчез → disconnect), а не на
событие. Это важно для проектирования: вариант 3 из Части 3b должен быть лёгким и типобезопасным,
но его вес в реальном коде сегодня — ноль; не стоит усложнять ради него core-API.

## 5. React-привязка: два варианта

**Variant A — gate-less хуки приложения** (`src/store/useSynapse.ts`, `useSynapseSelector.ts`,
`useSynapseActions.ts`, `useKeyedSliceSelector.ts`): селективная подписка через
`useSyncExternalStore` поверх ленивого синглтона. SSR-safe (`getServerSnapshot` →
`selector(undefined)`). Требования к пользователю жёсткие: селекторы — module-level стабильные
ссылки, нельзя возвращать новые объекты (`useSynapseSelector.ts:22-26`). Поверх них приложение
пишет доменные хуки (`core.hooks.ts:14-31`).

Заметно: эти хуки **не используют SelectorModule вообще** — селектор-функции применяются к
`storage.getStateSync()` напрямую. То есть половина React-кода приложения живёт мимо
библиотечных селекторов.

**Variant B — библиотечный `createSynapseCtx`** (`posts.context.tsx:14-18`):
```typescript
export const {
  contextSynapse: withPosts,
  useSynapseSelectors: usePostsSelectors,
  useSynapseActions: usePostsActions,
} = createSynapseCtx(getPostsSynapse(), { loadingComponent: <p>Loading posts…</p> })
```
Боли (из комментария там же, `posts.context.tsx:10-12`): `createSynapseCtx` **жадно вызывает**
`getPostsSynapse()` при импорте, а `ApiClient.init()` browser-only → весь контекст можно грузить
только через `next/dynamic { ssr: false }`. Ленивость нового CreateSynapse должна дойти и до
React-биндинга (принимать getter, а не промис).

## 6. Сводный список болей текущего API

1. Расплющивание `createApiActions`-пятёрок руками (~100 строк по приложению) — §1.1.
2. Каждое имя экшена пишется дважды (const + ключ) — §1.2.
3. Церемония `action({ meta, action })` для сигналов `(_store, p) => p` — §1.3.
4. Шаблонная шапка фабрики + `ReturnType`-тип в каждом диспетчере — §1.4.
5. 6-параметровый `Effect<...>` generic, слоты-заглушки, index-signature хак — §1.5.
6. Ручной массив эффектов, забытый эффект молча не работает — §1.6.
7. `dispatcher.dispatch.X` (40+ раз на файл) — §1.7.
8. Двойная декларация externalSelectors/externalStates (значение в сборке, тип в файле) — §3, §4.
9. Жадный `createSynapseCtx` ломает SSR-ленивость — §5.
10. createFeatureSynapse (lazy singleton + DI core) — паттерн приложения, который библиотека
    не покрывает — §2.

## 7. До / после (целевой class-стиль)

### 7.1 Диспетчер: API-группа + сигнал + чистый апдейт

**До** (`posts.dispatcher.ts`, фрагменты, ~45 строк на этот объём):
```typescript
export function createPostsDispatcher(storage: IStorage<PostsState>) {
  const action = defineAction<PostsState>()
  const postsReq = createApiActions<PostsState, PostsFindAllParams>((s) => s.api.postsRequest)

  const mounted = action({
    meta: { description: 'Лента постов смонтирована (триггер начальной загрузки)' },
    action: (_store, payload: FeedLifecyclePayload) => payload,
  })

  const applyPosts = action({
    action: (store, page: PostsFeedResponseDto) => {
      store.update((s) => { s.list = dedupById(page.data); s.cursor = page.cursor; s.hasMore = page.has_more })
    },
  })

  return createDispatcher({ storage }, {
    mounted,
    loadPosts: postsReq.init,
    loadPostsLoading: postsReq.loading,
    loadPostsSuccess: postsReq.success,
    loadPostsFailure: postsReq.failure,
    loadPostsReset: postsReq.reset,
    applyPosts,
  })
}
export type PostsDispatcher = ReturnType<typeof createPostsDispatcher>
```

**После** (~15 строк, каждое имя один раз, пятёрка живёт группой):
```typescript
export class PostsDispatcher extends Dispatcher<PostsState> {
  readonly loadPosts = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)
  // → loadPosts.init / .loading / .success / .failure / .reset; имена событий
  //   выводятся из имени поля: 'loadPosts:loading' и т.д.

  readonly mounted = this.signal<FeedLifecyclePayload>('Лента постов смонтирована')

  readonly applyPosts = this.action((store, page: PostsFeedResponseDto) =>
    store.update((s) => { s.list = dedupById(page.data); s.cursor = page.cursor; s.hasMore = page.has_more }))
}
```
Экономия на полном posts.dispatcher.ts: ~376 → ~200 строк (комментарии и интерфейсы payload
остаются), исчезают оба источника рассинхрона (объект-реестр и массив имён).

### 7.2 Селекторы с cross-store зависимостью

**До** (`posts.selectors.ts` + ручной тип + декларация в posts.synapse.ts:102):
```typescript
type ExternalSelectors = { core: CoreSynapse['selectors'] }
export function createPostsSelectors(sm: ISelectorModule<PostsState>, ext: ExternalSelectors) {
  const api = sm.createSelector((s) => s.api)
  return {
    list: sm.createSelector((s) => s.list),
    isPostsLoading: sm.createSelector([api], (a) => a.postsRequest.status === ApiStatus.Loading),
    currentUserId: sm.createSelector([ext.core.profile], (p) => p?.user_info?.id ?? null),
  }
}
```

**После** (внешняя зависимость типизирована конструктором, двойная декларация исчезла):
```typescript
export class PostsSelectors extends Selectors<PostsState> {
  constructor(private readonly core: CoreSelectors) { super() }

  readonly api = this.select((s) => s.api)
  readonly list = this.select((s) => s.list)
  readonly isPostsLoading = this.combine([this.api], (a) => a.postsRequest.status === ApiStatus.Loading)
  readonly currentUserId = this.combine([this.core.profile], (p) => p?.user_info?.id ?? null)
}
```

### 7.3 Эффект с сервисами и внешним стором

**До** (`posts.effects.ts:25-42` тип + `:497-512` эффект + строка в массиве):
```typescript
type PostsEffect = Effect<PostsState, PostsDispatcher, Services, Record<string, never>, Record<string, never>, ExtStates>

const connectionEffect: PostsEffect = (_action$, _state$, { services: { socket }, externalStates: { core$ } }) =>
  core$.pipe(
    map((core) => core.profile),
    distinctUntilChanged((a, b) => a?.id === b?.id),
    tap((profile) => { profile ? socket.connect({...}) : socket.disconnect() }),
  )
// + не забыть добавить connectionEffect в postsEffects = [...]
```

**После** (сервисы и внешние сторы — поля класса, generic-простыня и массив исчезают):
```typescript
export class PostsEffects extends Effects<PostsState, PostsDispatcher> {
  constructor(
    private readonly api: PostsEndpoints,
    private readonly socket: PostsSocketService,
    private readonly core$: Observable<CoreState>,
  ) { super() }

  readonly connection = this.effect(() =>
    this.core$.pipe(
      map((core) => core.profile),
      distinctUntilChanged((a, b) => a?.id === b?.id),
      tap((profile) => { profile ? this.socket.connect({...}) : this.socket.disconnect() }),
    ))

  readonly loadPosts = this.effect(({ action$, state$, d }) =>
    action$.pipe(
      ofType(d.loadPosts.init),
      validateMap({ /* как сейчас, но d.loadPosts.loading() вместо dispatcher.dispatch.loadPostsLoading() */ }),
    ))
}
```

### 7.4 Сборка

**До** (`posts.synapse.ts:88-111`): createFeatureSynapse + createSynapse c 7 ключами конфига,
externalSelectors/externalStates декларируются здесь, а типизируются в других файлах.

**После** — зависимости текут в конструкторы, сборщик только соединяет:
```typescript
export const getPostsSynapse = createFeatureSynapse(async ({ core }) => {
  const endpoints = await getPostsEndpoints()
  const coreSynapse = await core
  const socket = new PostsSocketService()

  return new CreateSynapse({
    dependencies: [coreSynapse],
    storage: new MemoryStorage<PostsState>({ name: 'posts', initialState }),
    dispatcher: PostsDispatcher,                                  // класс или инстанс — решит PROPOSAL
    selectors: () => new PostsSelectors(coreSynapse.selectors),
    effects: () => new PostsEffects(endpoints, socket, coreSynapse.state$),
  }).start()
})
```

## 8. Дополнительные наблюдения для PROPOSAL

1. **Keyed api actions** (`createKeyedApiActions`, comments/reactions/messenger) — обязаны иметь
   симметричный сахар в новом API (`this.keyedApiActions(...)`), это не экзотика, а половина модулей.
2. **Синапс без эффектов** (media-player) и **без api-веток** (core) — новый API должен позволять
   опускать любые слои (selectors-only, dispatcher-only).
3. **Три синапса в одной папке** (media) — модуль ≠ папка; API не должен навязывать файловую структуру.
4. В наброске пользователя в `posts.synapse.ts:115-158` уже лежат прототипы вариантов A и B —
   там виден желаемый DX: external-зависимости передаются в конструкторы классов при сборке.
5. Хуки приложения читают `storage.getStateSync()` напрямую, мимо SelectorModule (§5) — признак
   того, что библиотечный React-слой не покрыл потребность в селективной подписке на лениво
   создаваемый синглтон. Новому API стоит дать первоклассный `useSelector(synapse.selectors.x)`,
   работающий с ленивым синапсом без Provider-гейта.
