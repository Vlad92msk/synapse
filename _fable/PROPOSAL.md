# PROPOSAL: Class-based BL-слой для synapse-storage

> Синтез исследований `_fable/research/01..05`. Это предложение, не реализация.
> Все ссылки на код — реальные файлы с номерами строк.

---

## 0. TL;DR

Предлагаю четыре тонких публичных класса поверх **неизменных** существующих движков
(`Dispatcher`-core, `SelectorModule`, `EffectsModule`) и один новый сборщик:

| Новое                                     | Что это                                                                                | Поверх чего                                                                   |
|-------------------------------------------|----------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| `Dispatcher<TState>` (abstract)           | экшены = class fields: `this.action`, `this.signal`, `this.apiActions`, `this.watcher` | текущий `Dispatcher` (переименуется в `DispatcherCore`)                       |
| `Selectors<TState>` (abstract)            | селекторы = class fields: `this.select`, `this.combine`                                | `SelectorModule` без изменений                                                |
| `Effects<TState, TDispatcher>` (abstract) | эффекты = class fields через `this.effect(fn)`, сервисы — через конструктор            | `EffectsModule` без изменений                                                 |
| `createSynapse(factory)` — новая перегрузка | ленивый сборщик-синглтон, возвращает thenable-handle                                 | пайплайн текущего `createSynapse(config)` + поглощает userland `createFeatureSynapse` |

Ключевые свойства:
- **Ни одного «врущего» типа**: поля классов сразу имеют финальные типы (`DispatchFunction`, `SelectorAPI`), никаких Proxy и двухфазных рецептов в публичной модели.
- **Имя экшена/селектора = имя поля** (deferred type assignment переезжает с ключей объекта на поля класса — механизм `_assignType` уже существует, `dispatcher.module.ts:406-420`).
- **API-группа — вызываемая**: `d.loadPosts(params)` — это init (вызовы из UI не меняются), `d.loadPosts.loading/.success/.failure/.reset` — жизненный цикл. Исчезают ~100 строк ручного «расплющивания» пятёрок по приложению (research/05 §1.1).
- Старый API (`createSynapse`, `createDispatcher`, `defineAction`, `createApiActions`, все операторы) **остаётся работать без изменений**; обе ветки совместимы в `dependencies` друг друга.

Пример итогового модуля — раздел 4.

---

## 1. Главные проектные решения и почему именно так

### 1.1. Инъекция: storage передаётся в конструкторы пользовательских классов

Центральная проблема ТЗ — «storage нужен при создании экшенов, но доступен только когда
CreateSynapse его передаст». Исследования дали ключевое наблюдение, которое её снимает:

**Инстанс storage и так создаётся в фабрике пользователя** (`storage: new MemoryStorage(...)`,
`posts.synapse.ts:97`). Асинхронна только его *инициализация* (`storage.initialize()`),
а для конструирования экшенов нужен лишь сам объект: `storage.name` для префикса
actionType (`dispatcher.module.ts:343`) и ссылка для будущих `storage.update(...)`.
Подписки watcher'ов ленивы (`dispatcher.module.ts:466`), селекторы вычисляются по
требованию. Значит достаточно дать storage имя в фабрике:

```typescript
const storage = new MemoryStorage<PostsState>({ name: 'posts', initialState })
return {
  storage,
  dispatcher: new PostsDispatcher(storage),
  selectors:  new PostsSelectors(storage, core.selectors),
  ...
}
```

**Что отвергнуто и почему:**

- *Двухфазная инициализация* (`new PostsDispatcher()` + позже `__init(storage)`,
  research/04 §5.2): главный минус — окно «сконструирован, но не готов» и поля,
  типизированные как готовые функции, но падающие до init (research/02 §3.3 называет
  это «врущий тип» — главный удар по типобезопасности). При том, что выигрыш
  (отсутствие одной константы `storage` в фабрике) копеечный.
- *Lazy-прокси на storage*: ломается на синхронных вызовах (`storage.name` нужен
  немедленно), маскирует порядок инициализации, мучительная отладка (research/04 §5.3).
- *Декораторы* (`@action`): требуют настройки декораторов в tsconfig каждого потребителя,
  два несовместимых стандарта, декоратор не сужает тип поля → хуже inference
  (research/01 §5.2г). Не как основной путь; можно добавить позже как сахар.

### 1.2. Имена экшенов из имён полей: финализация после конструирования

Class fields инициализируются до того, как кто-либо может прочитать их имена
(`Object.entries(this)` из `super()` пуст — research/01 §5.1 P2). Решение — шаг
финализации **после** конструирования: скан own enumerable полей, вызов существующего
`_assignType(fieldName)` (протокол уже готов: `actionType` объявлен `configurable: true`,
`dispatcher.module.ts:390-395`).

Кто вызывает финализацию:
1. **Сборщик `createSynapse(factory)`** — основной путь: получив инстанс в конфиге, вызывает внутренний
   `dispatcher[FINALIZE]()` до старта эффектов (эффекты читают `actionType` при сборке
   пайплайна — `effects.module.ts:80-97`, поэтому порядок гарантирован сборщиком).
2. **Ленивая само-финализация** — страховка для standalone-использования и тестов:
   первый dispatch/обращение к `dispatch`-реестру финализирует, если ещё не финализирован
   (к этому моменту инстанс полностью сконструирован — корректно всегда).

`static create()` из research/01 §6 не нужен как обязательная точка входа — он усложнял
бы DX (`PostsDispatcher.create(storage)` вместо `new PostsDispatcher(storage)`);
финализацию берёт на себя сборщик.

### 1.3. Вызываемые API-группы вместо ручного расплющивания

Боль №1 по данным приложения (research/05 §1.1): каждая группа `createApiActions`
расплющивается в 5 ключей руками (`loadPosts: postsReq.init, loadPostsLoading: postsReq.loading, ...` —
`posts.dispatcher.ts:319-352`), ~100 строк по 8 модулям, имена собираются конкатенацией в голове.

Предложение: `this.apiActions<TInitPayload>(accessor)` возвращает **вызываемую** группу —
функция-init с навешанными lifecycle-методами:

```typescript
readonly loadPosts = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)

// UI — как сегодня:        actions.loadPosts({ owner_public_id })
// эффект слушает intent:   ofType(d.loadPosts)            // у init есть actionType → ofType работает
// жизненный цикл:          d.loadPosts.loading() / .success() / .failure(msg) / .reset()
// actionTypes:             '[posts]loadPosts', '[posts]loadPosts:loading', ...
```

Это убирает обе боли сразу: расплющивание И двойное написание имён, при этом вызовы из
UI не меняются вовсе. Симметрично — `this.keyedApiActions` (половина модулей приложения
на keyed-статусах: comments, reactions, messenger — research/05 §8.1).

Сахар для сигналов (7 штук в одном только posts — research/05 §1.3):

```typescript
readonly mounted = this.signal<FeedLifecyclePayload>('Лента смонтирована')
// эквивалент this.action((_s, p: FeedLifecyclePayload) => p, { meta: { description } })
```

### 1.4. Эффекты: `this.effect(fn)`-рецепты, сервисы и внешние сторы — через конструктор

Тип `Effect` — уже отложенный рецепт `(action$, state$, ctx) => Observable`, вызываемый
лениво в `subscribeToEffect` (`effects.module.ts:494`). Поэтому «проблема this.effect до
super()» — псевдопроблема (research/03 §4): `this.effect(fn)` при инициализации поля лишь
записывает `fn` в реестр и возвращает её. EffectsModule не меняется вообще; работают
`stop()/start()` с пересозданием `action$`, горячий `add()`, все операторы.

Что меняется в распределении зависимостей (по реальной статистике использования, research/05 §4):

| Зависимость                 | Сегодня                                          | Предложение                            | Почему                                                                                                                                                                |
|-----------------------------|--------------------------------------------------|----------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| services (api, socket)      | `context.services` + generic-слот                | **конструктор класса**                 | NestJS-стиль; минус один generic; тестируется `new PostsEffects(mockApi, ...)`                                                                                        |
| externalStates (core$)      | `context.externalStates` + index-signature хак   | **конструктор класса** (`core.state$`) | `Synapse` теперь всегда отдаёт `state$` (см. 1.6); двойная декларация типа исчезает                                                                                   |
| externalDispatchers         | `context` (в приложении не используется ни разу) | **конфиг сборщика + context**          | конструктором нельзя: чужие экшены попадают в `action$` только если диспетчер зарегистрирован в EffectsModule (`subscribeToDispatchers`, `effects.module.ts:417-423`) |
| dispatcher, action$, state$ | аргументы эффекта                                | без изменений                          | живут внутри EffectsModule, пересоздаются при stop/start — конструкторная инъекция (стиль NgRx) протухала бы (research/03 §4в)                                        |

Итог: generic-простыня `Effect<TState, TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>`
(6 слотов, 2 из которых всегда заглушки — research/05 §1.5) сжимается до
`Effects<TState, TDispatcher, TExternalDispatchers?>`, указываемой один раз в `extends`.

Отвергнуто: «каждый публичный метод — эффект» (E-2/E-3 из ТЗ) — нет надёжного типового
способа отличить эффект от хелпера; рефлексия по прототипу хрупка; конвенции имён не
проверяются компилятором (research/03 §5). Самый честный маркер — сама обёртка
`this.effect`, которая заодно даёт типизацию.

### 1.5. Селекторы: eager-класс, внешние зависимости через конструктор

`SelectorAPI<T>` самодостаточен и не привязан к типу стора — combined-селектор уже сегодня
штатно зависит от чужого `SelectorAPI` (использует только `selectSync()` + `subscribe()`,
`selector.module.ts:430,459-465`). Поэтому cross-store в class-стиле — просто
типизированный параметр конструктора, и «двойная декларация» external-типов
(значение в `posts.synapse.ts:102` + ручной тип в `posts.selectors.ts:7`) исчезает:

```typescript
class PostsSelectors extends Selectors<PostsState> {
  constructor(storage: IStorage<PostsState>, private readonly core: CoreSelectors) {
    super(storage)
  }
  readonly currentUserId = this.combine([this.core.profile], (p) => p?.user_info?.id ?? null)
}
```

Материализация — eager (поля сразу настоящие `SelectorAPI`): обращение к необъявленному
полю ловится компилятором (TS2729), React-хук `useSelector` не требует изменений
(завязан только на форму `SelectorAPI` — research/02 §1.6). Lazy-вариант с рецептами
отвергнут: сложность без выгоды вне DI-контейнера (research/02 §3.5).

### 1.6. Сборка: `createSynapse(asyncFactory)` — семантика варианта C, ленивый handle

Оценка вариантов из ТЗ (research/04 §4):

|            | A (`new CreateSynapse(factory)`)                            | B (builder)                                                                         | C (функция-конфиг)           |
|------------|-------------------------------------------------------------|-------------------------------------------------------------------------------------|------------------------------|
| Типизация  | отличная (одна точка вывода)                                | хрупкая: протаскивание генериков по цепочке, phantom-фазы, ошибки далеко от причины | отличная                     |
| Реализация | простая                                                     | самая тяжёлая                                                                       | простейшая                   |
| DX         | класс-обёртка ради церемонии; инстанс надо как-то await-ить | порядок шагов — неявное знание; всё общее тащится через ctx                         | лучший, минимальная миграция |

**Выбор: C по семантике.** Builder отвергнут: главный конфиг собирается один раз целиком,
цена в типах не окупается. Класс `CreateSynapse` как публичное имя не даёт ничего, кроме
thenable-церемонии — NestJS-ощущение создают классы Dispatcher/Selectors/Effects, а не
имя сборщика.

**Имя (решено на ревью): `createSynapse`** — новая *перегрузка* существующей функции.
Формы различимы и в типах, и в рантайме: новая принимает **функцию-фабрику**, старая —
**объект-конфиг** (`typeof arg === 'function'`). Старые вызовы `createSynapse({...})`
продолжают работать без изменений, новые пишутся `createSynapse(async () => ({...}))`.

Новая перегрузка поглощает userland-обёртку `createFeatureSynapse`
(`sn_client/src/store/createFeatureSynapse.ts:19-22`): возвращает **ленивый синглтон-handle** —
фабрика исполняется один раз при первом `await`/`.ready()`, а не на импорте. Это заодно
чинит SSR-боль `createSynapseCtx` (жадный вызов `getPostsSynapse()` при импорте,
`posts.context.tsx:10-12`).

