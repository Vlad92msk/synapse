# Задание для Fable: Synapse — переосмысление API

## Контекст

Synapse — это библиотека для управления состоянием и бизнес-логикой в React-приложениях.
Она уже работает в реальном production-проекте. Задача не переписать её с нуля, а
**переупаковать существующие модули** под новый, более удобный API.

---

## Часть 1. Что есть сейчас

### 1.1 Архитектура (два слоя)

Фактически библиотека уже состоит из двух независимых слоёв, но они пока не разделены
концептуально:

#### Слой 1 — State Manager (хранилища)

Это классы-адаптеры, которые создают реактивное хранилище и предоставляют API для
чтения/записи состояния:

- `MemoryStorage<TState>` — in-memory хранилище, живёт в рамках JS-сессии
- `LocalStorage<TState>` — синхронное хранилище (localStorage)
- `IndexedDB<TState>` — асинхронное персистентное хранилище

Все три реализуют интерфейс `IStorage<T>` со стандартным API:
`initialize()`, `getState()`, `update()`, `subscribe()`, `destroy()` и т.д.

**Этот слой завершён.** Менять его не нужно.

#### Слой 2 — Business Logic Layer (BL-Layer)

Инструменты для описания бизнес-логики поверх хранилища:

| Модуль           | Назначение                                                                                   |
|------------------|----------------------------------------------------------------------------------------------|
| `Dispatcher`     | Реактивный диспетчер экшенов. Создаёт `action$` поток, каждый экшен — типизированная функция |
| `SelectorModule` | Мемоизированные селекторы (как reselect). Умеет cross-store зависимости                      |
| `EffectsModule`  | Side-effects через RxJS (как redux-observable). Получает `action$`, `state$`, сервисы        |
| `ApiClient`      | HTTP-клиент с кэшированием, retry, типизированными эндпоинтами                               |
| React hooks      | `useSelector`, `useSynapse` и другие утилиты для React                                       |

**Сборщик** — функция `createSynapse(config)`, которая:
1. Ждёт зависимостей (`dependencies`)
2. Инициализирует хранилище
3. Создаёт `SelectorModule`, передаёт в `createSelectorsFn`
4. Создаёт `Dispatcher`, передаёт в `createDispatcherFn`
5. Создаёт `EffectsModule`, регистрирует эффекты, запускает

---

### 1.2 Текущий способ использования (Posts module)

Вот как это выглядит сейчас в production-проекте. Один модуль состоит из 4 файлов:

#### `posts.synapse.ts` — сборка модуля

```typescript
export const getPostsSynapse = createFeatureSynapse(async ({ core }) => {
  const endpoints = await getPostsEndpoints()   // ApiClient (lazy singleton)
  const coreSynapse = await core                // зависимый synapse
  const socket = new PostsSocketService()       // DI-сервис

  return createSynapse({
    dependencies: [coreSynapse],
    storage: new MemoryStorage<PostsState>({ name: 'posts', initialState }),
    createDispatcherFn: createPostsDispatcher,
    createSelectorsFn: createPostsSelectors,
    externalSelectors: { core: coreSynapse.selectors },
    createEffectConfig: () => ({
      services: { api: endpoints, socket },
      externalStates: { core$: coreSynapse.storage },
    }),
    effects: postsEffects,
  })
})
```

#### `posts.dispatcher.ts` — диспетчер

```typescript
export function createPostsDispatcher(storage: IStorage<PostsState>) {
  const action = defineAction<PostsState>()

  // createApiActions — утилита, создаёт набор экшенов для одного API-запроса:
  // init (намерение) + loading/success/failure/reset (жизненный цикл)
  const postsReq = createApiActions<PostsState, PostsFindAllParams>((s) => s.api.postsRequest)
  const createReq = createApiActions<PostsState, CreatePostIntent>((s) => s.api.createRequest)
  // ...

  // Чистые экшены (только обновление стора)
  const mounted = action({
    meta: { description: 'Лента смонтирована' },
    action: (_store, payload: FeedLifecyclePayload) => payload,
  })

  const applyPosts = action({
    action: (store, page: PostsFeedResponseDto) => {
      store.update((s) => {
        s.list = page.data
        s.cursor = page.cursor
      })
    },
  })

  // ... остальные экшены

  return createDispatcher(
    { storage },
    {
      mounted,
      loadPosts: postsReq.init,
      loadPostsLoading: postsReq.loading,
      loadPostsSuccess: postsReq.success,
      // ... все экшены перечислены вручную
    },
  )
}
```

