# Research 03: Модуль эффектов (EffectsModule) и переход на class-based API

> Примечание: доступ к `/Users/vlad/web_dev/sn_client/src/modules/posts/synapse/posts.effects.ts` был запрещён правами доступа в сессии субагента. В качестве живого примера использован эталонный пример из самого репозитория: `packages/examples/src/examples/pokemon-advanced/pokemon.effects.ts` — те же паттерны (деструктуризация контекста, `validateMap`, `externalStates`, `combineEffects`). Реальные паттерны из sn_client см. research/05-usage-patterns.md.

Изученные файлы:
- `packages/synapse/src/reactive/effects/effects.module.ts` (565 строк — типы, операторы, `EffectsModule`)
- `packages/synapse/src/reactive/effects/utils/` (`toObservable.ts`, `fromRequest.ts`, `chunkRequest*.ts`)
- `packages/synapse/src/reactive/dispatcher/dispatcher.module.ts` (класс `Dispatcher`, `DispatchFunction`, `actionType`)
- `packages/synapse/src/utils/createSynapse/createSynapse.ts`, `types.ts` (интеграция эффектов в `createSynapse`)
- `packages/examples/src/examples/pokemon-advanced/pokemon.effects.ts` (живой пример)

---

## 1. Жизненный цикл EffectsModule

### 1.1 Структура класса

`effects.module.ts:342-354`:

```typescript
export class EffectsModule<
  TState extends Record<string, any> = any,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> {
  private effects: Effect<...>[] = []
  private subscriptions: Array<{ unsubscribe: VoidFunction }> = []
  private running = false
  private action$ = new Subject<Action>()
  private externalStates: TExternalStates

  public readonly state$: Observable<TState>
```

Ключевая идея: модуль владеет **единым** `action$: Subject<Action>`, в который мультиплексируются экшены и от основного диспетчера, и от всех внешних. Эффект — хранимая функция-рецепт, вызываемая лениво при подписке.

### 1.2 Конструктор: state$ и нормализация externalStates

Конструктор (`effects.module.ts:370-394`) принимает шесть аргументов: `storage`, `dispatcher` (с требованием `& { actions: Observable<Action> }`), `externalDispatchers`, `services`, `config`, `externalStates`.

`state$` создаётся прямо в конструкторе как cold Observable поверх storage, прогретый `share()`:

```typescript
// effects.module.ts:382-393
this.state$ = new Observable<TState>((observer) => {
  Promise.resolve(this.storage.getState()).then((state: TState) => observer.next(state))
  const unsubscribe = this.storage.subscribeToAll(() => {
    Promise.resolve(this.storage.getState()).then((state: TState) => observer.next(state))
  })
  return () => unsubscribe()
}).pipe(share())
```

`externalStates` нормализуются: если значение — хранилище (`isStorage`, проверка `subscribeToAll`/`getState`, `utils/toObservable.ts:36-38`), оно конвертируется через `toObservable()` (с `shareReplay(1)`); Observable пропускается как есть (`effects.module.ts:399-405`).

### 1.3 Регистрация: add() / addEffects()

```typescript
// effects.module.ts:426-434
add(effect: Effect<...>): this {
  this.effects.push(effect)
  if (this.running) {
    this.subscribeToEffect(effect)   // горячее добавление: если модуль уже запущен — подписка сразу
  }
  return this
}
```

`addEffects(effects[])` (`:441-444`) — цикл по `add()`. Возврат `this` — fluent API.

### 1.4 start()

```typescript
// effects.module.ts:450-464
async start(): Promise<this> {
  if (this.running) return this
  await this.storage.waitForReady()        // ждём готовности хранилища
  this.subscribeToDispatchers()            // подписка на main + external dispatchers
  this.effects.forEach((effect) => this.subscribeToEffect(effect))
  this.running = true
  return this
}
```

`subscribeToDispatchers()` (`:410-424`) сливает все источники экшенов в один Subject:

```typescript
// effects.module.ts:412-423
const mainSub = this.dispatcher.actions.subscribe((action) => {
  this.action$.next(action)
})
this.subscriptions.push(mainSub)

for (const [_, dispatcher] of Object.entries(this.externalDispatchers)) {
  const subscription = dispatcher.actions.subscribe((action) => {
    this.action$.next(action)
  })
  this.subscriptions.push(subscription)
}
```