Попутные фиксы текущего пайплайна (research/04 §1.4):
- **teardown в LIFO**: сейчас `cleanupCallbacks` исполняются в FIFO — storage уничтожается
  *первым*, эффекты останавливаются *последними* (`createSynapse.ts:91-98`);
- **fail-fast**: сейчас ошибки селекторов/эффектов проглатываются (`handleCallbackError`) —
  синапс «успешно» резолвится наполовину мёртвым; в новом пути любая ошибка = rejection;
- **`state$` всегда** (сейчас — только при эффектах), **`dispatcher` типизирован**
  (сейчас `dispatcher: any`, `types.ts:101,112`).

---

## 2. Публичный API: сигнатуры

### 2.1. `Dispatcher<TState>`

```typescript
// packages/synapse/src/reactive/dispatcher/dispatcher.base.ts
// Текущий класс Dispatcher переименовывается в DispatcherCore (внутренний движок,
// createDispatcher продолжает работать поверх него).

export abstract class Dispatcher<TState extends Record<string, any>> {
  protected readonly storage: IStorage<TState>

  /** Поток всех экшенов модуля (его потребляет EffectsModule). */
  readonly action$: Observable<Action>

  /** Реестр по имени — для middleware/devtools; наполняется при финализации. */
  readonly dispatch: Record<string, DispatchFunction<any, any>>
  readonly watchers: Record<string, WatcherFunction<any>>

  constructor(storage: IStorage<TState>, options?: { middlewares?: EnhancedMiddleware<TState>[] })

  // ── фабрики для class fields ──────────────────────────────────────────────

  /** Экшен: handler в «рецептной» сигнатуре (storage, params) => result. payload = result. */
  protected action<TParams = void, TResult = void>(
    handler: (storage: IStorage<TState>, params: TParams) => TResult | Promise<TResult>,
    options?: {
      type?: string                       // override имени (по умолчанию — имя поля)
      meta?: Record<string, any>
      memoize?: (cur: TParams, prev: TParams, prevResult: TResult) => boolean
    },
  ): DispatchFunction<TParams, TResult>

  /** Чистый сигнал: (_store, p) => p. description уходит в meta. */
  protected signal<TPayload = void>(description?: string): DispatchFunction<TPayload, TPayload>

  /** Вызываемая группа жизненного цикла API-запроса. Сам вызов = init (намерение). */
  protected apiActions<TInitPayload = void>(
    accessor: (state: TState) => ApiRequestState,
  ): ApiActions<TInitPayload>

  /** То же для статусов по ключу (Record<string, ApiRequestState>). */
  protected keyedApiActions<TInitPayload extends { key: string } = { key: string }>(
    accessor: (state: TState) => Record<string, ApiRequestState>,
  ): KeyedApiActions<TInitPayload>

  protected watcher<R>(config: {
    selector: (state: TState) => R
    shouldTrigger?: (prev: R | undefined, current: R) => boolean
    notifyAfterSubscribe?: boolean
    type?: string
    meta?: Record<string, any>
  }): WatcherFunction<R>

  // ── жизненный цикл ────────────────────────────────────────────────────────
  use(...middlewares: EnhancedMiddleware<TState>[]): this
  destroy(): void
  /** @internal вызывает defineSynapse; скан полей + _assignType(имя поля).
   *  Страховка: ленивая само-финализация при первом dispatch. */
  [FINALIZE](): void
}

/** Группа = вызываемый init + lifecycle-методы. ofType(d.loadPosts) ловит init. */
export interface ApiActions<TInitPayload = void> extends DispatchFunction<TInitPayload, TInitPayload> {
  loading: DispatchFunction<void, void>
  success: DispatchFunction<void, void>
  failure: DispatchFunction<string, void>
  reset:   DispatchFunction<void, void>
}
// KeyedApiActions — аналогично, с key в сигнатурах (по образцу createKeyedApiActions, standalone.ts:267-297)
```

Конвенция actionType: поле `loadPosts` → `[posts]loadPosts` (init) и
`[posts]loadPosts:loading` и т.д. — `findActionByType` сплитит по `[name]`, конфликтов нет
(`dispatcher.module.ts:307-311`).

Зарезервированные имена базового класса (нельзя использовать под экшены):
`storage`, `action$`, `dispatch`, `watchers`, `use`, `destroy`. Скан финализации помечает
только значения, созданные фабриками (`_type`-маркеры уже есть), чужие поля игнорирует.

### 2.2. `Selectors<TState>`

```typescript
// packages/synapse/src/core/selector/selectors.base.ts
export abstract class Selectors<TState extends Record<string, any>> {
  /** Принимает storage (создаёт и владеет своим SelectorModule) либо готовый модуль. */
  constructor(source: IStorage<TState> | ISelectorModule<TState>)

  protected select<R>(selector: (state: TState) => R, options?: SelectorOptions<R>): SelectorAPI<R>

  /** Combined; зависимости — любые SelectorAPI, в т.ч. из других сторов. */
  protected combine<Deps extends unknown[], R>(
    deps: { [K in keyof Deps]: SelectorAPI<Deps[K]> },
    fn: (...args: Deps) => R,
    options?: SelectorOptions<R>,
  ): SelectorAPI<R>

  destroy(): void   // уничтожает модуль, только если владеет им
}
```

Внешние селекторы — параметры конструктора подкласса (`constructor(storage, private core: CoreSelectors)`);
parameter properties присваиваются до инициализаторов полей — `this.core` в полях доступен корректно.

### 2.3. `Effects<TState, TDispatcher, TExternalDispatchers?>`