#### `posts.selectors.ts` — селекторы

```typescript
export function createPostsSelectors(sm: ISelectorModule<PostsState>, ext: ExternalSelectors) {
  const api = sm.createSelector((s) => s.api)

  return {
    list: sm.createSelector((s) => s.list),
    isPostsLoading: sm.createSelector([api], (a) => a.postsRequest.status === ApiStatus.Loading),
    hasMore: sm.createSelector((s) => s.hasMore),
    // Зависимостный селектор из другого стора (core):
    currentUserId: sm.createSelector([ext.core.profile], (profile) => profile?.user_info?.id ?? null),
  }
}
```

#### `posts.effects.ts` — эффекты

```typescript
// Каждый эффект — чистая функция (action$, state$, context) => Observable<unknown>
const loadPostsEffect: PostsEffect = (action$, state$, { dispatcher, services: { api } }) =>
  action$.pipe(
    ofType(dispatcher.dispatch.loadPosts),
    withLatestFrom(selectorObject(state$, { status: (s) => s.api.postsRequest.status })),
    validateMap({
      validator: ([, { status }]) => ({
        conditions: [status !== ApiStatus.Loading],
        skipAction: () => dispatcher.dispatch.loadPostsReset(),
      }),
      loadingAction: () => dispatcher.dispatch.loadPostsLoading(),
      errorAction: (err) => dispatcher.dispatch.loadPostsFailure(getErrorMessage(err)),
      apiCall: ([action]) =>
        fromRequest(api.getPosts.request({ ...action.payload, limit: 20 })).pipe(
          apiResult((page) => {
            dispatcher.dispatch.applyPosts(page)
            dispatcher.dispatch.loadPostsSuccess()
          }),
        ),
    }),
  )

// realtime-эффект (сокет), читает внешний стор
const connectionEffect: PostsEffect = (_action$, _state$, { services: { socket }, externalStates: { core$ } }) =>
  core$.pipe(
    map((core) => core.profile),
    distinctUntilChanged((a, b) => a?.id === b?.id),
    tap((profile) => {
      if (profile) socket.connect({ ... })
      else socket.disconnect()
    }),
  )

// Экспортируем массив
export const postsEffects = [
  mountedEffect,
  loadPostsEffect,
  loadMoreEffect,
  createPostEffect,
  updatePostEffect,
  removePostEffect,
  connectionEffect,
  // ...
]
```

---

## Часть 2. Что хотим изменить

### 2.1 Концептуальное разделение

Хотим явно разделить два понятия:

```
synapse-storage (уже готово)
├── core/           ← State Manager: MemoryStorage, LocalStorage, IndexedDB
└── bl/             ← BL Layer: Dispatcher, Selectors, Effects, ApiClient
    └── CreateSynapse — «модуль» как в NestJS, собирает BL поверх стора
```

**State Manager** (`MemoryStorage` и т.д.) — отдельная сущность, можно использовать
без BL-слоя.

**BL Layer** — Synapse в полном смысле. `CreateSynapse` — это контейнер модуля,
который описывает, как бизнес-логика взаимодействует с хранилищем.

### 2.2 NestJS-стиль: классы вместо функций

**Ключевая идея**: вместо функций-фабрик (`createPostsDispatcher`, `createPostsSelectors`)
писать классы с методами. Как в NestJS пишут сервисы и контроллеры.

**Что NestJS даёт**: dependency injection через конструктор, декораторы, чёткая структура.

**Что нам не нужно**: тяжёлый DI-контейнер, IoC, декораторы. Нам нужна **форма**, а не
механизм.

> **Важно для Fable**: всё что ниже — это **направление и идеи**, не жёсткое ТЗ.
> Мы показываем варианты которые пришли в голову, но Fable может предложить совсем
> другой подход. Главная цель — удобный, читаемый, типобезопасный class-based API
> в духе NestJS. Если какой-то вариант лучше достигает этой цели — предлагай его.

---

#### Диспетчер — варианты

**Вариант D-1** — class fields, storage инжектируется через базовый класс:

```typescript
class PostsDispatcher extends Dispatcher<PostsState> {
  // storage приходит от CreateSynapse, не из конструктора
  readonly postsRequest = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)
  readonly createRequest = this.apiActions<CreatePostIntent>((s) => s.api.createRequest)

  readonly mounted = this.action((_store, payload: FeedLifecyclePayload) => payload)

  readonly applyPosts = this.action((store, page: PostsFeedResponseDto) => {
    store.update((s) => {
      s.list = page.data
      s.cursor = page.cursor
      s.hasMore = page.has_more
    })
  })

  // удобно: init/loading/success через this.postsRequest.*
  readonly loadPosts = this.postsRequest.init
  readonly loadPostsLoading = this.postsRequest.loading
  readonly loadPostsSuccess = this.postsRequest.success
}
```

**Вариант D-2** — конструктор с явными зависимостями (как NestJS-сервис):

```typescript
// storage и externalSelectors — через конструктор, пользователь управляет явно
class PostsDispatcher {
  readonly postsRequest: ApiActions<PostsState, PostsFindAllParams>
  readonly mounted: DispatchFn<FeedLifecyclePayload>
  readonly applyPosts: DispatchFn<PostsFeedResponseDto>

  constructor(
    private readonly storage: IStorage<PostsState>,
    private readonly externalSelectors: { core: CoreSelectors }
  ) {
    this.postsRequest = createApiActions(storage, (s) => s.api.postsRequest)
    this.mounted = defineAction(storage, (_s, p: FeedLifecyclePayload) => p)
    this.applyPosts = defineAction(storage, (store, page) => {
      store.update(s => { s.list = page.data; s.cursor = page.cursor })
    })
  }
}
```

**Вариант D-3** — минимальный, без базового класса, просто plain-класс с методами:

```typescript
// Нет наследования. Пользователь просто пишет методы, синапс читает их как экшены.
// Можно ли определить протокол так, что синапс автоматически находит экшены в классе?
class PostsDispatcher {
  @action mounted(payload: FeedLifecyclePayload) { return payload }
  @action applyPosts(store: Store<PostsState>, page: PostsFeedResponseDto) {
    store.update(s => { s.list = page.data })
  }
  // apiActions — через декоратор или через вызов утилиты?
  @apiAction((s: PostsState) => s.api.postsRequest)
  readonly postsRequest!: ApiActions<PostsState, PostsFindAllParams>
}
// Fable: стоит ли идти в сторону декораторов или они усложняют?
```

---

#### Селекторы — варианты

**Вариант S-1** — class fields с `this.select`, внешние через `this.external`:

```typescript
class PostsSelectors extends Selectors<PostsState> {
  readonly list = this.select((s) => s.list)
  readonly api = this.select((s) => s.api)
  readonly isPostsLoading = this.combine([this.api], (a) => a.postsRequest.status === ApiStatus.Loading)

  // Внешний стор: как получить? Через this.external('core') или через конструктор?
  readonly currentUserId = this.combine([this.external.core.profile], (p) => p?.user_info?.id ?? null)
}
```

**Вариант S-2** — конструктор принимает внешние сторы явно, используем их напрямую:

```typescript
// Внешние зависимости — в конструкторе. Простой plain-класс, никакого базового.
class PostsSelectors {
  readonly list: SelectorAPI<PostResponseDto[]>
  readonly isPostsLoading: SelectorAPI<boolean>
  readonly currentUserId: SelectorAPI<string | null>

  constructor(
    sm: SelectorModule<PostsState>,
    private readonly core: CoreSelectors   // внешние селекторы напрямую
  ) {
    const api = sm.createSelector((s) => s.api)
    this.list = sm.createSelector((s) => s.list)
    this.isPostsLoading = sm.createSelector([api], (a) => a.postsRequest.status === ApiStatus.Loading)
    // cross-store: передаём готовый SelectorAPI из core
    this.currentUserId = sm.createSelector([core.profile], (p) => p?.user_info?.id ?? null)
  }
}
// В CreateSynapse: new PostsSelectors(sm, coreSynapse.selectors)
```

**Вариант S-3** — совсем плоско, без базового класса и без конструктора-зависимостей:

```typescript
// Фабрика-метод, похожая на текущую, но в виде статического метода класса
// или функции которая возвращает инстанс.
// Вопрос для Fable: есть ли смысл в классе для селекторов вообще,
// или функция-фабрика удобнее?
```

---

#### Эффекты — варианты

**Вариант E-1** — class с `this.effect()`, сервисы из конструктора, runtime-зависимости
(dispatcher, state$, externalStates) — из аргументов this.effect:

```typescript
class PostsEffects extends Effects<PostsState, PostsDispatcher> {
  constructor(private api: PostsEndpoints, private socket: PostsSocketService) {
    super()
  }

  readonly loadPosts = this.effect((action$, state$, { dispatcher }) =>
    action$.pipe(
      ofType(dispatcher.loadPosts),
      validateMap({
        apiCall: ([a]) => fromRequest(this.api.getPosts.request(a.payload)).pipe(
          apiResult((page) => dispatcher.applyPosts(page))
        ),
      }),
    )
  )

  readonly connection = this.effect((_action$, _state$, { externalStates: { core$ } }) =>
    core$.pipe(
      map((c) => c.profile),
      tap((p) => p ? this.socket.connect({...}) : this.socket.disconnect())
    )
  )
}
```

**Вариант E-2** — всё через конструктор (максимально NestJS-like), `this.effect`
не нужен — методы просто возвращают Observable:

```typescript
// В конструкторе — всё: и сервисы, и dispatcher, и state$, и externalStates.
// CreateSynapse инжектирует их при создании.
// Каждый публичный метод — это эффект. Синапс вызывает их и подписывается.
class PostsEffects {
  constructor(
    private readonly dispatch: PostsDispatcher,      // наш диспатчер
    private readonly state$: Observable<PostsState>, // наш стейт
    private readonly api: PostsEndpoints,            // сервис
    private readonly socket: PostsSocketService,     // сервис
    private readonly core$: Observable<CoreState>,   // внешний стор
  ) {}

  loadPosts() {
    return this.dispatch.action$.pipe(
      ofType(this.dispatch.loadPosts),
      validateMap({
        apiCall: ([a]) => fromRequest(this.api.getPosts.request(a.payload)).pipe(
          apiResult((page) => this.dispatch.applyPosts(page))
        ),
      }),
    )
  }

  connection() {
    return this.core$.pipe(
      map((c) => c.profile),
      distinctUntilChanged((a, b) => a?.id === b?.id),
      tap((p) => p ? this.socket.connect({...}) : this.socket.disconnect())
    )
  }
}
// Вопрос: как синапс узнаёт какие методы — эффекты? По соглашению (все публичные)?
// Или явная декларация в каком-то реестре? Fable, предложи своё решение.
```

**Вариант E-3** — гибрид: конструктор принимает сервисы + свой dispatcher как
готовый инстанс (не context-объект), externalStates — тоже конструкторные, а `this.effect()`
нет вообще — методы возвращают Observable:

```typescript
class PostsEffects {
  constructor(
    private readonly api: PostsEndpoints,
    private readonly socket: PostsSocketService,
    private readonly core$: Observable<CoreState>,
  ) {}

  // Dispatcher и state$ получает через аргументы метода — меньше coupling чем E-2
  // Синапс сам вызывает: effect.loadPosts(action$, state$, dispatcher)
  loadPosts(action$: Observable<Action>, _state$: Observable<PostsState>, d: PostsDispatcher) {
    return action$.pipe(
      ofType(d.loadPosts),
      validateMap({
        apiCall: ([a]) => fromRequest(this.api.getPosts.request(a.payload)).pipe(
          apiResult((page) => d.applyPosts(page))
        ),
      }),
    )
  }

  connection() {
    // не нужны action$/state$ — работает на this.core$
    return this.core$.pipe(
      map((c) => c.profile),
      tap((p) => p ? this.socket.connect({...}) : this.socket.disconnect())
    )
  }
}
```

---

#### Сборка модуля — варианты (и не только эти)

> **Для Fable**: нижеперечисленные варианты — лишь отправные точки для размышления.
> Ты **не обязан выбирать из них** — можешь предложить совсем другой подход или
> их комбинацию. Мы показываем идеи, ты — эксперт по архитектуре.

Несколько набросков которые пришли в голову:

**Вариант A** — фабрика с объектом конфига:

```typescript
export const getPostsSynapse = new CreateSynapse(async () => {
  const endpoints = await getPostsEndpoints()
  const coreSynapse = await core
  const socket = new PostsSocketService()

  return {
    dependencies: [coreSynapse],
    storage: new MemoryStorage<PostsState>({ name: 'posts', initialState }),
    dispatcher: new PostsDispatcher(),
    selectors: new PostsSelectors({ externalSelectors: { core: coreSynapse.selectors } }),
    effects: new PostsEffects({
      services: { api: endpoints, socket },
      externalStates: { core$: coreSynapse.storage },
    }),
  }
})
```