### 1.5 subscribeToEffect(): вызов рецепта и обработка результата

```typescript
// effects.module.ts:484-519
private subscribeToEffect(effect: Effect<...>): void {
  try {
    const context: EffectContext<...> = {
      dispatcher: this.dispatcher,
      externalDispatchers: this.externalDispatchers,
      externalStates: this.externalStates,
      services: this.services,
      config: this.config,
    }

    const output$ = effect(this.action$.asObservable(), this.state$, context).pipe(
      catchError((err) => {
        handleCallbackError('EffectsModule: error in effect', err)
        return of(null)
      }),
    )

    const subscription = output$.subscribe((result) => {
      if (result === null || result === undefined) return
      if (typeof result === 'function') {
        try { result() } catch (callError) { handleCallbackError(...) }
      }
    })

    this.subscriptions.push(subscription)
  } catch (setupError) {
    handleCallbackError('EffectsModule: error setting up effect', setupError)
  }
}
```

Три важных факта:

1. **Эффект вызывается ровно один раз** — в момент подписки (внутри `start()` или горячего `add()`). Именно тогда ему передаются `action$`, `state$` и `context`. Это ключ к решению проблемы class-полей (см. §4): тип `Effect` уже является отложенным «рецептом».
2. **Если Observable эффекта эмитит функцию — она вызывается** (`:506-512`). Это позволяет писать эффекты в стиле `map(() => () => dispatcher.dispatch.reset())` — лениво диспатчить из потока.
3. **Поток НЕ перезапускается при ошибке.** `catchError((err) => ... of(null))` — терминальная замена: источник отписывается, `of(null)` эмитит `null` (игнорируется) и **завершается**. После первой непойманной ошибки эффект мёртв до следующего цикла `stop()/start()`. Ошибка лишь логируется. Никакого `retry`/resubscribe (в отличие от NgRx, где effect по умолчанию ресабскрайбится). Поэтому в живых эффектах ошибки ловятся **внутри** inner-потоков: `validateMap.errorAction` ловит через `catchError` и возвращает `EMPTY` (`effects.module.ts:238-243`), а `apiResult` бросает `ApiError`, перехватываемый тем же `errorAction` (`:329-334`). Синхронные ошибки построения цепочки ловятся внешним `try/catch` (`:516-518`).

### 1.6 stop()

```typescript
// effects.module.ts:470-478
stop(): this {
  this.subscriptions.forEach((sub) => sub.unsubscribe())
  this.subscriptions = []
  this.action$.complete()
  this.action$ = new Subject<Action>()   // !!! Subject пересоздаётся
  this.running = false
  return this
}
```

Отписывается всё разом (подписки на диспетчеры и на эффекты лежат в одном массиве `subscriptions`). `action$` завершается и **пересоздаётся** — поэтому повторный `start()` работает корректно: `subscribeToEffect` читает `this.action$` в момент вызова, эффекты получают новый Subject. Это важный аргумент против конструкторной инъекции `action$` в class-стиле (§4в): захваченная по ссылке версия Subject протухла бы после `stop()`.

### 1.7 Интеграция в createSynapse

`packages/synapse/src/utils/createSynapse/createSynapse.ts:136-158` — порядок инициализации:

1. `validateSynapseConfig` → `waitForDependencies` → `setup()` → `storage.initialize()` (`:62-83`)
2. селекторы (`:105-119`)
3. диспетчер: `dispatcher = config.createDispatcherFn(storageInstance)` (`:122-134`)
4. эффекты — **только если есть dispatcher**:

```typescript
// createSynapse.ts:137-155
if (config.createEffectConfig && dispatcher) {
  const { services, config: effectConfig, externalDispatchers, externalStates } = config.createEffectConfig()
  effectsModule = new EffectsModule(storageInstance, dispatcher as any, externalDispatchers || {}, services, effectConfig, externalStates || {})
  if (Array.isArray(config.effects)) {
    config.effects.forEach((effect) => { if (effectsModule) effectsModule.add(effect) })
  }
  await effectsModule.start()
  result.state$ = effectsModule.state$
  cleanupCallbacks.push(() => { if (effectsModule) effectsModule.stop() })
}
```