```typescript
// packages/synapse/src/reactive/effects/effects.base.ts
export interface EffectCtx<TDispatcher, TExternalDispatchers = Record<string, never>> {
  dispatcher: TDispatcher                  // инстанс нашего class-диспетчера: d.loadPosts(...)
  external: TExternalDispatchers           // внешние диспетчеры (их экшены уже влиты в action$)
}

export abstract class Effects<
  TState extends Record<string, any>,
  TDispatcher,
  TExternalDispatchers extends Record<string, Dispatcher<any>> = Record<string, never>,
> {
  /** Регистрирует рецепт. Вызовется лениво при EffectsModule.start() с реальными потоками. */
  protected effect(
    fn: (
      action$: Observable<Action>,
      state$: Observable<TState>,
      ctx: EffectCtx<TDispatcher, TExternalDispatchers>,
    ) => Observable<unknown>,
  ): typeof fn

  /** @internal — сборщик скармливает это в effectsModule.addEffects(...). */
  getEffects(): Effect[]

  /** Опциональный teardown (закрыть сокет и т.п.) — вызывается при synapse.destroy(). */
  onDestroy?(): void | Promise<void>
}
```

Совместимость: рецепты структурно совместимы с текущим типом `Effect` (контекст модуля —
надтип `EffectCtx`, лишние поля игнорируются), EffectsModule не меняется.

Правило (в доки + dev-проверка): сервисы из конструктора (`this.api`) можно только
*захватывать в замыкание* `fn`, но не дереференсить в инициализаторе поля — parameter
properties присваиваются после инициализаторов полей derived-класса (research/03 §6.1).

### 2.4. `createSynapse(factory)` / `SynapseModule` / `Synapse`

```typescript
// packages/synapse/src/utils/createSynapse/ — новая перегрузка рядом со старой
export interface SynapseConfig<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined,
  TSelectors extends Selectors<TState> | undefined,
  TEffects extends Effects<TState, NonNullable<TDispatcher>, any> | undefined,
> {
  storage: IStorage<TState>
  dependencies?: DependencyInput[]            // формат не меняется (types.ts:18, waitForDependencies)
  dependencyTimeout?: number
  dispatcher?: TDispatcher
  selectors?: TSelectors
  effects?: TEffects | Array<TEffects | Effect>   // class-инстансы и legacy-функции вперемешку
  /** Чужие диспетчеры, чьи экшены вливаются в action$ (вариант 3 коммуникации). */
  externalDispatchers?: TEffects extends Effects<any, any, infer TExt> ? TExt : never
}

// Новая перегрузка (фабрика-функция). Старые перегрузки с объектом-конфигом остаются.
export function createSynapse<TState, TDispatcher, TSelectors, TEffects>(
  factory: () => SynapseConfig<...> | Promise<SynapseConfig<...>>,
): SynapseModule<TState, TDispatcher, TSelectors>

/** Ленивый синглтон-handle. Поглощает createFeatureSynapse и createSynapseAwaiter. */
export interface SynapseModule<TState, TDispatcher, TSelectors>
  extends PromiseLike<Synapse<TState, TDispatcher, TSelectors>> {
  ready(): Promise<Synapse<TState, TDispatcher, TSelectors>>   // первый вызов запускает фабрику
  isReady(): boolean
  /** Останавливает модуль. Handle пересоздаваемый: следующий ready() заново исполнит фабрику. */
  destroy(): Promise<void>
}

export interface Synapse<TState, TDispatcher, TSelectors> {
  storage: IStorage<TState>
  state$: Observable<TState>      // ВСЕГДА (не только при эффектах)
  dispatcher: TDispatcher         // полный тип класса (сейчас any — types.ts:101)
  actions: TDispatcher            // алиас: поля class-диспетчера и есть dispatch-функции
  selectors: TSelectors
  destroy(): Promise<void>
}
```

Порядок инициализации `ready()` (один раз, мемоизированный промис):

```
1. config = await factory()                       ← async-пролог: await чужих synapse, API-клиенты
2. минимальная runtime-валидация (instanceof, дубли имён storage)
3. await waitForDependencies(config.dependencies) ← без изменений (waitForDependencies.ts)
4. await config.storage.initialize()
5. dispatcher[FINALIZE]()                         ← имена экшенов из имён полей
6. (селекторы уже материализованы конструктором — шага нет)
7. state$ = toObservable(storage)                 ← всегда (механика effects.module.ts:382-393 → утилита)
8. effects: new EffectsModule(storage, dispatcher, externalDispatchers, {}, {}, {})
   → addEffects(инстансы.getEffects() + legacy-функции) → await start()
9. cleanup в LIFO: stop effects → onDestroy() effects → destroy dispatcher
   → destroy selectors → destroy storage
10. любая ошибка любого шага → rejection ready()  (никаких swallow)
```

### 2.5. React

`useSelector` не меняется (зависит только от `SelectorAPI`). `createSynapseCtx` получает
вторую сигнатуру — принимает **handle** (а не промис), фабрика дёргается лениво при первом
монтировании Provider'а, а не на импорте:

```typescript
export const { contextSynapse: withPosts, useSynapseSelectors, useSynapseActions } =
  createSynapseCtx(postsSynapse /* SynapseModule, не вызов! */, { loadingComponent: <Spinner/> })
```

`useSynapseActions` возвращает сам инстанс диспетчера (`Synapse.actions = dispatcher`),
поэтому `actions.loadPosts({...})` в компонентах не меняется.

---

## 3. Cross-synapse коммуникация (4 варианта из Части 3b)