**Вариант B** — builder-паттерн:

```typescript
export const getPostsSynapse = new CreateSynapse()
  .beforeStart(async () => {
    const endpoints = await getPostsEndpoints()
    const coreSynapse = await core
    const socket = new PostsSocketService()
    return { coreSynapse, socket, endpoints }
  })
  .addStore(() => new MemoryStorage<PostsState>({ name: 'posts', initialState }))
  .addDispatcher(() => new PostsDispatcher())
  .addSelectors(({ coreSynapse }) => new PostsSelectors({
    externalSelectors: { core: coreSynapse.selectors }
  }))
  .addEffects(({ endpoints, socket, coreSynapse }) => new PostsEffects({
    services: { api: endpoints, socket },
    externalStates: { core$: coreSynapse.storage },
  }))
```

**Вариант C** — функция-конфиг (ближе к текущему, минимальные изменения):

```typescript
export const getPostsSynapse = createFeatureSynapse(async ({ core }) => {
  const coreSynapse = await core
  return {
    dependencies: [coreSynapse],
    storage: new MemoryStorage<PostsState>({ name: 'posts', initialState }),
    dispatcher: new PostsDispatcher(),
    selectors: new PostsSelectors({ externalSelectors: { core: coreSynapse.selectors } }),
    effects: new PostsEffects({ ... }),
  }
})
```

---

## Часть 3. Что остаётся, что можно трогать

### Не трогать (стабильный публичный API):
- Все три хранилища: `MemoryStorage`, `LocalStorage`, `IndexedDB` и их интерфейс `IStorage`
- `ApiClient` — HTTP-клиент, стабилен
- RxJS-операторы пользовательского уровня: `ofType`, `ofTypes`, `validateMap`, `apiResult`,
  `fromRequest`, `selectorObject` — к ним привязан код приложения, менять сигнатуры нежелательно

### Можно менять или переосмыслить:
- `EffectsModule`, `SelectorModule`, внутренний `Dispatcher` — их можно переписать,
  расширить, упростить, или заменить другой реализацией если это даст лучший публичный API
- `createSynapse`, `createDispatcher`, `createFeatureSynapse` — эти утилиты могут
  остаться для backward compatibility, но основным путём становится новый class-API
- React hooks (`useSelector`, `useSynapse` и т.д.) — можно адаптировать под новый API
  или предложить новые если есть смысл
- Утилиты `defineAction`, `createApiActions` — могут стать методами базового класса,
  статическими функциями, или остаться как есть если удобнее

### Fable вправе:
- Изменить внутренние классы (`EffectsModule`, `SelectorModule`, `Dispatcher`) если это
  нужно для чистого публичного API
- Не использовать какой-то из существующих модулей если есть более простое решение
- Предложить новые абстракции которых сейчас нет
- Объединить несколько классов в один или наоборот разбить
- **Главный критерий**: удобный, читаемый, типобезопасный BL-layer в духе NestJS

---

## Часть 3b. Коммуникация между Synapse-модулями

Важный архитектурный принцип: **модули не управляют друг другом напрямую**.

Текущая ситуация: `posts` может читать `core.selectors` (через `externalSelectors`),
а `core.$storage` — через `externalStates`. Но `posts` не должен напрямую вызывать
диспетчер `core` — только через посредника.

Варианты коммуникации которые уже (или могут быть) поддержаны:

1. **Чтение чужого стора** — `externalStates: { core$: coreSynapse.storage }` (уже есть)
2. **Чтение чужих селекторов** — `externalSelectors: { core: coreSynapse.selectors }` (уже есть)
3. **Реакция на чужие экшены** — `externalDispatchers: { core: coreSynapse.dispatcher }` (есть в EffectsModule)
4. **Посредник** — отдельный «coordination synapse» или event bus который оба модуля
   могут слушать и в который могут писать, не зная друг о друге

Для Fable: убедись что новый API удобно поддерживает все 4 варианта.
Особенно вариант 4 — как это выглядит в новом class-стиле?
Например, как `PostsEffects` подписывается на экшены `CoreDispatcher`?

