# Research 04 — Сборщик модуля `createSynapse`

> Исследование для переосмысления API synapse-storage в class-based стиле (NestJS-like).
> Все пути — относительно `/Users/vlad/web_dev/synapse/`.
>
> **Примечание о доступе**: файлы живого проекта `/Users/vlad/web_dev/sn_client/` оказались
> недоступны (запрет на чтение вне рабочего репозитория). Живой пример `posts.synapse.ts`
> и `createFeatureSynapse` цитируются по `_fable/TASK.md` (раздел 1.2), где они приведены
> полностью. `createFeatureSynapse` в самой библиотеке **отсутствует** — grep по
> `packages/synapse/src/` не находит ни одного вхождения; это userland-обёртка в sn_client.

---

## 1. Текущий жизненный цикл `createSynapse`

Файл: `packages/synapse/src/utils/createSynapse/createSynapse.ts` (162 строки).

### 1.1. Сигнатура и перегрузки

Три перегрузки (строки 21–50) + реализация (строки 53–61). Реализация принимает `config: any`
и возвращает `Promise<any>` — вся типизация живёт только в перегрузках:

```ts
// Случай 1: с dispatcher и effects (createSynapse.ts:21-31)
export function createSynapse<TStore, TSelectors, TDispatcher, TServices, TConfig, TExternalSelectors, TStorage>(
  config: CreateSynapseConfigWithEffects<TStore, TSelectors, TDispatcher, TServices, TConfig, TExternalSelectors>,
): Promise<SynapseStoreWithEffects<TStore, TStorage, TSelectors, ExtractDispatchType<TDispatcher>>>

// Случай 2: только dispatcher (createSynapse.ts:34-42)
// Случай 3: без dispatcher (createSynapse.ts:45-50)
```

`ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : never` (`types.ts:9`) —
из диспетчера вытаскивается только поле `dispatch`, оно становится `result.actions`.

### 1.2. Точный порядок шагов инициализации

Реализация `createSynapse.ts:53-161`, нумерация шагов из комментариев в коде:

| # | Шаг | Строки | Обработка ошибок |
|---|-----|--------|------------------|
| 0 | `validateSynapseConfig(config)` | 63–67 | `handleOperationError` → **log + rethrow** (fail fast) |
| 1 | `await waitForDependencies(config.dependencies, config.dependencyTimeout)` | 70 | внутри: log + **rethrow** на каждую зависимость |
| 2 | `await config.setup()` — инициализация API-клиентов и т.п. | 73–79 | `handleOperationError` → **rethrow** |
| 3 | Создание storage: `config.createStorageFn ? await createStorageFn() : config.storage`, затем `await storageInstance.initialize()` | 82–83 | **нет try/catch** — ошибка летит наружу как rejection промиса |
| — | Формирование скелета `result` + массива `cleanupCallbacks`; первым пушится `() => storageInstance.destroy()` | 86–98 | — |
| 4 | `selectorModule = new SelectorModule(storageInstance)`; `result.selectors = config.createSelectorsFn(selectorModule, externalSelectors)`; пуш `selectorModule.destroy` в cleanup | 105–119 | `handleCallbackError` → **log + swallow** (!) |
| 5 | `dispatcher = config.createDispatcherFn(storageInstance)`; `result.dispatcher = dispatcher`; если есть `dispatch` — `result.actions = dispatcher.dispatch`; пуш `dispatcher.destroy` | 122–134 | **нет try/catch** — ошибка летит наружу |
| 6 | `const { services, config: effectConfig, externalDispatchers, externalStates } = config.createEffectConfig()`; `effectsModule = new EffectsModule(storage, dispatcher, externalDispatchers ?? {}, services, effectConfig, externalStates ?? {})`; `config.effects.forEach(e => effectsModule.add(e))`; `await effectsModule.start()`; `result.state$ = effectsModule.state$`; пуш `effectsModule.stop` | 137–159 | `handleCallbackError` → **log + swallow** (!) |
| 7 | `return result` | 161 | — |

Шаг 6 выполняется только при `config.createEffectConfig && dispatcher` (строка 137) —
эффекты невозможны без диспетчера (это же дублирует runtime-валидация, `validate.ts:12-18`).

Семантика error-хелперов — `packages/synapse/src/_utils/error-handling.util.ts:46-58`:
`handleOperationError` логирует и **бросает** (`: never`), `handleCallbackError` логирует
и **проглатывает**.

### 1.3. Форма результата

Собирается мутабельно в `result: any` (createSynapse.ts:88-96):