```typescript
// В фабрике posts-модуля: const core = await coreSynapse  (handle — thenable)

// 1. Чтение чужого стора → конструктор Effects, типизированный Observable
new PostsEffects(api, socket, core.state$)         // core.state$: Observable<CoreState> — всегда есть

// 2. Чтение чужих селекторов → конструктор Selectors
new PostsSelectors(storage, core.selectors)        // CoreSelectors — именованный тип класса
//   readonly currentUserId = this.combine([this.core.profile], (p) => p?.user_info?.id ?? null)

// 3. Реакция на чужие экшены → конфиг + context (конструктором нельзя: экшены должны
//    влиться в action$ через EffectsModule.subscribeToDispatchers)
createSynapse(async () => ({
  ...,
  effects: new PostsEffects(...),
  externalDispatchers: { core: core.dispatcher },  // тип сверяется с generic'ом PostsEffects
}))
class PostsEffects extends Effects<PostsState, PostsDispatcher, { core: CoreDispatcher }> {
  readonly clearOnLogout = this.effect((action$, _s$, { dispatcher, external }) =>
    action$.pipe(
      ofType(external.core.clearSession),          // чужой экшен — уже в action$
      tap(() => dispatcher.reset()),
    ))
}

// 4. Посредник — обычный synapse-модуль без стейта данных: только сигналы.
//    Оба модуля знают только его, не друг друга.
class AppEventsDispatcher extends Dispatcher<Record<string, never>> {
  readonly userLoggedOut = this.signal<void>('Пользователь вышел')
  readonly entityInvalidated = this.signal<{ kind: string; id: string }>()
}
export const appEvents = createSynapse(async () => ({
  storage: new MemoryStorage({ name: 'app-events', initialState: {} }),
  dispatcher: new AppEventsDispatcher(/* storage */ ...),
}))

// core пишет в шину (инстанс диспетчера шины — обычная конструкторная зависимость):
class CoreEffects extends Effects<CoreState, CoreDispatcher> {
  constructor(private readonly bus: AppEventsDispatcher) { super() }
  readonly broadcastLogout = this.effect((action$, _s$, { dispatcher }) =>
    action$.pipe(ofType(dispatcher.clearSession), tap(() => this.bus.userLoggedOut())))
}
// posts слушает шину через externalDispatchers: { bus: busDispatcher } + ofType(external.bus.userLoggedOut)
```

Замечание по приоритетам: в живом приложении вариант 3 не используется ни разу
(grep по sn_client — research/05 §4), вся коммуникация сегодня — варианты 1-2.
Поэтому варианты 1-2 сделаны максимально дешёвыми (конструктор), а 3-4 — поддержаны
без усложнения базового API.

---

## 4. Posts-модуль в новом стиле (полный пример)

### `posts.dispatcher.ts` (было 376 строк → ~190 с теми же комментариями)

```typescript
import { Dispatcher } from 'synapse-storage/reactive'
import type { PostsState } from './posts.synapse'

export class PostsDispatcher extends Dispatcher<PostsState> {
  // ── API-группы: вызов = init-намерение, .loading/.success/.failure/.reset — жизненный цикл ──
  readonly loadPosts  = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)
  readonly loadMore   = this.apiActions((s) => s.api.loadMoreRequest)
  readonly createPost = this.apiActions<CreatePostIntent>((s) => s.api.createRequest)
  readonly updatePost = this.apiActions<UpdatePostIntent>((s) => s.api.updateRequest)
  readonly removePost = this.apiActions<string>((s) => s.api.removeRequest)

  // ── Сигналы жизненного цикла ленты (их слушают эффекты) ──────────────────
  readonly mounted   = this.signal<FeedLifecyclePayload>('Лента постов смонтирована')
  readonly unmounted = this.signal<FeedLifecyclePayload>('Лента постов размонтирована')
  readonly startEdit = this.signal<string>('Намерение открыть правку поста')
  readonly togglePin = this.signal<string>('Намерение закрепить/открепить пост')
  readonly repostPost = this.signal<RepostIntent>('Намерение сделать репост')

  // ── Сигналы realtime ─────────────────────────────────────────────────────
  readonly loadCounters = this.signal<void>('Намерение опросить батч-счётчики')
  readonly openPost  = this.signal<string>('Пост открыт — подписка на WS-комнату')
  readonly closePost = this.signal<string>('Пост закрыт — отписка от WS-комнаты')

  // ── Чистые обновления стора ──────────────────────────────────────────────
  readonly applyPosts = this.action((store, page: PostsFeedResponseDto) =>
    store.update((s) => {
      s.list = dedupById(page.data)
      s.cursor = page.cursor
      s.hasMore = page.has_more
    }))

  readonly appendPosts = this.action((store, page: PostsFeedResponseDto) =>
    store.update((s) => {
      s.list = dedupById([...s.list, ...page.data])
      s.cursor = page.cursor
      s.hasMore = page.has_more
    }))

  readonly prependPost = this.action((store, post: PostResponseDto) =>
    store.update((s) => { s.list = dedupById([post, ...s.list]) }))

  readonly setOwnerPublicId = this.action((store, ownerPublicId: string | null) =>
    store.update((s) => { s.ownerPublicId = ownerPublicId }))

  readonly patchPost = this.action((store, p: { id: string; patch: Partial<PostResponseDto> }) =>
    store.update((s) => { s.list = s.list.map((x) => (x.id === p.id ? { ...x, ...p.patch } : x)) }))

  readonly dropPost = this.action((store, id: string) =>
    store.update((s) => { s.list = s.list.filter((x) => x.id !== id) }))

  readonly applyCounters = this.action((store, counters: PostCountersDto[]) => { /* как сейчас */ })
  readonly setEditingPost  = this.action((store, id: string | null) =>
    store.update((s) => { s.editingPostId = id }))
  readonly setDeletingPost = this.action((store, id: string | null) =>
    store.update((s) => { s.deletingPostId = id }))
}
// Тип = сам класс. ReturnType-костыль не нужен.
```

Что исчезло: `defineAction<PostsState>()`-шапка, 60-строчный `createDispatcher`-реестр
(25 строк расплющивания пятёрок + повтор каждого имени), `export type PostsDispatcher = ReturnType<...>`.

### `posts.selectors.ts`

```typescript
import { Selectors } from 'synapse-storage/core'

export class PostsSelectors extends Selectors<PostsState> {
  constructor(
    storage: IStorage<PostsState>, 
    private readonly core: CoreSelectors
  ) {
    super(storage)
  }

  private readonly api = this.select((s) => s.api)     // промежуточный — приватный

  readonly list           = this.select((s) => s.list)
  readonly postsStatus    = this.combine([this.api], (a) => a.postsRequest.status)
  readonly postsError     = this.combine([this.api], (a) => a.postsRequest.error)
  readonly isPostsLoading = this.combine([this.api], (a) => a.postsRequest.status === ApiStatus.Loading)
  readonly hasMore        = this.select((s) => s.hasMore)
  readonly isLoadingMore  = this.combine([this.api], (a) => a.loadMoreRequest.status === ApiStatus.Loading)
  readonly createRequest  = this.combine([this.api], (a) => a.createRequest)
  readonly editingPostId  = this.select((s) => s.editingPostId)
  readonly deletingPostId = this.select((s) => s.deletingPostId)
  readonly updateRequest  = this.combine([this.api], (a) => a.updateRequest)
  readonly removeRequest  = this.combine([this.api], (a) => a.removeRequest)

  // cross-store: реактивно пересчитывается при изменении core-стора
  readonly currentUserId = this.combine([this.core.profile], (p) => p?.user_info?.id ?? null)
}
```