```typescript
// Текущий подход: через externalDispatchers в EffectsModule (уже работает)
// Как это выглядит в новом API?

// Вариант: externalDispatchers в конструкторе Effects
class PostsEffects {
  constructor(
    /* ... */
    private readonly core: CoreDispatcher,  // внешний диспатчер
  ) {}

  syncWithCoreAuth() {
    return this.core.action$.pipe(
      ofType(this.core.dispatch.logout),   // слушаем logout из core
      tap(() => this.dispatch.clearPosts()) // реагируем в posts
    )
  }
}
```

---

## Часть 4. Задание для субагентов

### Инструкция

Fable, пожалуйста, запусти субагентов для исследования следующих аспектов. Каждый
субагент должен создать файл с результатами в папке `_fable/research/`.

### Субагент 1: `research/01-dispatcher.md`

Изучи файлы:
- `packages/synapse/src/reactive/dispatcher/dispatcher.module.ts`
- `packages/synapse/src/reactive/dispatcher/standalone.ts`
- `packages/synapse/src/reactive/dispatcher/index.ts`

Выясни:
1. Как `Dispatcher` класс регистрирует экшены (`createAction`, `createWatcher`)
2. Как `createDispatcher` назначает типы из ключей объекта (deferred type assignment)
3. Как устроен `defineAction` и `createApiActions`
4. Что нужно для того, чтобы превратить диспетчер в класс с методами-полями (class fields)
5. Какие есть технические препятствия: `storage` нужен при создании экшенов, он доступен
   только когда `CreateSynapse` передаёт его — как это решить в class-стиле?
6. Конкретное предложение реализации `class PostsDispatcher extends Dispatcher<PostsState>`

### Субагент 2: `research/02-selectors.md`

Изучи файлы:
- `packages/synapse/src/core/selector/selector.module.ts`
- `packages/synapse/src/core/selector/selector.interface.ts`
- `packages/synapse/src/core/selector/index.ts`

Выясни:
1. Как `SelectorModule.createSelector` работает в двух вариантах (простой / combined)
2. Как external selectors подключаются сейчас (через 2-й аргумент createSelectorsFn)
3. Что нужно для class-стиля: `class PostsSelectors extends Selectors<PostsState>`
   где `this.select(...)` создаёт селектор, а `this.selectWith([dep], fn)` — combined
4. Как типизировать внешние (cross-store) селекторы в конструкторе
5. Конкретное предложение реализации

### Субагент 3: `research/03-effects.md`

Изучи файлы:
- `packages/synapse/src/reactive/effects/effects.module.ts`
- Примеры эффектов: `/Users/vlad/web_dev/sn_client/src/modules/posts/synapse/posts.effects.ts`

Выясни:
1. Как `EffectsModule` подписывается на эффекты и управляет их жизненным циклом
2. Как передаются `services`, `externalStates` в контекст эффекта
3. Что нужно для `class PostsEffects extends Effects<PostsState, PostsDispatcher>`
   где методы-поля — это эффекты (декларируются через `this.effect(fn)`)
4. Как хранить сервисы в классе (через конструктор) и использовать их в замыканиях
5. Технический вопрос: `this.effect(...)` вызывается при объявлении поля (до `super()` не можем),
   как передать контекст (dispatcher, state$) который доступен только при запуске?
6. Конкретное предложение реализации

### Субагент 4: `research/04-create-synapse.md`

Изучи файлы:
- `packages/synapse/src/utils/createSynapse/createSynapse.ts`
- `packages/synapse/src/utils/createSynapse/types.ts`
- `packages/synapse/src/utils/createSynapse/waitForDependencies.ts`
- `packages/synapse/src/utils/createSynapse/validate.ts`
- `packages/synapse/src/utils/index.ts`

Выясни:
1. Текущий жизненный цикл `createSynapse`: порядок инициализации шагов
2. Как сделать `CreateSynapse` классом (не функцией): `new CreateSynapse(factory)`
   или builder `new CreateSynapse().addStore(...).addDispatcher(...)`
3. Как передать `storage` в экземпляр `PostsDispatcher` (у класса нет `storage` до
   инициализации — как его "инжектировать")?
4. Как `PostsEffects` получает `(action$, state$, context)` — этот контекст создаётся
   внутри `EffectsModule` при `start()`, не в конструкторе `PostsEffects`
5. Оцени три варианта API из Части 2 (A, B, C): какой проще реализовать, какой
   лучше типизировать, какой удобнее использовать?
6. Конкретное предложение архитектуры нового `CreateSynapse`

### Субагент 5: `research/05-usage-patterns.md`