```ts
const result: any = {
  storage: storageInstance,
  selectors: {} as TSelectors,
  destroy: async () => { for (const callback of cleanupCallbacks) await callback() },
}
// + result.dispatcher, result.actions (= dispatcher.dispatch), result.state$ (= effectsModule.state$)
```

Декларируемые типы результата — `types.ts:96-123`:

```ts
export interface SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions> {
  storage: TStorage
  selectors: TSelectors
  actions: TActions          // = ExtractDispatchType<TDispatcher>, типизирован
  state$: Observable<TStore> // только в варианте with-effects
  dispatcher: any            // ← тип диспетчера ТЕРЯЕТСЯ (types.ts:101, 112)
  destroy: () => Promise<void>
}
```

Плюс union `AnySynapseStore` (`types.ts:128-131`) — им оперируют `createSynapseAwaiter`
(`utils/createSynapseAwaiter.ts:55-57`) и `DependencyInput` (`types.ts:18`).

### 1.4. Проблемы текущей реализации (важно для редизайна)

1. **Порядок destroy — FIFO, а должен быть LIFO.** `cleanupCallbacks` исполняются в порядке
   добавления (createSynapse.ts:91-95): сначала `storage.destroy()` (пушится первым, строка 98),
   потом `selectorModule.destroy()`, `dispatcher.destroy()`, и только в конце `effectsModule.stop()`.
   То есть эффекты ещё живы и подписаны, когда storage уже уничтожен. Корректный teardown —
   обратный порядок инициализации: stop effects → destroy dispatcher → destroy selectors → destroy storage.
2. **Тихая частичная инициализация.** Ошибки в селекторах (шаг 4) и эффектах (шаг 6)
   проглатываются: synapse «успешно» резолвится с `selectors = {}` и без работающих эффектов.
   При этом ошибка в dispatcher (шаг 5) наоборот ничем не обёрнута и валит весь промис —
   стратегия непоследовательная.
3. **`dispatcher: any` в типах результата** — типы dispatch-функций доступны только через
   `result.actions`; `watchers` диспетчера вообще не представлены в результате.
4. **`state$` существует только при наличии эффектов** — хотя это просто Observable поверх
   `storage.subscribeToAll` (effects.module.ts:382-393) и мог бы быть всегда.
5. Реализация — `config: any`, `result: any`, `@ts-ignore` (строки 126, 144): типобезопасность
   держится исключительно на перегрузках; внутри функции компилятор ничего не проверяет.

---

## 2. `waitForDependencies` и `validate`

### 2.1. `waitForDependencies.ts` (47 строк)

Назначение: дождаться готовности **сторонних** synapse/хранилищ до инициализации своего.

```ts
// waitForDependencies.ts:13-17 — нормализация формата зависимости
function extractStorage(dep: any): IStorageBase<any> {
  if (typeof dep.waitForReady === 'function') return dep            // raw IStorageBase
  if (dep.storage && typeof dep.storage.waitForReady === 'function') return dep.storage // { storage } | SynapseStore
  throw new Error('Invalid dependency: ...')
}
```

Алгоритм (`waitForDependencies.ts:19-47`):
1. Пустой массив → мгновенный return.
2. Все зависимости обрабатываются **параллельно** (`Promise.all`).
3. Для каждой: `await dependencyOrPromise` (поддерживается `Promise<AnySynapseStore>` —
   т.е. можно передать сам промис чужого `createSynapse(...)`), затем `extractStorage`,
   затем `await storage.initialize()` — **идемпотентно**, т.е. зависимость автоматически
   бутстрапится, если её ещё никто не инициализировал (комментарий на строке 33),
   затем `Promise.race([storage.waitForReady(), timeout])` с дефолтом **30 000 мс**
   (`DEFAULT_DEPENDENCY_TIMEOUT`, строка 5).
4. Ошибка/таймаут любой зависимости → `handleOperationError` → **rejection всего createSynapse**
   с сообщением вида `Dependency 2 ("core") timed out after 30000ms...`.

Поддерживаемые формы `DependencyInput` (`types.ts:18`):
`IStorageBase<any> | { storage: IStorageBase<any> } | Promise<AnySynapseStore>`.

Это ключевой механизм cross-synapse зависимостей, и контракт у него минимальный:
**достаточно, чтобы у зависимости был `.storage.waitForReady()`** — значит, любой новый
class-based результат, структурно содержащий `storage: IStorage`, автоматически совместим
со старым `dependencies: []` в обе стороны.

### 2.2. `validate.ts` (89 строк)

Чисто структурная runtime-валидация конфига (`validateSynapseConfig`):