### `posts.effects.ts` (репрезентативные эффекты; остальные переносятся дословно)

```typescript
import { Effects, ofType, ofTypes, validateMap, apiResult, fromRequest, selectorObject } from 'synapse-storage/reactive'

export class PostsEffects extends Effects<PostsState, PostsDispatcher> {
  constructor(
    private readonly api: PostsEndpoints,
    private readonly socket: PostsSocketService,
    private readonly core$: Observable<CoreState>,     // чужой стор — обычная зависимость
  ) { super() }

  /** mounted → намерение loadPosts по owner_public_id (компонент остаётся чистым). */
  readonly mounted = this.effect((action$, _state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.mounted),
      mergeMap((action) => {
        const { ownerPublicId } = action.payload
        if (!ownerPublicId) return EMPTY
        d.setOwnerPublicId(ownerPublicId)
        return of(d.loadPosts({ owner_public_id: ownerPublicId }))
      }),
    ))

  /** Загрузка ленты: 5-state протокол. ofType(d.loadPosts) ловит init-намерение. */
  readonly loadPosts = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadPosts),
      withLatestFrom(selectorObject(state$, { status: (s) => s.api.postsRequest.status })),
      validateMap({
        validator: ([, { status }]) => ({
          conditions: [status !== ApiStatus.Loading],
          skipAction: () => d.loadPosts.reset(),
        }),
        loadingAction: () => d.loadPosts.loading(),
        errorAction: (err) => d.loadPosts.failure(getErrorMessage(err)),
        apiCall: ([action]) =>
          fromRequest(this.api.getPosts.request({ ...(action.payload ?? {}), limit: POSTS_PAGE_SIZE })).pipe(
            apiResult((page) => {
              d.applyPosts(page ?? { data: [], cursor: null, has_more: false })
              d.loadPosts.success()
            }),
          ),
      }),
    ))

  /** Слой 3: connect/disconnect сокета по core.profile — внешний стор из конструктора. */
  readonly connection = this.effect(() =>
    this.core$.pipe(
      map((core) => core.profile),
      distinctUntilChanged((a, b) => a?.id === b?.id),
      tap((profile) => {
        if (profile) this.socket.connect({ profile_id: profile.id, /* ... */ })
        else this.socket.disconnect()
      }),
    ))

  /** Вход/выход в WS-комнату открытого поста. */
  readonly room = this.effect((action$, _s$, { dispatcher: d }) =>
    action$.pipe(
      ofTypes([d.openPost, d.closePost]),
      tap((a) => (a.type === d.openPost.actionType ? this.socket.subscribe(a.payload) : this.socket.unsubscribe(a.payload))),
    ))

  // loadMore / createPost / startEdit / updatePost / removePost / togglePin / repost /
  // counters / inbound — переносятся дословно, меняется только
  // `dispatcher.dispatch.xxx` → `d.xxx` и `d.xxxLoading()` → `d.xxx.loading()`.

  override onDestroy() { this.socket.disconnect() }
}
```

Что исчезло: 18-строчный блок типов (`Services`/`ExtStates` с index-signature хаком +
6-параметровый `PostsEffect`), ручной массив `postsEffects = [...]` (13 позиций),
40+ повторов `dispatcher.dispatch.`.

### `posts.synapse.ts` (сборка)

```typescript
import { createSynapse } from 'synapse-storage'
import { MemoryStorage } from 'synapse-storage/core'
import { coreSynapse } from '@store'

export interface PostsState { /* как сейчас, без изменений */ }
const initialState: PostsState = { /* ... */ }

export const postsSynapse = createSynapse(async () => {
  const api = await getPostsEndpoints()
  const core = await coreSynapse                 // handle другого модуля — thenable
  const socket = new PostsSocketService()
  const storage = new MemoryStorage<PostsState>({ name: 'posts', initialState })

  return {
    dependencies: [core],
    storage,
    dispatcher: new PostsDispatcher(storage),
    selectors:  new PostsSelectors(storage, core.selectors),
    effects:    new PostsEffects(api, socket, core.state$),
  }
})
// Awaited<ReturnType<...>>-костыль не нужен: тип = Synapse<PostsState, PostsDispatcher, PostsSelectors>
```

Ленивый синглтон и инъекция core встроены — userland `createFeatureSynapse` больше не нужен.

### `posts.context.tsx`

```typescript
export const { contextSynapse: withPosts, useSynapseSelectors: usePostsSelectors, useSynapseActions: usePostsActions } =
  createSynapseCtx(postsSynapse, { loadingComponent: <p>Loading posts…</p> })
// handle, а не вызов → ничего не создаётся на импорте; next/dynamic ssr:false больше не обязателен
```

---

## 5. Что создать/изменить в библиотеке, объём