Изучи живые примеры использования в приложении:
- `/Users/vlad/web_dev/sn_client/src/modules/posts/synapse/` — основной пример
  (все файлы: posts.synapse.ts, posts.dispatcher.ts, posts.selectors.ts,
  posts.effects.ts, posts.context.tsx)
- `/Users/vlad/web_dev/sn_client/src/store/` — core store (корневой синапс,
  от которого зависят другие модули — здесь видна cross-synapse связь)
- Другие модули в `/Users/vlad/web_dev/sn_client/src/modules/` — посмотри сколько
  успеешь, ищи паттерны (comments, reactions, auth — если есть synapse-папки)

Выясни:
1. Какие паттерны повторяются в каждом модуле (boilerplate, который хочется убрать)
2. Как используется `createFeatureSynapse` vs `createSynapse` — в чём отличие на практике
3. Как организован `externalSelectors` (cross-store зависимости): где это неудобно?
4. Как `externalDispatchers` / `externalStates` используются в эффектах
5. Как используются React-контексты (`posts.context.tsx`) — что синапс отдаёт React
6. Что в текущем API неудобно: что повторяется, где много boilerplate, где типы неудобны
7. Покажи до/после для 2-3 конкретных случаев: как новый class-стиль улучшил бы код

---

## Часть 5. После исследования

После того как все субагенты завершат работу, Fable должен:

1. Прочитать все research-файлы
2. При необходимости самостоятельно дополнительно проверить любые файлы в
   `/Users/vlad/web_dev/synapse/packages/synapse/src/` или в
   `/Users/vlad/web_dev/sn_client/src/modules/` — если нужно уточнить детали
3. Создать файл `_fable/PROPOSAL.md` с:
   - Предложенной архитектурой BL-слоя (не обязательно из вариантов A/B/C — можно свой)
   - Обоснованием выборов: почему именно так, что отвергли и почему
   - Конкретным API для `Dispatcher`, `Selectors`, `Effects`, `CreateSynapse`
     (TypeScript-сигнатуры базовых классов/интерфейсов)
   - Полным примером переписанного posts-модуля в новом стиле
     (posts.synapse.ts + posts.dispatcher.ts + posts.selectors.ts + posts.effects.ts)
   - Как выглядит cross-synapse коммуникация (все 4 варианта из Части 3b)
   - Что нужно создать/изменить в библиотеке и примерным объёмом
   - Рисками, нерешёнными вопросами, open questions

4. **Не реализовывать** — только предложить. Пользователь рассмотрит PROPOSAL.md,
   даст обратную связь, и только после согласования начинается реализация.

---

## Часть 6. Контекст проекта

### Пути к файлам

| Что | Путь |
|-----|------|
| Библиотека (src) | `/Users/vlad/web_dev/synapse/packages/synapse/src/` |
| Dispatcher | `…/src/reactive/dispatcher/dispatcher.module.ts` |
| Effects | `…/src/reactive/effects/effects.module.ts` |
| SelectorModule | `…/src/core/selector/selector.module.ts` |
| createSynapse | `…/src/utils/createSynapse/createSynapse.ts` |
| ApiClient | `…/src/api/api.module.ts` |
| React hooks | `…/src/react/` |
| **Живой пример (Posts)** | `/Users/vlad/web_dev/sn_client/src/modules/posts/synapse/` |
| Другие модули приложения | `/Users/vlad/web_dev/sn_client/src/modules/` |
| Корневой store (core) | `/Users/vlad/web_dev/sn_client/src/store/` |

### Технический стек
- **Язык**: TypeScript (строгий режим)
- **Пакет публикуется как**: `synapse-storage`
  (entry points: `synapse-storage`, `synapse-storage/core`, `synapse-storage/reactive`)
- **RxJS** — основной инструмент для эффектов, убирать не нужно
- **React** — target-окружение, но библиотека не React-only

### Принципы (по приоритету):
1. Хранилища (`MemoryStorage`, `LocalStorage`, `IndexedDB`) — стабильный API, не трогаем
2. `ApiClient` — стабильный API, не трогаем
3. RxJS user-facing операторы (`ofType`, `validateMap`, `apiResult`) — не ломаем сигнатуры
4. Типизация без `any` в пользовательском коде — обязательно
5. Backward compatibility — желательна, но не обязательна (semver major — ок)
6. Всё остальное — можно менять ради лучшего публичного API