- `storage` XOR `createStorageFn` — ровно одно из двух (строки 3–9);
- `effects` / `createEffectConfig` требуют `createDispatcherFn` (строки 12–18);
- `dependencies` — массив; каждый элемент — объект, причём Promise-ы пропускаются без
  проверки («будут провалидированы в waitForDependencies», строки 31–34), raw storage
  и `{ storage }` распознаются по наличию `waitForReady` (строки 37–44);
- `createStorageFn` / `createDispatcherFn` / `createSelectorsFn` / `createEffectConfig` /
  `setup` — функции (строки 51–65, 81–83);
- `effects` — массив функций (строки 68–78);
- `externalSelectors` — объект (строки 86–88).

По сути это дублирование того, что в новом API должен гарантировать сам TypeScript
(дискриминированные union-конфиги это уже делают на типовом уровне — `types.ts:23-91`).
В class-based API runtime-валидацию стоит сократить до того, что типами не выражается:
инстанс-чеки (`instanceof DispatcherBase`), повторная инициализация, дубли имён storage.

---

## 3. `createFeatureSynapse` (контекст из sn_client)

В библиотеке его нет. По `_fable/TASK.md` (раздел 1.2) это userland-обёртка:

```ts
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

Из использования видно, что она закрывает три дыры голого `createSynapse`:
1. **Ленивая инициализация / синглтон** — модуль не стартует на импорте, `getPostsSynapse`
   возвращает (мемоизированный) промис при первом обращении.
2. **Инъекция корневых зависимостей** — фабрика получает `{ core }` (промис core-synapse),
   не импортируя его напрямую.
3. **Асинхронный пролог** — место, где можно `await` API-клиенты, создать сокеты и т.д.
   до вызова `createSynapse` (частично дублирует `config.setup`, но удобнее, потому что
   результаты пролога доступны в замыкании при построении конфига).

**Вывод**: новый `CreateSynapse` должен абсорбировать все три функции — лениво стартующий
модуль с async-фабрикой это и есть «createFeatureSynapse, встроенный в библиотеку».

---

## 4. Оценка трёх вариантов нового API

Критерии: (а) простота реализации, (б) качество типизации/вывод типов, (в) DX,
(г) async-зависимости, (д) cross-synapse зависимости.

### Вариант A — `new CreateSynapse(async () => ({ storage, dispatcher: new PostsDispatcher(), ... }))`

- **Реализация: простая.** Это, по сути, текущий `createSynapse` + встроенный
  `createFeatureSynapse`: один класс-обёртка над async-фабрикой, внутри — тот же
  последовательный пайплайн из раздела 1.2.
- **Типизация: отличная.** Единственная точка вывода типов — объект-литерал, который
  возвращает фабрика. TS выводит все генерики (`TState`, `TDispatcher`, `TSelectors`,
  `TEffects`) одним махом из свойств объекта; ошибки несовместимости (`PostsDispatcher`
  объявлен для `PostsState`, а storage — для другого стейта) репортятся точно на свойстве
  конфига. Никакого протаскивания генериков через цепочку.
- **DX: хороший**, но `new CreateSynapse(cb)` сам по себе неудобен: инстанс класса нужно
  как-то await-ить → придётся делать его thenable (`then` на классе) или вводить
  `.ready` / `.waitForReady()`. Класс, единственная работа которого — подержать фабрику,
  это церемония ради церемонии; та же семантика достижима статической фабрикой
  (`SynapseModule.create(...)` — кстати, ближе к NestJS: `NestFactory.create(AppModule)`).
- **Async-зависимости: нативно** — фабрика асинхронная, `await getPostsEndpoints()` пишется в лоб.
- **Cross-synapse: нативно** — `const coreSynapse = await core` внутри фабрики, дальше
  `coreSynapse.selectors` / `coreSynapse.storage` доступны при построении конфига с полными типами.
- **Минус**: не решает сам по себе центральную проблему инъекции (`new PostsDispatcher()`
  создаётся до storage) — но она ортогональна форме сборщика, см. раздел 5.

### Вариант B — builder `new CreateSynapse().addStore(...).addDispatcher(...).addSelectors(...).addEffects(...)`

- **Реализация: тяжёлая.** Каждый `.addX()` должен возвращать новый тип
  `CreateSynapse<TState, TCtx, TDispatcher, TSelectors, ...>` с накопленными генериками.
  Чтобы запретить `addEffects` до `addDispatcher`, нужны phantom-состояния
  (`CreateSynapse<..., Phase extends 'empty' | 'hasStore' | 'hasDispatcher'>`) или
  conditional this-типы — это самая хрупкая зона tsc.
- **Типизация: известная боль, и она здесь во весь рост.**
  - Вывод между шагами: callback в `addDispatcher(({ coreSynapse }) => ...)` должен получить
    тип контекста из `beforeStart` и тип стейта из `addStore`. Это работает (`this`-цепочка
    переносит генерики), но **ошибки диагностируются далеко от места причины**: несовпадение
    `TState` у диспетчера и стора всплывает как нечитаемое «Type 'PostsDispatcher' is not
    assignable to parameter of type ...» на третьем звене цепочки.
  - TS не умеет частичный вывод генериков: если на каком-то шаге придётся указать один
    генерик явно — придётся указать все.
  - Иммутабельный билдер (каждый шаг — новый объект) типизируется лучше мутабельного,
    но это N промежуточных аллокаций и копирований конфига.
- **DX: спорный.** Автокомплит подсказывает шаги — плюс. Но порядок шагов — неявное знание;
  «какие шаги обязательны» не видно без чтения типов; конфиг разорван на 5 вызовов, между
  которыми нельзя свободно делить локальные переменные (всё через ctx из `beforeStart`).
- **Async-зависимости**: `beforeStart` решает, но добавляет одно лишнее звено: всё, что
  нужно нескольким шагам, обязано пройти через возвращаемый ctx-объект (vs обычное
  замыкание в варианте A/C).
- **Cross-synapse**: тоже через ctx — работает, но косвенно.

**Вердикт по B**: высокая цена в типах за внешнюю «модность». Для библиотеки, где главный
конфиг собирается один раз на модуль и целиком, билдер не окупается.

### Вариант C — функция-конфиг (текущий `createFeatureSynapse`, но с class-инстансами)

- **Реализация: минимальная** — это вариант A без класса-обёртки. Async-фабрика → конфиг →
  тот же пайплайн.
- **Типизация: как у A** (единая точка вывода).
- **DX: лучший для миграции** — структура файла `posts.synapse.ts` почти не меняется,
  меняется содержимое полей конфига (инстансы вместо `createXxxFn`).
- **Async / cross-synapse: нативно**, как у A.

### Сводная таблица

| Критерий | A (класс+фабрика) | B (builder) | C (функция-конфиг) |
|---|---|---|---|
| Простота реализации | высокая | низкая | высшая |
| Качество типизации | отличное (1 точка вывода) | хрупкое (цепочка генериков, phantom-фазы) | отличное |
| DX | хороший (минус thenable-класс) | автокомплит+, порядок шагов−, ctx-протаскивание− | лучший, знакомый |
| Async-зависимости | нативно | через `beforeStart`+ctx | нативно |
| Cross-synapse | нативно | через ctx | нативно |

**Рекомендация: семантика C, фасад в духе A.** Экспортировать функцию (рабочее имя
`defineSynapse` / `Synapse.create`), принимающую async-фабрику конфига и возвращающую
**ленивый handle** (см. раздел 7). Литеральный `new CreateSynapse(...)` не нужен — класс
остаётся внутренней реализацией handle, NestJS-ощущение дают классы Dispatcher/Selectors/Effects,
а не имя сборщика.

---

## 5. Центральная проблема: инъекция storage в пользовательские инстансы

Суть: storage создаётся и инициализируется сборщиком (createSynapse.ts:82-83), а
`new PostsDispatcher()` в конфиге варианта A/C выполняется **раньше** — в теле фабрики.
Сегодня это решено тем, что пользователь отдаёт не инстанс, а фабрику:
`createDispatcherFn: (storage: IStorage<TStore>) => TDispatcher` (`types.ts:51`).

### 5.1. Вариант (а): пользователь передаёт класс-конструктор

```ts
// конфиг
dispatcher: PostsDispatcher,   // сам класс
// сборщик
const dispatcher = new config.dispatcher(storage)
```

- **Типобезопасность**: хорошая. Тип конфиг-поля —
  `new (storage: IStorage<TState>) => TDispatcher`; `TDispatcher` выводится через
  `InstanceType`. `TState` сверяется с типом storage в той же позиции конфига.
- **DI пользовательских сервисов: главный провал.** Конструктор обязан иметь ровно
  сигнатуру `(storage)` — а `PostsEffects` нужны `api`, `socket`; диспетчеру могут
  понадобиться свои зависимости. Любое отклонение → либо фабрика-замыкание
  `dispatcher: (storage) => new PostsDispatcher(storage, extra)` (и мы вернулись к
  `createDispatcherFn`, только с `new`), либо параллельный механизм передачи сервисов
  (мини-DI-контейнер) — а в ТЗ явно сказано: тяжёлый DI не нужен.
- Также конструктор-инъекция ломает «class fields»-стиль D-1 из ТЗ: поля-экшены
  объявляются инициализаторами, которым `storage` нужен **до** тела конструктора —
  то есть до того, как параметр конструктора вообще доступен полям (с
  `useDefineForClassFields` инициализаторы полей исполняются раньше присваивания
  parameter properties).

### 5.2. Вариант (б): двухфазная инициализация — поля-«рецепты», затем `instance.init(storage)`

Ключевое наблюдение: **эта машинерия в библиотеке уже есть и работает**. Standalone-рецепты:

```ts
// reactive/dispatcher/standalone.ts:18-25
export interface ActionRecipe<TState, TParams, TResult> {
  readonly _type: 'action-recipe'
  readonly _config: { action: (storage: IStorage<TState>, params: TParams) => ... }
}
```

— не привязаны к storage, а `createDispatcher` материализует их в момент, когда storage
известен, и присваивает actionType из **имени ключа** (deferred type assignment):

```ts
// reactive/dispatcher/dispatcher.module.ts:606-621
for (const [key, fn] of Object.entries(actions)) {
  if ((fn as any)._type === 'action-recipe') {
    const dispatchFn = dispatcher.createAction(boundConfig, recipe._executionOptions)
    ;(dispatchFn as any)._assignType(key)     // ← имя ключа становится '[storageName]key'
    dispatcher.dispatch[key] = dispatchFn
  }
  ...
}
```

Двухфазный class-стиль — это перенос той же схемы с «ключей объекта» на «поля класса»:

```ts
class PostsDispatcher extends DispatcherBase<PostsState> {
  readonly postsRequest = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)
  readonly applyPosts = this.action((store, page: PostsFeedResponseDto) => { ... })
  readonly loadPosts = this.postsRequest.init
}
// сборщик: dispatcher.__init(storage)
//   → Object.entries(this): каждое поле-рецепт материализуется через внутренний Dispatcher,
//     actionType = имя поля (точно как dispatcher.module.ts:615-619)
```

- **Типобезопасность**: `this.action<P, R>(...)` **декларирует** возвращаемый тип как
  готовый `DispatchFunction<P, R>` (он совпадает с тем, что будет после материализации),
  фактически возвращая callable-заглушку с брендом рецепта. До `__init` вызов заглушки
  бросает понятную ошибку («dispatcher не инициализирован — передайте его в defineSynapse»).
  Это ровно тот же приём, что текущий deferred `_assignType` + ранний `throw` в
  `dispatchFn` при пустом `actionType` (dispatcher.module.ts:356-359). Типы полей честные,
  «ложь» ограничена окном между конструированием и `__init`, которое контролирует сборщик.
- **DI пользовательских сервисов: свободный.** Базовому классу аргументы конструктора не
  нужны → пользовательский конструктор не ограничен: `constructor(private api, private socket)`
  — сервисы доступны в замыканиях рецептов через `this`.
- **Минусы**: (1) поля-алиасы (`loadPosts = this.postsRequest.init`) — материализатор должен
  понимать, что один рецепт может быть упомянут одним полем, и детектировать дубли;
  (2) `readonly` поля перезаписываются при материализации — runtime это позволяет
  (readonly — только compile-time), либо заглушка-делегат заполняет внутренний слот без
  перезаписи поля; (3) нужен runtime-гард от использования до `__init`.

### 5.3. Вариант (в): lazy-прокси

`this.storage` — `Proxy<IStorage<TState>>`, который до инъекции буферизует/бросает,
после — делегирует в реальный storage.

- **Типобезопасность**: формально идеальная (прокси типизирован как `IStorage<TState>`).
- **Runtime-семантика: худшая из трёх.** Синхронные методы (`getStateSync`,
  `storage.name` — а он нужен при создании actionType, dispatcher.module.ts:343) нельзя
  «отложить» — только бросать; identity-проверки и подписки через прокси ведут себя
  неочевидно; отладка (`console.log(storage)`) превращается в загадку. Прокси маскирует
  проблему порядка инициализации вместо того, чтобы сделать её явной фазой.
- Допустимое узкое применение: ленивый **аксессор** `protected get storage()` в базовом
  классе, который бросает до `__init` — но это просто гард, не настоящий прокси.

### 5.4. Вывод

**Основной механизм — (б), двухфазная инициализация через рецепты**: она уже наполовину
реализована (`standalone.ts` + материализация в `createDispatcher`), не ограничивает
пользовательские конструкторы (DI сервисов остаётся обычным `constructor(private api...)`),
и даёт самый чистый class-fields-стиль. Вариант (а) оставить как опциональный шорткат для
классов без собственных зависимостей (сборщик принимает и конструктор, и инстанс — отличимы
через `typeof === 'function'` / `instanceof DispatcherBase`). Вариант (в) — отклонить.

---

## 6. Как `PostsEffects` получает `(action$, state$, context)`

Сегодня контекст рождается внутри `EffectsModule.subscribeToEffect` **в момент подписки**
(после `start()`):

```ts
// reactive/effects/effects.module.ts:484-494
private subscribeToEffect(effect: Effect<...>): void {
  const context: EffectContext<...> = {
    dispatcher: this.dispatcher,
    externalDispatchers: this.externalDispatchers,
    externalStates: this.externalStates,
    services: this.services,
    config: this.config,
  }
  const output$ = effect(this.action$.asObservable(), this.state$, context).pipe(...)
```

`action$` — приватный `Subject`, в который `EffectsModule` ретранслирует экшены основного
и внешних диспетчеров (`subscribeToDispatchers`, effects.module.ts:410-424); `state$` —
shared-Observable поверх `storage.subscribeToAll` (effects.module.ts:382-393). То есть
эффект — это всегда «поздно вызываемая» функция: контекст физически не может существовать
в конструкторе `PostsEffects`.

### Состыковка с class-инстансом

Решение — **класс эффектов хранит не Observable-ы, а функции-эффекты**; поля через
`this.effect(fn)` лишь регистрируют типизированную функцию во внутреннем реестре:

```ts
abstract class EffectsBase<TState, TDispatcher, TExternalStates extends ExternalStates = {}, TExternalDispatchers = {}> {
  /** @internal */ readonly __effects: Effect<TState, TDispatcher, ...>[] = []

  protected effect(fn: Effect<TState, TDispatcher, Record<string, never>, Record<string, never>, TExternalDispatchers, TExternalStates>) {
    this.__effects.push(fn)
    return fn
  }
}

class PostsEffects extends EffectsBase<PostsState, PostsDispatcher, { core$: Observable<CoreState> }> {
  constructor(private readonly api: PostsEndpoints, private readonly socket: PostsSocketService) { super() }

  readonly loadPosts = this.effect((action$, state$, { dispatcher }) =>
    action$.pipe(
      ofType(dispatcher.loadPosts),
      validateMap({ apiCall: ([a]) => fromRequest(this.api.getPosts.request(a.payload)).pipe(...) }),
    ))

  readonly connection = this.effect((_a$, _s$, { externalStates: { core$ } }) =>
    core$.pipe(tap((c) => c.profile ? this.socket.connect(...) : this.socket.disconnect())))
}
```

Почему это работает без фокусов:
- инициализатор поля выполняется в конструкторе, `this.effect` лишь **сохраняет лямбду** —
  ни action$, ни storage в этот момент не нужны;
- сервисы (`this.api`, `this.socket`) захватываются замыканием лямбды — обычный JS;
  параметр `services` у `EffectsModule` для class-пути становится не нужен;
- сборщик после создания `EffectsModule` делает
  `effectsInstance.__effects.forEach((e) => effectsModule.add(e))` и `await effectsModule.start()`
  — ровно как сейчас с массивом `config.effects` (createSynapse.ts:143-150);
- типизация контекста выводится из генериков класса (`TDispatcher`, `TExternalStates`),
  и `ofType(dispatcher.loadPosts)` работает, потому что в class-стиле поля диспетчера —
  это и есть `DispatchFunction` (раздел 5.2).

Важная деталь: `EffectsModule` требует `dispatcher: TDispatcher & { actions: Observable<Action> }`
(effects.module.ts:372) — значит, `DispatcherBase` обязан экспонировать `actions`
(внутренний `Dispatcher` уже имеет его: dispatcher.module.ts:166).

Подвопрос из ТЗ про `this.effect(...)` «до super()»: проблемы нет — инициализаторы полей
исполняются **после** `super()` (а `super()` в наследнике обязан быть до обращений к `this`),
поэтому `this.effect` базового класса к моменту инициализации полей уже существует.

Альтернатива «каждый публичный метод — эффект» (вариант E-2 из ТЗ) — отклонить: нет
типового способа отличить эффект от хелпера, дискавери по прототипу хрупок, а контекст
в конструкторе (`dispatcher`, `state$` как ctor-аргументы) требует, чтобы инстанс эффектов
создавался сборщиком → возвращаемся к проблеме DI сервисов из 5.1.

---

## 7. Предложение архитектуры нового `CreateSynapse`

### 7.1. Форма API

```ts
// ── Конфиг (единая точка вывода типов) ──────────────────────────────────────
export interface SynapseModuleConfig<
  TState extends Record<string, any>,
  TDispatcher extends DispatcherBase<TState> | undefined,
  TSelectors,
  TEffects extends EffectsBase<TState, NonNullable<TDispatcher>, any, any> | undefined,
> {
  storage: IStorage<TState> | (() => Promise<IStorage<TState>>)
  dependencies?: DependencyInput[]          // как сейчас (types.ts:18), формат не меняем
  dependencyTimeout?: number

  dispatcher?: TDispatcher                                          // инстанс (двухфазный)
            | (new (storage: IStorage<TState>) => TDispatcher)      // или конструктор-шорткат
  selectors?: TSelectors extends SelectorsBase<TState> ? TSelectors // инстанс (двухфазный)
            : (sm: ISelectorModule<TState>) => TSelectors           // или фабрика (бывший createSelectorsFn)
  effects?: TEffects
  externalStates?: ExternalStates                                   // для контекста эффектов
  externalDispatchers?: Record<string, DispatcherBase<any> | Dispatcher<any>>
}

// ── Сборщик ────────────────────────────────────────────────────────────────
export function defineSynapse<TState, TDispatcher, TSelectors, TEffects>(
  factory: () => SynapseModuleConfig<TState, TDispatcher, TSelectors, TEffects>
         | Promise<SynapseModuleConfig<TState, TDispatcher, TSelectors, TEffects>>,
): SynapseModule<TState, TDispatcher, TSelectors>

// ── Handle (ленивый, заменяет createFeatureSynapse + createSynapseAwaiter) ──
export interface SynapseModule<TState, TDispatcher, TSelectors> extends PromiseLike<Synapse<TState, TDispatcher, TSelectors>> {
  ready(): Promise<Synapse<TState, TDispatcher, TSelectors>>  // запускает фабрику при первом вызове (lazy singleton)
  isReady(): boolean
  destroy(): Promise<void>
}

// ── Результат ──────────────────────────────────────────────────────────────
export interface Synapse<TState, TDispatcher, TSelectors> {
  storage: IStorage<TState>
  state$: Observable<TState>     // ВСЕГДА, не только с эффектами
  dispatcher: TDispatcher        // полный тип класса, а не any
  actions: TDispatcher           // алиас: в class-стиле поля инстанса И ЕСТЬ dispatch-функции
  selectors: TSelectors
  destroy(): Promise<void>
}
```

Пример сборки posts-модуля:

```ts
export const postsSynapse = defineSynapse(async () => {
  const api = await getPostsEndpoints()
  const core = await coreSynapse            // SynapseModule другого модуля — thenable
  return {
    dependencies: [core],
    storage: new MemoryStorage<PostsState>({ name: 'posts', initialState }),
    dispatcher: new PostsDispatcher(),
    selectors: new PostsSelectors(core.selectors),
    effects: new PostsEffects(api, new PostsSocketService()),
    externalStates: { core$: core.storage },
  }
})
```

### 7.2. Порядок инициализации (внутри `ready()`)

```
0. lazy-гард: фабрика и пайплайн исполняются один раз (мемоизированный промис)
1. config = await factory()                  ← async-пролог, await чужих synapse
2. validate (минимальный: инстанс-чеки, дубли)
3. await waitForDependencies(config.dependencies, ...)   ← без изменений
4. storage = typeof config.storage === 'function' ? await config.storage() : config.storage
   await storage.initialize()
5. dispatcher: если конструктор → new Ctor(storage); если инстанс → dispatcher.__init(storage)
   (материализация рецептов полей, actionType = имя поля; см. раздел 5.2)
6. selectorModule = new SelectorModule(storage)
   selectors: инстанс SelectorsBase → selectors.__init(selectorModule); фабрика → factory(selectorModule)
7. state$ = создать ВСЕГДА (механика из effects.module.ts:382-393, вынести в утилиту)
8. если effects: effectsModule = new EffectsModule(storage, dispatcher, externalDispatchers, {}, {}, externalStates)
   effectsInstance.__effects.forEach((e) => effectsModule.add(e)); await effectsModule.start()
9. зарегистрировать cleanup в ОБРАТНОМ порядке (LIFO): stop effects → destroy dispatcher →
   destroy selectorModule → destroy storage      ← фикс бага из 1.4(1)
10. ошибки ЛЮБОГО шага → rejection ready() (никаких swallow; фикс 1.4(2))
```

### 7.3. Вывод типов для React

`SelectorAPI<T>` не меняется → `useSelector(posts.selectors.list)` работает как есть
(`react/hooks/useSelector.ts:17-20` завязан только на `SelectorAPI`). Поскольку
`dispatcher` в результате теперь типизирован полным классом, хуки уровня модуля
выводятся напрямую:

```ts
const posts = await postsSynapse            // Synapse<PostsState, PostsDispatcher, PostsSelectors>
posts.dispatcher.loadPosts({ limit: 20 })   // DispatchFunction<PostsFindAllParams, ...> — поле класса
useSelector(posts.selectors.isPostsLoading) // boolean
```

`ExtractDispatchType` (types.ts:9) для нового пути не нужен: исчезает прослойка
`dispatcher.dispatch.*` → `actions` — это сам инстанс.

### 7.4. Backward compatibility

1. **Старый `createSynapse` не трогаем** — экспорт из `utils/index.ts:2` остаётся;
   `defineSynapse` живёт рядом (`utils/defineSynapse/`). Оба используют одни и те же
   движки: `SelectorModule`, `Dispatcher`, `EffectsModule`, `waitForDependencies`.
2. **Dependencies совместимы в обе стороны**: контракт `waitForDependencies` — это
   `.storage.waitForReady()` либо thenable (`waitForDependencies.ts:13-17`,
   `validate.ts:31-34`). Новый `Synapse` структурно содержит `storage`, а `SynapseModule`
   — thenable → старый конфиг может указать новый модуль в `dependencies`, и наоборот,
   `Promise<AnySynapseStore>` старого `createSynapse` валиден в `dependencies` нового.
3. **`createSynapseAwaiter`** (utils/createSynapseAwaiter.ts) для нового пути не нужен —
   его роль играет handle (`ready/isReady/PromiseLike`); для старого остаётся как есть.
4. **Постепенная миграция внутри конфига**: `defineSynapse` принимает для `selectors`
   и фабрику с сигнатурой старого `createSelectorsFn`, а для `dispatcher` — двухфазный
   инстанс или конструктор; старые plain-эффекты (массив функций `Effect`) можно разрешить
   как `effects: Effect[]` наряду с `EffectsBase`-инстансом — `EffectsModule.add` им
   достаточно (effects.module.ts:426-434).
5. **Старые операторы не меняются**: `ofType`, `validateMap`, `apiResult`, `selectorObject`
   принимают `DispatchFunction`/Observable — class-поля диспетчера это те же
   `DispatchFunction`, поэтому код эффектов переносится почти дословно
   (`dispatcher.dispatch.loadPosts` → `dispatcher.loadPosts`).

### 7.5. Что отвергнуто и почему (резюме)

- **Builder (вариант B)** — цена в типах (протаскивание генериков, phantom-фазы, дальние
  ошибки) не окупается для конфига, собираемого один раз целиком.
- **Конструктор-инъекция как единственный механизм (5.1а)** — блокирует DI пользовательских
  сервисов и class-fields-стиль; оставлена как шорткат.
- **Lazy-прокси (5.1в)** — маскирует фазы инициализации, ломается на синхронных вызовах
  (`storage.name` нужен для actionType — dispatcher.module.ts:343).
- **«Каждый метод — эффект» (E-2)** — нет типового различения эффектов и хелперов,
  контекст в конструкторе возвращает проблему DI.

### 7.6. Открытые вопросы

1. Материализация селекторов-рецептов с зависимостями (`this.combine([this.api], fn)`)
   требует резолва рецепт→SelectorAPI с мемоизацией — реализуемо, но это самая сложная
   часть двухфазной схемы; возможно, для селекторов на первом этапе оставить
   конструктор/фабрику (S-2 из ТЗ), а field-стиль добавить второй итерацией.
2. Поля-алиасы рецептов (`loadPosts = this.postsRequest.init`): нужен детект «один рецепт —
   несколько полей» (warning или поддержка алиасов с одним actionType?).
3. Нужен ли отдельный `config.setup` при наличии async-фабрики — судя по живому примеру,
   нет: всё делается в прологе фабрики; предлагаю в новом API его не заводить.
4. HMR/повторный `ready()` после `destroy()` — должен ли handle уметь пересоздаваться
   (сейчас `createSynapse` одноразовый)?