К моменту создания `EffectsModule` dispatcher гарантированно существует. `state$` синапса — это `effectsModule.state$`. `synapse.destroy()` вызывает `effectsModule.stop()`.

---

## 2. Контекст эффекта: структура и типизация

### 2.1 EffectContext

```typescript
// effects.module.ts:25-42
export interface EffectContext<
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> {
  dispatcher: TDispatcher                    // основной dispatcher текущего synapse
  externalDispatchers: TExternalDispatchers  // dispatcher'ы других synapse
  externalStates: TExternalStates            // Observable'ы состояний других хранилищ
  services: TServices                        // API-клиенты и т.д.
  config: TConfig                            // глобальная конфигурация эффектов
}
```

где `ExternalStates = Record<string, Observable<any> | IStorageBase<any>>` (`:20`) — на входе допускаются и хранилища, но к моменту попадания в контекст они уже нормализованы в Observable.

### 2.2 Тип Effect

```typescript
// effects.module.ts:47-54
export type Effect<
  TState extends Record<string, any> = any,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
> = (
  action$: Observable<Action>,
  state$: Observable<TState>,
  context: EffectContext<TDispatcher, TServices, TConfig, TExternalDispatchers, TExternalStates>,
) => Observable<unknown>
```

Шесть дженериков — главная эргономическая боль текущего API. В живом коде её обходят локальным type-алиасом:

```typescript
// packages/examples/.../pokemon.effects.ts:11-15
type Services = { pokemonApi: PokemonApiEndpoints }
type ExtStates = { settings: Observable<PokemonSettings> }
type PokemonEffect = Effect<PokemonState, PokemonDispatcher, Services, Record<string, never>, Record<string, never>, ExtStates>
```

и затем каждая константа аннотируется алиасом, а контекст деструктурируется в сигнатуре:

```typescript
// pokemon.effects.ts:21-23
const loadListEffect: PokemonEffect = (action$, state$, { dispatcher, services: { pokemonApi: { getList } }, externalStates: { settings } }) =>
  action$.pipe(
    ofType(dispatcher.dispatch.loadList),
    ...
```

### 2.3 Как работает ofType: actionType на функции-экшене

`ofType` (`effects.module.ts:80-97`) фильтрует не по строке, а по функции-экшену, читая её свойство `actionType`:

```typescript
export function ofType<T extends DispatchFunction<any, any> | WatcherFunction<any>>(actionFn: T): OperatorFunction<Action, TypedAction<...>> {
  const { actionType } = actionFn
  ...
  return (source$) => source$.pipe(filter((action): action is TypedAction<PayloadType> =>
    action !== undefined && action.type === actionType))
}
```

`actionType` навешивается диспетчером на каждую dispatch-функцию и **неймспейсится именем хранилища**: ``actionType = `[${this.storage.name}]${name}` `` (`dispatcher.module.ts:343, 409`). Благодаря этому экшены разных модулей, слитые в один `action$`, не конфликтуют, а `ofType(externalDispatcher.dispatch.logout)` корректно ловит чужие экшены (§7).

Сопутствующие операторы: `ofTypes` (union payload, `:103-119`), `ofTypesWaitAll` (combineLatest + take(1), `:132-167`), `selectorMap`/`selectorObject` (`:175-205`), `validateMap` (`:210-269`), `apiResult` (`:318-336`), плюс `fromRequest` (`utils/fromRequest.ts:41-67` — Observable с `req.abort()` при отписке) и `createEffect`/`combineEffects` (`:525-564` — identity-хелпер для типов и merge нескольких эффектов в один).

---

## 3. Что нужно для class-стиля

Целевой вид:

```typescript
class PostsEffects extends Effects<PostsState, PostsDispatcher> {
  constructor(private api: PostsEndpoints, private socket: PostsSocketService) { super() }

  readonly loadPosts = this.effect((action$, state$, { dispatcher }) =>
    action$.pipe(ofType(dispatcher.dispatch.loadPosts), ...))
}
```

Требования, вытекающие из устройства EffectsModule:

1. **Базовый класс `Effects` с реестром.** `this.effect(fn)` должен: (а) зафиксировать `fn` в приватном реестре экземпляра, (б) вернуть её (читаемость/тестируемость поля), (в) типизировать параметры `fn` из дженериков класса — чтобы пользователь больше не писал 6-арный `Effect<...>` вручную. Это главный выигрыш class-стиля: дженерики указываются один раз в `extends`.
2. **Способ выгрузки эффектов из экземпляра** — метод `getEffects(): Effect[]`, который `createSynapse` скормит в `effectsModule.addEffects(...)`. EffectsModule менять не нужно вообще: рецепты из класса — те же функции типа `Effect`.
3. **`services` уходят из контекста в поля класса.** Если API-клиент и сокет инжектятся конструктором, измерение `TServices` контекста для class-стиля не нужно — контекст сужается до `{ dispatcher, externalDispatchers, externalStates, config }`. Минус ещё один дженерик.
4. **Изменение `createSynapse`**: принимать в `effects` не только массив функций, но и экземпляр(ы) `Effects` с веткой `instanceof Effects → addEffects(instance.getEffects())`.

---

## 4. Ключевая проблема: this.effect() при инициализации class-поля

Формулировка: инициализаторы полей выполняются в момент `new PostsEffects(...)`, а `action$`/`state$`/`dispatcher` появляются позже — при `effectsModule.start()`.

**Главное наблюдение: для текущей архитектуры это псевдопроблема.** Тип `Effect` — уже отложенный рецепт `(action$, state$, context) => Observable`. `subscribeToEffect` вызывает его лениво (`effects.module.ts:494`). Значит `this.effect(fn)` в момент инициализации поля не обязан ничего знать про потоки — достаточно записать `fn` в реестр. Реальная проблема возникла бы только в дизайне (в), где поле — готовый `Observable`, построенный из заранее инжектированных потоков (как в NgRx).

### (а) this.effect помечает/регистрирует рецепт, вызов — при start() — рекомендуется

```typescript
protected effect(fn: BoundEffect): BoundEffect {
  this._registry.push(fn)
  return fn
}
```

Плюсы:
- Нулевые изменения в `EffectsModule` — рецепты совместимы с `Effect` как есть; `combineEffects`, горячий `add()`, `stop()/start()` (с пересозданием `action$`) продолжают работать.
- Каждый `start()` строит цепочки заново — чистый рестарт.
- Тип параметров `fn` выводится из дженериков базового класса — конец 6-арным аннотациям.
- Поле имеет значение (функцию) — можно дёргать в юнит-тестах напрямую: `new PostsEffects(mockApi).loadPosts(action$, state$, ctx)`.

Минусы:
- Двойная роль `this.effect` (маркировка + сайд-эффект записи в реестр) — поле, случайно не обёрнутое в `this.effect`, молча не подключится. Лечится Symbol-маркером + dev-проверкой (§5).
- Порядок регистрации = порядок инициализации полей; редко важно, но детерминированно.

### (б) Методы класса вместо полей; EffectsModule вызывает их с контекстом

Плюсы: нет вопроса о времени инициализации вовсе (методы на прототипе); меньше «магии».

Минусы:
- Нужно перечисление методов и фильтрация служебных (§5) — отдельная проблема.
- Параметры приходится аннотировать в каждом методе (метод не получает контекстный тип «снаружи», как колбэк `this.effect`) — теряется главный типовой выигрыш.
- `this`-binding: вызывать строго как `instance[name](...)` либо биндить; вырванная ссылка на метод теряет `this.api`.

### (в) Конструкторная инъекция dispatcher/state$/action$ (стиль NgRx)

```typescript
class PostsEffects {
  constructor(private actions$: Observable<Action>, private state$: Observable<PostsState>,
              private dispatcher: PostsDispatcher, private api: PostsEndpoints) {}
  readonly loadPosts = this.actions$.pipe(ofType(this.dispatcher.dispatch.loadPosts), ...)
}
```

Что это требует от порядка инициализации в `createSynapse`:
- dispatcher уже создаётся до эффектов (`createSynapse.ts:122` → `:137`) — ок;
- но `action$` живёт **внутри** EffectsModule и пересоздаётся в `stop()` (`effects.module.ts:474`) — пришлось бы выносить merged-`action$` в долгоживущий внешний объект (по образцу NgRx `Actions`) либо отказываться от пересоздания Subject;
- `state$` тоже создаётся в конструкторе EffectsModule (`:382`) — модуль (или фабрика потоков) должен существовать **до** `new PostsEffects(...)`, а пользовательский класс инстанцируется не пользователем, а синапсом (нужна фабрика/DI: `effects: (deps) => new PostsEffects(deps, api)`) — ломается эргономика «просто new + сервисы в конструкторе»;
- поля-Observable строятся один раз — рестарт после `stop()` требует пересоздания экземпляра.