| #  | Работа                                                                                                                                                 | Файлы                                                  | Оценка       |
|----|--------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------|--------------|
| 1  | Переименовать `Dispatcher` → `DispatcherCore` (внутр.), сохранить экспорт-алиас                                                                        | `reactive/dispatcher/dispatcher.module.ts`, `index.ts` | мелкая       |
| 2  | `Dispatcher<TState>` base: фабрики, FINALIZE-скан, делегаты use/destroy; вынести `resolvePath`/`setByPath` из standalone в общий модуль                | новый `dispatcher.base.ts`                             | ~250 строк   |
| 3  | Вызываемые `ApiActions`/`KeyedApiActions` (init-функция + lifecycle-props)                                                                             | там же                                                 | в составе №2 |
| 4  | `Selectors<TState>` base (eager, владение модулем)                                                                                                     | новый `core/selector/selectors.base.ts`                | ~60 строк    |
| 5  | `Effects<...>` base (реестр + Symbol-маркер + dev-проверка «забыл this.effect»)                                                                        | новый `reactive/effects/effects.base.ts`               | ~80 строк    |
| 6  | Перегрузка `createSynapse(factory)` + `SynapseModule`-handle: пайплайн с LIFO-teardown, fail-fast, state$ всегда, пересоздание после destroy           | `utils/createSynapse/` (рядом со старой формой)        | ~250 строк   |
| 7  | `toObservable(storage)` → публичная утилита (уже есть в `effects/utils/toObservable.ts`)                                                               | экспорт                                                | мелкая       |
| 8  | `createSynapseCtx`: сигнатура с handle + ленивый старт                                                                                                 | `react/`                                               | ~50 строк    |
| 9  | Опционально: `removeSelector(id)` в `ISelectorModule` (точечная очистка — research/02 §5)                                                              | `core/selector/`                                       | ~30 строк    |
| 10 | `resubscribeOnError` для эффектов — подтверждено на ревью (сейчас эффект умирает после первой непойманной ошибки — `effects.module.ts:494-499`)        | `effects.module.ts`                                    | ~30 строк    |
| 11 | Тесты на базовые классы + сборщик                                                                                                                      |                                                        | ~ объём кода |
| 12 | Экспорты: всё новое доступно из корня; решить про entry `synapse-storage/bl` (см. open questions)                                                      | `index.ts`-ы                                           | мелкая       |

Итого ~700-800 строк нового кода библиотеки + тесты. **Существующие движки не меняются**
(кроме опциональных №9-10 и фикса экспорта), старые API не трогаются.

## 6. Backward compatibility

1. `createSynapse`, `createDispatcher`, `defineAction`, `createApiActions`,
   `createFeatureSynapse`-паттерн — работают как раньше; новый и старый пути используют
   одни движки.
2. `dependencies` совместимы в обе стороны: контракт `waitForDependencies` — это
   `.storage.waitForReady()` либо thenable (`waitForDependencies.ts:13-17`); новый
   `Synapse` структурно содержит `storage`, `SynapseModule` — thenable.
3. Операторы (`ofType`, `ofTypes`, `validateMap`, `apiResult`, `fromRequest`,
   `selectorObject`) не меняются: class-поля диспетчера — те же `DispatchFunction`.
4. `useSelector` не меняется (`SelectorAPI` стабилен).
5. Миграция модуля — механическая и пофайловая: можно перевести один модуль на
   `createSynapse(factory)`, оставив остальные на `createSynapse(config)` —
   cross-зависимости совместимы. Эффекты переносятся почти дословно
   (`dispatcher.dispatch.loadPostsLoading()` → `d.loadPosts.loading()`).

## 7. Риски и решения по открытым вопросам (после ревью 2026-06-12)

**Решено:**

1. ~~Имя сборщика~~ → **`createSynapse`**: новая перегрузка существующей функции
   (фабрика-функция vs объект-конфиг, различимы по `typeof`). Старые вызовы не ломаются.
2. ~~Конвенция lifecycle-имён~~ → **`loadPosts:loading`** (`[posts]loadPosts:loading` в devtools).
3. **Группа как вызываемый init** — принято; правило для доков: `ofType(d.loadPosts)`
   ловит **только init** (намерение), жизненный цикл слушается явно:
   `ofType(d.loadPosts.success)`. Подробное пояснение — см. §8.0.
4. **Финализация диспетчера** — принято; механика прозрачна для пользователя
   (см. §8.0): сборщик финализирует сам, dispatch до готовности бросает понятную ошибку,
   поля-алиасы детектируются dev-проверкой.
5. **Зарезервированные имена полей** — dev-проверка коллизий при финализации. Принято.
6. **Combined поверх внешних сторов / readiness** — смягчается `dependencies`;
   агрегированный readiness — отдельная задача ядра (не MVP). Принято.
7. **«Заморозка» зависимых селекторов при destroy внешнего модуля** — задокументировать. Принято.
8. ~~Опция ресабскрайба эффектов~~ → **делаем** (`resubscribeOnError`, №10 в плане).
9. ~~HMR / повторный ready()~~ → **handle пересоздаваемый**: `destroy()` сбрасывает
   мемоизированный промис, следующий `ready()` заново исполняет фабрику. Стоит ~10 строк,
   закрывает HMR и тесты.

**Осталось открытым:**

10. **Entry points** (`synapse-storage/bl`-алиас): entry points пакета ещё дорабатываются —
    вернёмся к вопросу при реализации; добавление алиаса в exports тривиально.
11. **`media`-кейс (3 синапса в папке)** и **синапсы без эффектов/диспетчера**
    (media-player, core) — конфиг позволяет опускать любые слои; ничего специального не нужно,
    но тест-кейсы на «storage-only» и «storage+selectors» обязательны.

---

## 8. Дополнения после ревью

### 8.0. Пояснения к пунктам 3 и 4 (вопросы с ревью)

**Вызываемая группа (п.3).** `d.loadPosts` — это одновременно функция и контейнер:
сам вызов `d.loadPosts(params)` диспатчит *намерение* (init), а `d.loadPosts.loading()`,
`.success()`, `.failure(msg)`, `.reset()` — экшены жизненного цикла. Единственное место,
где можно запутаться: `ofType(d.loadPosts)` фильтрует **только init** — чтобы среагировать
на успех, пишется `ofType(d.loadPosts.success)`. Это фиксируется в документации и JSDoc.

**Финализация (п.4).** Имя экшена берётся из имени поля класса, но прочитать имена полей
можно только после полного конструирования инстанса. Поэтому есть короткое «окно»:
между `new PostsDispatcher(storage)` и моментом, когда сборщик присвоит имена
(до старта эффектов). Для пользователя это невидимо — всё происходит внутри `createSynapse`.
Если диспетчер используют вне сборщика (тесты) — первый же dispatch финализирует сам.
Единственное ограничение: поле-алиас (`readonly load = this.loadPosts`) дало бы одному
экшену два имени — это ловится dev-проверкой с понятной ошибкой.

### 8.1. Реактивный React-слой: Observable как первоклассный источник для компонентов

Запрос с ревью: «synapse — это же Observable; хочу реактивный подход в компонентах,
например задебаунсить поле стора прямо в компоненте, без телодвижений в диспетчере».