Плюсы: знакомо NgRx-пользователям; поля — настоящие Observable. Минусы перевешивают: инверсия владения экземпляром, протухание `action$`, переписывание lifecycle EffectsModule.

### (г) Другие варианты

- **Ленивые прокси-потоки**: базовый класс заранее создаёт `protected action$ = new Subject()` и `state$`-прокси, EffectsModule при `start()` подключает реальные источники. Даёт NgRx-синтаксис без DI, но добавляет скрытый ретранслирующий слой, вопросы replay/timing, усложняет отладку.
- **Декораторы** `@CreateEffect()` над методами — требуют `experimentalDecorators` либо TC39-декораторов (доп. требование к сборке потребителя; для библиотеки нежелательно как единственный путь).
- **Гибрид (а)+(б)**: `this.effect` как основной путь + поддержка legacy-функций в том же `effects` у `createSynapse`. Это фактически рекомендация.

**Вывод: (а).** Сохраняет семантику «эффект = отложенный рецепт», не трогает EffectsModule, даёт всю типизацию из дженериков класса.

---

## 5. Альтернатива без this.effect: plain-класс, каждый метод — эффект

Технические нюансы перечисления:
- `Object.getOwnPropertyNames(PostsEffects.prototype)` вернёт **методы** (плюс `constructor`, который надо исключить), но **не** поля-стрелки — те являются own-свойствами экземпляра и видны через `Object.getOwnPropertyNames(instance)` вперемешку с `api`, `socket` и прочими данными. Рефлексия по прототипу навязывает стиль «только методы», по экземпляру — требует фильтрации не-функций. При наследовании (`BaseEffects → PostsEffects`) нужен обход цепочки прототипов.

Как отличить эффект от вспомогательного метода:

| Подход | Плюсы | Минусы |
|---|---|---|
| Соглашение имён (`loadPostsEffect`, префикс `on*`) | Ничего не нужно, видно в коде | Не проверяется типами, ломается при опечатке, конфликтует с публичными хелперами |
| Symbol-маркер (`fn[EFFECT_MARKER] = true`) | Надёжно, не конфликтует, работает и для полей, и для методов | Нужен хелпер, который его ставит — а это и есть `this.effect`/`markEffect`, т.е. возврат к варианту (а) |
| Декоратор `@Effect()` | Декларативно, видно в сигнатуре | Требование к tsconfig потребителя; два несовместимых стандарта декораторов |
| Явный список (`static effects = ['loadPosts']` или `readonly effects = [this.loadPosts]`) | Максимально явно, нулевая магия | Дублирование; забыл добавить — молчаливый баг (эффект не работает) |

Вывод: чистая рефлексия без маркера слишком хрупка (любой публичный хелпер станет «эффектом» и упадёт при вызове с тремя неожиданными аргументами). Самый честный маркер — сама обёртка `this.effect`, которая заодно решает типизацию. Plain-класс с рефлексией проигрывает варианту 4(а); если очень хочется методов — лучше явный список, чем конвенция имён.

---

## 6. Сервисы в конструкторе и замыкания: подводные камни

Базовый паттерн безопасен: `readonly loadPosts = this.effect((action$, ...) => ... this.api ...)` — стрелка захватывает `this`, а `this.api` **дереференсится только при вызове эффекта** (в `start()`), когда конструктор давно отработал.

Подводные камни:

1. **Порядок инициализации полей и parameter properties.** В ES2022-семантике поля производного класса инициализируются в момент возврата из `super()`, **до** выполнения тела конструктора, где TS присваивает parameter properties (`this.api = api`). Дереференс сервиса прямо в инициализаторе поля — бомба:
   ```typescript
   readonly loadPosts = this.effect(...)            // ok: this.api только в замыкании
   private readonly getList = this.api.getList      // ОПАСНО: this.api ещё undefined в derived-классе
   ```
   Правило для доков: в инициализаторах полей сервисы можно только захватывать в замыкания, не читать.
2. **Потеря `this` при передаче метода по ссылке.** Если эффекты — методы (вариант (б)), `module.add(instance.loadPosts)` оторвёт `this`. Поля-стрелки + `this.effect` устраняют проблему целиком.
3. **Время жизни и teardown сервисов.** Экземпляр держит сильные ссылки на api/socket. `EffectsModule.stop()` отпишет потоки, но не «закроет» сокет. Базовому классу полезен опциональный хук `onDestroy()`, вызываемый из `cleanupCallbacks` синапса (`createSynapse.ts:153-155` — место встраивания).
4. **Один экземпляр — один синапс.** Шаринг инстанса между двумя EffectsModule формально допустим (рецепты stateless), но сокет-сервис внутри может быть не готов к двойному использованию. Зафиксировать в доках.
5. **Тестируемость — плюс**: `new PostsEffects(mockApi, mockSocket).loadPosts(of(action), of(state), fakeCtx)` тестирует эффект без синапса вообще.

---

## 7. Внешний диспетчер (externalDispatchers) в class-стиле

### Как это поддержано сейчас

Поддержано полностью, двумя механизмами:

1. **Экшены внешних диспетчеров вливаются в общий `action$`** — `subscribeToDispatchers`, `effects.module.ts:417-423` (код в §1.4). `action$` внутри эффекта уже содержит экшены чужих модулей.
2. **Сами внешние диспетчеры доступны в контексте** — `context.externalDispatchers` (`:486-492`): у них берут dispatch-функцию для `ofType` (фильтрация по `actionType`, неймспейснутому именем хранилища, `dispatcher.module.ts:343,409`) или диспатчат в чужой модуль.

Передаются через `createEffectConfig` (`createSynapse/types.ts:53-58`):

```typescript
createEffectConfig: () => ({
  externalDispatchers: { core: coreSynapse.dispatcher },
  externalStates: { auth: toObservable(authStorage) },
})
```

Функциональный эффект «сброс при logout» сегодня:

```typescript
const resetOnLogout: PostsEffect = (action$, _state$, { dispatcher, externalDispatchers: { core } }) =>
  action$.pipe(
    ofType(core.dispatch.logout),                        // экшен ЧУЖОГО модуля, уже есть в action$
    map(() => () => dispatcher.dispatch.resetPosts()),   // эмит функции => EffectsModule вызовет её (:506-512)
  )
```

### В class-стиле

Механически ничего не меняется — внешние диспетчеры остаются в контексте, типизируются третьим дженериком базового класса:

```typescript
type PostsExternal = { core: CoreDispatcher }

class PostsEffects extends Effects<PostsState, PostsDispatcher, PostsExternal> {
  constructor(private api: PostsEndpoints) { super() }

  readonly resetOnLogout = this.effect((action$, _state$, { dispatcher, externalDispatchers: { core } }) =>
    action$.pipe(
      ofType(core.dispatch.logout),
      map(() => () => dispatcher.dispatch.resetPosts()),
    ))
}
```

Альтернатива «инжектить внешний диспетчер конструктором как сервис» работает для dispatch в чужой модуль, но **не** для `ofType`-подписки: чтобы чужой экшен оказался в `action$`, диспетчер обязан быть зарегистрирован в `externalDispatchers` EffectsModule (иначе `subscribeToDispatchers` на него не подпишется). Канонический путь — через контекст/конфиг, а не через конструктор.

---

## 8. Предложение реализации базового класса Effects

Дизайн по варианту 4(а): `this.effect` = регистрация + Symbol-маркировка + типизация из дженериков класса. `services` исключены из class-контекста (живут в полях), `config` оставлен.