Да, это естественно ложится на архитектуру — всё уже Observable внутри. Предлагаю три вещи:

```typescript
// 1) У SelectorAPI появляется Observable-вид (тонкая обёртка над subscribe):
interface SelectorAPI<T> {
  // ...как сейчас
  readonly $: Observable<T>          // emit при каждом реальном изменении значения
}
// state$ синапса уже есть (Synapse.state$ — всегда).

// 2) Хук-мост из Rx в React (на useSyncExternalStore):
function useObservable<T>(source$: Observable<T>, initialValue: T): T
function useObservable<T>(factory: () => Observable<T>, initialValue: T, deps: unknown[]): T
//  ^ вторая сигнатура мемоизирует pipe-цепочку — без неё пользователь пересоздавал бы
//    Observable на каждый рендер

// 3) Хук побочной реакции (подписка без значения):
function useSubscription<T>(factory: () => Observable<T>, deps: unknown[]): void
```

Использование — дебаунс поля стора прямо в компоненте, диспетчер не участвует:

```tsx
const { selectors } = usePostsSynapse()

// мгновенное значение — как раньше:
const query = useSelector(selectors.searchQuery)

// задебаунсенное производное — чисто в компоненте:
const debouncedQuery = useObservable(
  () => selectors.searchQuery.$.pipe(debounceTime(300), distinctUntilChanged()),
  '',
  [selectors],
)

// или реакция без значения (скролл к новому сообщению и т.п.):
useSubscription(
  () => selectors.lastMessageId.$.pipe(skip(1), tap(() => listRef.current?.scrollToEnd())),
  [selectors],
)
```

Запись остаётся через экшены (однонаправленный поток сохраняем), но *чтение + трансформация*
становятся полностью реактивными. Реализация дешёвая: `SelectorAPI.$` — ~10 строк
(у `subscribe` уже правильная семантика: синхронный снапшот при подписке + emit при
изменении), `useObservable`/`useSubscription` — ~40 строк. Добавляется в план работ (№13).

Ограничение (в доки): Observable-цепочка с асинхронными операторами (debounce и т.п.)
эмитит после первого рендера — поэтому обязателен `initialValue` (аналогично
`getServerSnapshot` для SSR).

### 8.2. Параметрические (keyed) селекторы — для переиспользуемых модулей

Запрос с ревю: модуль комментариев обслуживает посты/медиа/сообщения — нужно удобно
«нарезать» хранилище по ключу цели и подписываться без лишних ререндеров. Сегодня это
решается в userland (`useKeyedSliceSelector`). Предлагаю первоклассную поддержку:

```typescript
abstract class Selectors<TState> {
  // ...
  /** Фабрика параметрических селекторов с кэшем по ключу: один SelectorAPI на ключ. */
  protected keyed<K extends string | number, R>(
    fn: (key: K) => (state: TState) => R,
  ): (key: K) => SelectorAPI<R>
}

class CommentsSelectors extends Selectors<CommentsState> {
  readonly byTarget = this.keyed((key: string) => (s) => s.byTarget[key] ?? EMPTY_LIST)
  readonly status   = this.keyed((key: string) => (s) => s.api.commentsRequest[key]?.status ?? ApiStatus.Idle)
}

// В компоненте треда: подписка ровно на свой срез
const comments = useSelector(selectors.byTarget(commentKey('post', postId)))
```

Гранулярность ререндеров обеспечивается существующей мемоизацией: при иммутабельном
обновлении одного ключа селекторы остальных ключей возвращают прежнюю ссылку → их
подписчики не уведомляются (`equals === '===='`-семантика, `selector.module.ts:93-95`).
Кэш по ключу — внутри фабрики (Map), очистка — вместе с destroy класса. ~50 строк (№14 в плане).

### 8.3. Внешние сервисы (метрики, любые API) — уже покрыто, два пути

1. **Точечно** — сервис как конструкторная зависимость Effects (как `api`/`socket`):
   ```typescript
   class PostsEffects extends Effects<PostsState, PostsDispatcher> {
     constructor(/*...,*/ private readonly analytics: AnalyticsService) { super() }
     readonly trackCreate = this.effect((action$, _s$, { dispatcher: d }) =>
       action$.pipe(ofType(d.createPost.success), tap(() => this.analytics.track('post_created'))))
   }
   ```
2. **Сквозно** (все экшены модуля) — middleware диспетчера, механизм уже есть (`use()`,
   `EnhancedMiddleware`, как `loggerDispatcherMiddleware`):
   ```typescript
   new PostsDispatcher(storage, { middlewares: [analyticsMiddleware(analytics)] })
   ```

### 8.4. SSR / предзаполненное состояние (Next.js)

Запрос: серверный рендер получает посты, клиент стартует с предзаполненного стора.
Это два слоя:

- **Слой Next.js** (вне библиотеки): server component делает fetch и передаёт данные
  в клиентский компонент через props — стандартный паттерн App Router.
- **Слой библиотеки**: нужна точка «влить серверные данные до первого рендера».
  `initialState` у storage уже есть, но синапс — ленивый синглтон, его фабрика не знает
  о пропсах конкретной страницы. Предлагаю опцию гидрации в React-биндинге:

  ```tsx
  // server component:  const posts = await fetchPosts()
  // client:
  <PostsProvider hydrate={(s) => { s.list = posts; s.cursor = posts.cursor }}>...</PostsProvider>
  // contextSynapse применяет hydrate через storage.update() один раз, после ready()
  // и до первого рендера детей. Повторные монтирования гидрацию не повторяют.
  ```

  Статус: **отдельная фича, не MVP** — дизайн нового API ничего не блокирует
  (`storage.update` покрывает механику), добавим после согласования основной части.

### 8.5. План работ — дополнения

| #  | Работа | Оценка |
|----|--------|--------|
| 13 | `SelectorAPI.$` + хуки `useObservable`/`useSubscription` (§8.1) | ~60 строк |
| 14 | Параметрические keyed-селекторы `this.keyed(...)` (§8.2) | ~50 строк |
| 15 | Пересоздаваемый handle (`destroy()` → сброс мемоизации) (§7 п.9) | ~10 строк |
| —  | Гидрация SSR (§8.4) | после MVP |