```typescript
// packages/synapse/src/reactive/effects/effects.base.ts
import { Observable } from 'rxjs'

import { Action, Dispatcher } from '../dispatcher'
import { Effect, ExternalStates } from './effects.module'

/** Symbol-маркер: отличает зарегистрированный эффект, позволяет dev-валидацию класса */
export const EFFECT_MARKER = Symbol('synapse.effect')

/** Контекст эффекта в class-стиле: без services (они — поля класса) */
export interface ClassEffectContext<
  TDispatcher,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
> {
  dispatcher: TDispatcher
  externalDispatchers: TExternalDispatchers
  externalStates: TExternalStates
  config: TConfig
}

/** Рецепт эффекта, связанный с дженериками класса */
export type BoundEffect<
  TState extends Record<string, any>,
  TDispatcher,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
> = (
  action$: Observable<Action>,
  state$: Observable<TState>,
  context: ClassEffectContext<TDispatcher, TExternalDispatchers, TExternalStates, TConfig>,
) => Observable<unknown>

export abstract class Effects<
  TState extends Record<string, any> = any,
  TDispatcher = any,
  TExternalDispatchers extends Record<string, Dispatcher<any, any>> = Record<string, never>,
  TExternalStates extends ExternalStates = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
> {
  private readonly _effects: Array<BoundEffect<TState, TDispatcher, TExternalDispatchers, TExternalStates, TConfig>> = []

  /**
   * Регистрирует рецепт эффекта. Вызов происходит при инициализации class-поля,
   * но fn будет вызвана только при EffectsModule.start() — с реальными action$/state$/context.
   * ВАЖНО: не читать сервисы (this.api и т.п.) вне тела fn — на момент инициализации
   * полей parameter properties конструктора ещё не присвоены.
   */
  protected effect(
    fn: BoundEffect<TState, TDispatcher, TExternalDispatchers, TExternalStates, TConfig>,
  ): BoundEffect<TState, TDispatcher, TExternalDispatchers, TExternalStates, TConfig> {
    ;(fn as any)[EFFECT_MARKER] = true
    this._effects.push(fn)
    return fn
  }

  /**
   * Адаптер к текущему EffectsModule: рецепты структурно совместимы с типом Effect —
   * контекст модуля является надтипом ClassEffectContext (лишнее поле services игнорируется).
   * Используется createSynapse: effectsModule.addEffects(instance.getEffects()).
   */
  getEffects(): Effect<TState, TDispatcher, any, TConfig, TExternalDispatchers, TExternalStates>[] {
    return [...this._effects] as Effect<TState, TDispatcher, any, TConfig, TExternalDispatchers, TExternalStates>[]
  }

  /** Опциональный хук: вызывается синапсом при destroy() — teardown сокетов и т.п. */
  onDestroy?(): void | Promise<void>
}
```

Изменение в `createSynapse` (`createSynapse.ts:143-147`) — принять экземпляры наряду с функциями:

```typescript
// effects?: Array<Effect | Effects> | Effects
const effectInputs = Array.isArray(config.effects) ? config.effects : config.effects ? [config.effects] : []
for (const item of effectInputs) {
  if (item instanceof Effects) {
    effectsModule.addEffects(item.getEffects())
    if (item.onDestroy) cleanupCallbacks.push(() => item.onDestroy!())
  } else {
    effectsModule.add(item)
  }
}
```

Свойства решения:
- **EffectsModule не меняется** — рецепты совместимы с `Effect` (контекст модуля содержит все поля `ClassEffectContext` плюс `services`; лишнее поле функции не мешает). Работают `stop()/start()` с пересозданием `action$`, горячий `add()`, `combineEffects`, вся библиотека операторов.
- **Типизация указывается один раз** в `extends Effects<...>` — вместо 6-арного `Effect<...>` на каждую константу (ср. pokemon.effects.ts:15,21,54,89 — четыре повторения алиаса).
- **Dev-валидация через EFFECT_MARKER**: при `getEffects()` можно пройтись по own-полям экземпляра и предупредить о поле-функции с сигнатурой эффекта без маркера — защита от «забыл обернуть в this.effect».
- Открытый вопрос для следующего этапа: куда в class-стиле переедет декларация `externalDispatchers`/`externalStates` (сегодня — `createEffectConfig`, `createSynapse/types.ts:53-58`). Минимально — оставить как есть; идеологически — переносить в декларацию class-based `CreateSynapse`.

### Отдельная рекомендация вне class-темы

Зафиксированное в §1.5 поведение «эффект умирает после первой непойманной ошибки» (`effects.module.ts:494-499`) стоит пересмотреть при редизайне: NgRx по умолчанию ресабскрайбит effect-поток. Минимальный вариант — retry-обёртка с лимитом/бэкоффом вместо терминального `catchError → of(null)`, либо опция `resubscribeOnError: true` на уровне `this.effect(fn, options)`.
