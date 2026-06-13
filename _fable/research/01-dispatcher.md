# Research 01: Модуль Dispatcher (synapse-storage)

> Исходники: `packages/synapse/src/reactive/dispatcher/`
> Изучены файлы:
> - `/Users/vlad/web_dev/synapse/packages/synapse/src/reactive/dispatcher/dispatcher.module.ts` (653 строки)
> - `/Users/vlad/web_dev/synapse/packages/synapse/src/reactive/dispatcher/standalone.ts` (298 строк)
> - `/Users/vlad/web_dev/synapse/packages/synapse/src/reactive/dispatcher/index.ts`
> - `/Users/vlad/web_dev/synapse/packages/synapse/src/reactive/dispatcher/middlewares/logger.middleware.ts`
> - Контекст: `utils/createSynapse/createSynapse.ts`, `utils/createSynapse/types.ts`, `core/storage/storage.interface.ts`, `reactive/effects/effects.module.ts`
>
> Живой пример `posts.dispatcher.ts` из sn_client прочитать не удалось (доступ запрещён в сессии субагента); живые паттерны см. research/05-usage-patterns.md.

Состав папки `dispatcher/` (по `index.ts`): `dispatcher.module.ts`, `standalone.ts`, `middlewares/` (только `logger.middleware.ts` с `loggerDispatcherMiddleware`).

---

## 1. Как класс `Dispatcher` регистрирует экшены: `createAction`, `createWatcher`, поток `action$`

### 1.1. Внутреннее устройство класса

`dispatcher.module.ts:161-214` — поля и конструктор:

```ts
export class Dispatcher<T extends Record<string, any>, TActionsFn extends ActionsSetupWithUtils<T> = ActionsSetupWithUtils<T>> {
  private actions$ = new Subject<Action>()
  public readonly actions: Observable<Action> = this.actions$.asObservable()
  public dispatch: Record<string, DispatchFunction<any, any>> = {}
  public watchers: Record<string, WatcherFunction<any>> = {}
  private storage: IStorage<T>
  private middlewareFunctions: Array<(next: (action: Action) => Promise<any>) => (action: Action) => Promise<any>> = []
  private dispatchChain: ((action: Action) => Promise<any>) | null = null
  private actionRegistry = new Map<string, { action: (params: any) => Promise<any> | any }>()
  private actionParams = new WeakMap<object, any>()
```

Ключевые структуры хранения:

| Структура | Что хранит | Кто пишет |
|---|---|---|
| `actions$: Subject<Action>` | сырой поток всех action-объектов | `executeChain()` и watcher'ы |
| `actions: Observable<Action>` | публичный read-only вид `actions$` | — |
| `dispatch: Record<string, DispatchFunction>` | именованные вызываемые экшены | **`createDispatcher`** (не сам класс!) |
| `watchers: Record<string, WatcherFunction>` | именованные watcher-функции | **`createDispatcher`** |
| `actionRegistry: Map<string, {action}>` | исполнитель (handler) по `actionType` | `createAction` / `_assignType` |
| `actionParams: WeakMap` | params конкретного dispatch-вызова, привязанные к объекту action | `dispatchFn` при вызове |

Важная деталь архитектуры: **сам класс `Dispatcher` не регистрирует экшены в `dispatch`/`watchers`** — `createAction`/`createWatcher` только *создают* функции. Раскладывает их по коллекциям и присваивает имена внешняя фабрика `createDispatcher` (§2). Это точка расщепления, которую class-based API должен закрыть.

Конструктор принимает `DispatcherOptions<T>` (`dispatcher.module.ts:151-156`):

```ts
interface DispatcherOptions<T extends Record<string, any>> {
  storage: IStorage<T>                  // обязательный
  middlewares?: EnhancedMiddleware<T>[]
}
```

— т.е. **storage обязателен уже в конструкторе** (нужен для `middlewareAPI`, для префикса имени в `createAction`, для подписки в `createWatcher`).

### 1.2. `createAction` — механизм (`dispatcher.module.ts:338-423`)

Сигнатура:

```ts
public createAction<TParams = void, TResult = void>(
  actionConfig: ActionDefinition<TParams, TResult>,
  executionOptions?: ActionExecutionOptions<TParams, TResult>,
): DispatchFunction<TParams, TResult>
```

где (`dispatcher.module.ts:54-61`, `standalone.ts:10-12`):

```ts
export interface ActionDefinition<TParams, TResult> {
  type?: string                                            // опционален! может быть выведен позже из ключа
  action: (params: TParams) => Promise<TResult> | TResult  // ВНИМАНИЕ: storage сюда НЕ передаётся
  meta?: Record<string, any>
}

export interface ActionExecutionOptions<TParams, TResult> {
  memoize?: (currentArgs: TParams, previousArgs: TParams, previousResult: TResult) => boolean
}
```

Пошагово:

1. **Формирование типа.** Всегда префиксуется именем хранилища: `` actionType = `[${this.storage.name}]${actionConfig.type}` `` (строка 343). Если `type` не задан — `actionType = ''`, регистрация откладывается (deferred, §2).
2. **Регистрация исполнителя.** Если тип известен сразу: `this.actionRegistry.set(actionType, { action: actionConfig.action })` (строка 347).
3. **Создаётся замыкание `dispatchFn`** (строки 356-386). При вызове оно:
   - бросает ошибку, если тип так и не назначен: `'Action type not assigned. Provide "type" in config or use within createDispatcher.'` (строки 357-359);
   - проверяет мемоизацию (если `memoize(params, lastParams, lastResult)` вернула `true` — отдаёт кэш);
   - создаёт объект `Action` **без payload** (`{ type, meta }`), а params кладёт в WeakMap: `this.actionParams.set(actionObject, params)` (строка 375) — чтобы не загрязнять action-объект аргументами;
   - прогоняет через `executeChain(actionObject)`;
   - кэширует `lastParams`/`lastResult` для мемоизации.
4. **На функцию навешиваются свойства** через `Object.defineProperty`:
   - `dispatchFn._type = 'dispatch'` (маркер для `createDispatcher`, строка 388);
   - `actionType` — `writable: false`, но **`configurable: true`** (строки 390-395) — именно это позволяет переопределить его при deferred-назначении;
   - `meta`, если есть;
   - `_assignType(name)` — если тип не был задан явно (§2).

Итоговый тип функции (`dispatcher.module.ts:101-110`):

```ts
export interface DispatchFunction<TParams, TResult> {
  (params: TParams): Promise<TResult>
  actionType: string
  meta?: Record<string, any>
  _type?: 'dispatch' | 'watchers'
}
```

### 1.3. Как формируется поток `actions$`: единая точка эмиссии

Конвейер исполнения (`dispatcher.module.ts:237-281`):

```ts
private baseExecute = async (action: Action): Promise<any> => {
  if (!this.actionParams.has(action)) {        // pass-through dispatch (via api.dispatch)
    return action.payload
  }
  const entry = this.actionRegistry.get(action.type)
  if (!entry) return action.payload
  const params = this.actionParams.get(action)
  return Promise.resolve(entry.action(params))
}

private async executeChain(action: Action): Promise<any> {
  const executor = this.dispatchChain ?? this.baseExecute
  const result = await executor(action)

  // Single emission point for all dispatches
  action.payload = result
  this.actionParams.delete(action)
  this.actions$.next(action)

  return result
}
```

Выводы:
- **payload экшена = возвращаемое значение handler'а** (не аргументы вызова). Аргументы живут только в WeakMap.
- Эмиссия в `actions$` происходит **один раз**, после всей middleware-цепочки, с финальным payload.
- Middleware-цепочка собирается заранее (`rebuildChain`, строки 270-281, композиция справа-налево как в Redux), а не на каждый dispatch. Middleware получают `EnhancedMiddlewareAPI` (строки 11-31): `getState`, `dispatch` (pass-through через `executeChain`), сам `storage`, `actions$`, коллекции `actions`/`watchers`, `findActionByType`/`findWatcherByType`.

Поток потребляется модулем эффектов: `ofType(actionFn)` читает `actionFn.actionType` в момент сборки пайплайна (`effects.module.ts:80-97`). Значит **`actionType` должен быть назначен до запуска эффектов** — критично для любой deferred-схемы.

### 1.4. `createWatcher` — механизм (`dispatcher.module.ts:427-546`)

```ts
public createWatcher<R>(config: WatcherDefinition<T, R>): WatcherFunction<R>

// dispatcher.module.ts:66-75
interface WatcherDefinition<T, R> {
  type?: string                                                // тоже опционален → deferred
  selector: (state: T) => R
  meta?: Record<string, any>
  shouldTrigger?: (prev: R | undefined, current: R) => boolean
  notifyAfterSubscribe?: boolean
}

// dispatcher.module.ts:80-85
export interface WatcherFunction<R> {
  (): Observable<TypedAction<R>>
  actionType: string
  meta?: Record<string, any>
  unsubscribe: VoidFunction
}
```

Механизм:
- `Observable<TypedAction<R>>` с **lazy-подпиской** на storage: `this.storage.subscribe(config.selector, cb)` вызывается только при первом subscribe (строка 466), обёрнут в `.pipe(share())` (строка 497) — одна storage-подписка на всех подписчиков;
- при инициализации асинхронно читается текущее состояние для `prevValue`; при `notifyAfterSubscribe: true` эмитится начальное значение с `meta.isInitial: true` (строки 450-463);
- каждое изменение (через `shouldTrigger`) превращается в `TypedAction<R>` и эмитится **и в `subscriber.next`, и в общий `this.actions$.next`** (строки 468-478) — так watcher'ы попадают в общий поток для эффектов;
- watcher-функция — `() => sharedObservable` плюс свойства: `_type = 'watchers'`, `actionType` (`configurable: true`), `meta`, `unsubscribe`, опционально `_assignType` (строки 500-545).

---

## 2. Deferred type assignment в `createDispatcher`

### 2.1. Сторона `createAction`/`createWatcher`: хук `_assignType`

Если `type` не указан, на функцию навешивается приватный сеттер (`dispatcher.module.ts:406-420`):

```ts
if (!hasExplicitType) {
  ;(dispatchFn as any)._assignType = (name: string) => {
    actionType = `[${this.storage.name}]${name}`          // 1) замыкание dispatchFn видит новый тип

    this.actionRegistry.set(actionType, { action: actionConfig.action })  // 2) поздняя регистрация handler'а

    Object.defineProperty(dispatchFn, 'actionType', {     // 3) переопределение свойства
      value: actionType, writable: false, enumerable: true, configurable: true,
    })
  }
}
```

Механизм держится на трёх вещах:
1. `actionType` — переменная **замыкания** (`let actionType`), поэтому уже созданная `dispatchFn` после `_assignType` диспатчит с правильным типом;
2. регистрация в `actionRegistry` происходит в момент назначения имени (до этого dispatch кинул бы ошибку из строки 358);
3. первоначальный `defineProperty` сделан с `configurable: true` — иначе повторный `defineProperty` бросил бы TypeError.

У watcher'а аналогичный `_assignType` (`dispatcher.module.ts:531-542`), только без `actionRegistry`.

### 2.2. Сторона `createDispatcher`: имя = ключ объекта

`createDispatcher` (реализация — `dispatcher.module.ts:592-651`) принимает либо объект «рецептов», либо setup-функцию `(storage, { createAction, createWatcher }) => Record<...>`, затем идёт по `Object.entries`:

```ts
for (const [key, fn] of Object.entries(actions)) {
  // Standalone action recipe — привязываем к storage и создаём реальный action
  if (typeof fn === 'object' && fn !== null && (fn as any)._type === 'action-recipe') {
    const recipe = fn as ActionRecipe<TState, any, any>
    const boundConfig = {
      meta: recipe._config.meta,
      action: (params: any) => recipe._config.action(options.storage, params),  // ← инъекция storage
    }
    const dispatchFn = dispatcher.createAction(boundConfig, recipe._executionOptions)
    if (typeof (dispatchFn as any)._assignType === 'function') {
      ;(dispatchFn as any)._assignType(key)              // ← имя экшена = ключ объекта
      delete (dispatchFn as any)._assignType
    }
    dispatcher.dispatch[key] = dispatchFn
    continue
  }
  // Standalone watcher recipe — аналогично (строки 624-633)
  // Inline action/watcher (строки 636-647):
  if (typeof fn === 'function') {
    const type = (fn as any)._type
    if (type === 'dispatch' || type === 'watchers') {
      if (typeof (fn as any)._assignType === 'function') {
        ;(fn as any)._assignType(key)
        delete (fn as any)._assignType
      }
      // @ts-ignore
      dispatcher[type][key] = fn        // dispatcher.dispatch[key] или dispatcher.watchers[key]
    }
  }
}
```

Итого «deferred type assignment» — трёхтактный протокол:
1. фабрика создаёт функцию без типа, но с `_assignType` и маркером `_type`;
2. `createDispatcher` узнаёт имя из **ключа объекта** и вызывает `_assignType(key)`;
3. функция раскладывается в `dispatcher.dispatch` / `dispatcher.watchers` под тем же ключом, `_assignType` удаляется.

Типизация результата — через overload'ы (`dispatcher.module.ts:574-589`): `Dispatcher<TState> & { dispatch: DispatchActions<TRecord>; watchers: WatcherActions<TRecord> }`, где mapped types (строки 133-146) разворачивают и готовые функции, и рецепты:

```ts
type ResolveDispatch<T> = T extends DispatchFunction<any, any> ? T
  : T extends ActionRecipe<any, infer P, infer R> ? DispatchFunction<P, R> : never
export type DispatchActions<T> = { [K in keyof T]: ResolveDispatch<T[K]> }

type ResolveWatcher<T> = T extends WatcherFunction<any> ? T
  : T extends WatcherRecipe<any, infer R> ? WatcherFunction<R> : never
export type WatcherActions<T> = { [K in keyof T]: ResolveWatcher<T[K]> }
```

---

## 3. `defineAction` и `createApiActions` (standalone.ts)

### 3.1. Рецепты: `ActionRecipe` / `WatcherRecipe`

Standalone-определения **не привязаны к storage** — это чистые данные («рецепты»), материализуемые в `createDispatcher` (`standalone.ts:18-38`):

```ts
export interface ActionRecipe<TState extends Record<string, any>, TParams, TResult> {
  readonly _type: 'action-recipe'
  readonly _config: {
    action: (storage: IStorage<TState>, params: TParams) => Promise<TResult> | TResult  // ← storage первым аргументом
    meta?: Record<string, any>
  }
  readonly _executionOptions?: ActionExecutionOptions<TParams, TResult>
}

export interface WatcherRecipe<TState extends Record<string, any>, R> {
  readonly _type: 'watcher-recipe'
  readonly _config: {
    selector: (state: TState) => R
    meta?: Record<string, any>
    shouldTrigger?: (prev: R | undefined, current: R) => boolean
    notifyAfterSubscribe?: boolean
  }
}
```

Разница сигнатур handler'а: в рецепте — `(storage, params) => result`, в inline `ActionDefinition` — `(params) => result` (storage в замыкании). Привязка рецепта: `action: (params) => recipe._config.action(options.storage, params)` (`dispatcher.module.ts:612`). **Именно сигнатура рецепта совпадает с желаемым class-based `this.action((_store, payload) => payload)`.**

### 3.2. `defineAction` / `defineWatcher` (`standalone.ts:96-135`)

Каррированные фабрики — первый вызов фиксирует `TState`, второй инферит `TParams`/`TResult`:

```ts
export function defineAction<TState extends Record<string, any>>() {
  return <TParams = void, TResult = void>(
    config: {
      action: (storage: IStorage<TState>, params: TParams) => Promise<TResult> | TResult
      meta?: Record<string, any>
    },
    executionOptions?: ActionExecutionOptions<TParams, TResult>,
  ): ActionRecipe<TState, TParams, TResult> => ({
    _type: 'action-recipe' as const,
    _config: config,
    _executionOptions: executionOptions,
  })
}
```

`defineWatcher<TState>()` аналогично возвращает `WatcherRecipe<TState, R>`.

### 3.3. `createApiActions` (`standalone.ts:201-234`)

Состояние запроса в стейте (`standalone.ts:51-67`):

```ts
export const ApiStatus = { Idle: 'idle', Loading: 'loading', Success: 'success', Error: 'error', Reset: 'reset' } as const
export type ApiStatus = (typeof ApiStatus)[keyof typeof ApiStatus]
export interface ApiRequestState { status: ApiStatus; error: string | null }
```

Сигнатура и устройство:

```ts
export function createApiActions<TState extends Record<string, any>, TInitPayload = void>(
  accessor: (draft: TState) => ApiRequestState
) {
  const path = resolvePath(accessor)        // Proxy-трюк: путь до поля вычисляется перехватом get
  const action = defineAction<TState>()
  const update = (storage: IStorage<TState>, request: ApiRequestState) => {
    storage.update((s) => setByPath(s, path, request))
  }
  return {
    init: action<TInitPayload, TInitPayload>({
      action: (storage, payload) => {
        update(storage, { status: ApiStatus.Idle, error: null })
        return payload                       // intent-паттерн: payload намерения уходит в actions$ → эффекты
      },
    }),
    loading: action({ action: (storage) => update(storage, { status: ApiStatus.Loading, error: null }) }),
    success: action({ action: (storage) => update(storage, { status: ApiStatus.Success, error: null }) }),
    failure: action({ action: (storage, error: string) => update(storage, { status: ApiStatus.Error, error }) }),
    reset:   action({ action: (storage) => update(storage, { status: ApiStatus.Reset, error: null }) }),
  }
}
```

Возвращает **объект из 5 `ActionRecipe`** — группу, а не один экшен. Со storage связана только косвенно (accessor даёт путь, реальный storage придёт при материализации в `createDispatcher`). `resolvePath` (`standalone.ts:144-156`) — accessor вызывается на Proxy, перехватывающем `get` и накапливающем имена свойств; `setByPath` (строки 161-167) пишет по пути в драфт `storage.update`.

Текущий DX регистрации (JSDoc, `standalone.ts:186-193`) — каждый рецепт группы отдельным ключом:

```ts
createDispatcher({ storage }, {
  loadListInit:    listRequest.init,
  loadListLoading: listRequest.loading,
  loadListSuccess: listRequest.success,
  loadListFailure: listRequest.failure,
  loadListReset:   listRequest.reset,
})
```

Есть также `createKeyedApiActions<TState>(accessor)` (`standalone.ts:267-297`) — статус per-key в `Record<string, ApiRequestState>`; все экшены принимают/возвращают `key`, `failure` принимает `{ key, error }`.

### 3.4. Как dispatcher попадает в Synapse (контекст для §5)

`createSynapse` (`utils/createSynapse/createSynapse.ts:121-134`):

```ts
// 5. Создаем диспетчер
if (config.createDispatcherFn) {
  dispatcher = config.createDispatcherFn(storageInstance)   // ← storage инжектится через фабрику
  result.dispatcher = dispatcher
  if (dispatcher && 'dispatch' in dispatcher) {
    result.actions = (dispatcher as any).dispatch            // ← публичные actions = dispatcher.dispatch
    ...
  }
}
```

Тип фабрики (`types.ts:51,73`): `createDispatcherFn: (storage: IStorage<TStore>) => TDispatcher`. Тип публичных actions: `ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : never` (`types.ts:9`).

Хронология: storage создаётся и инициализируется (шаг 3) → селекторы (шаг 4) → **`createDispatcherFn(storage)`** (шаг 5) → `EffectsModule` создаётся и стартует (шаг 6). К моменту запуска эффектов (где `ofType` читает `actionType`) все имена экшенов обязаны быть назначены.

---

## 4. Что нужно для class-based стиля с class fields

Целевой API:

```ts
class PostsDispatcher extends Dispatcher<PostsState> {
  readonly postsRequest = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)
  readonly mounted = this.action((_store, payload: FeedLifecyclePayload) => payload)
}
```

Необходимо:

1. **Protected-фабрики на базовом классе**: `this.action(...)`, `this.watcher(...)`, `this.apiActions(...)`, `this.keyedApiActions(...)`. Сигнатура handler'а — «рецептная» `(storage, params) => result`, она уже существует и проверена (`ActionRecipe._config.action`).
2. **Источник имени экшена — имя поля класса.** Аналог ключа объекта — проход по `Object.entries(this)` (class fields — **own enumerable** свойства экземпляра; методы прототипа в `Object.entries` не попадают — фильтрация бесплатная). Механизм `_assignType` переиспользуется как есть, т.к. `actionType` объявлен с `configurable: true`.
3. **Доступ к storage в момент инициализации полей** — см. §5.
4. **Групповые имена для `apiActions`**: поле одно (`postsRequest`), экшенов пять → конвенция автонейминга, напр. `postsRequest.init` → тип `[storageName]postsRequest.init`. Группу надо распознавать при сканировании полей (symbol-маркер).
5. **Совместимость:** `createSynapse` ждёт `'dispatch' in dispatcher` и `result.actions = dispatcher.dispatch`; `EffectsModule` ждёт `dispatcher.actions: Observable<Action>` и `.actionType` у функций для `ofType`; `destroy()` (сейчас `dispatcher.module.ts:325-333`); middleware (`use()`, `EnhancedMiddleware`).
6. **Момент «финализации»**: имена полей можно прочитать только **после** завершения инициализации всех полей (включая самый глубокий подкласс), а хука «после конструктора» в JS нет — главный нюанс, ниже.

---

## 5. Главное препятствие: storage при создании экшенов vs class fields

### 5.1. Уточнение: здесь две независимые проблемы

**(P1) Доступность storage в инициализаторах полей.** Порядок в JS: `new PostsDispatcher(storage)` → `super(storage)` → инициализаторы полей подкласса → тело конструктора подкласса. Если storage передан через `super(storage)`, то к моменту исполнения `this.action(...)` поле `this.storage` базового класса **уже установлено**. P1 остра только если экземпляр нужно создавать ДО появления storage (module-level синглтон). Но `createSynapse` этого не требует: `createDispatcherFn: (storage) => new PostsDispatcher(storage)` — storage уже готов и инициализирован к шагу 5.

**(P2) Имена экшенов из имён полей.** Базовый конструктор исполняется ДО инициализаторов полей подкласса — из `super()` поля не видны (`Object.entries(this)` вернёт пусто). Сканировать поля можно только после полной инициализации экземпляра. Это **настоящее** препятствие, не решаемое ни `super(storage)`, ни ленивыми обёртками сами по себе.

### 5.2. Варианты решения

**(а) Ленивые обёртки / плейсхолдеры + `init(storage)`.** `this.action(...)` возвращает настоящую `DispatchFunction`, но «пустую» (без `actionType`, без handler'а в реестре); `init(storage)` выполняет привязку и скан имён. Заготовка уже есть: dispatch без типа бросает понятную ошибку (`dispatcher.module.ts:357-359`), `_assignType` дорегистрирует handler.
- Плюсы: экземпляр можно создать до storage (синглтоны, DI, тесты); тип поля = окончательный `DispatchFunction<P,R>`, полный inference из лямбды.
- Минусы: двухфазный lifecycle («сконструирован» ≠ «готов»), забытый `init()` = runtime-ошибки; `actionType === ''` до init — `ofType` молча отфильтрует всё, если эффект собран раньше (`effects.module.ts:85-88` только warning); storage в handler'ах через косвенность `() => this.storage`.

**(б) Storage через `super(storage)`.** Поля инициализируются после `super()` → `this.action(...)` сразу создаёт полноценные функции через существующий `createAction` (storage биндится: `(params) => fn(this.storage, params)`).
- Плюсы: минимум магии, однофазность, идеально ложится на контракт `createSynapse`.
- Минусы: **не решает P2** — имена полей всё равно неоткуда взять в конструкторе, нужен финализирующий шаг; нельзя объявить диспетчер до создания storage; ловушка прямого `new` без финализации → конструктор стоит прятать или делать ленивую само-финализацию.

**(в) Деферред-регистрация: поля = «рецепты», материализация при init.** Поля записывают `ActionRecipe`/`WatcherRecipe`/группы (инфраструктура уже есть в `standalone.ts`), `init(storage)` сканирует `Object.entries(this)`, материализует и **подменяет значения полей** готовыми функциями.
- Плюсы: максимальное переиспользование текущего кода (рецепты, `_assignType`, mapped types); конструктор чист; рецепты тестируемы без storage.
- Минусы: **типы лгут** — поле объявлено как `ActionRecipe`, после материализации там `DispatchFunction`; нужен либо каст (`Materialized<T>` helper + `as` на выходе фабрики), либо доступ через `this.dispatch.xxx`, что убивает DX `dispatcher.mounted(payload)`; `readonly`-поля формально нельзя переприсваивать (runtime-подмена через `defineProperty` — обман компилятора). Вердикт: отличен как **внутренний** механизм, плох как публичная модель типов.

**(г) Прочие.**
- *Proxy вокруг экземпляра* (в static-фабрике): ленивые материализация/нейминг при первом `get`. Хрупко: ломает инварианты, прячет коллекции `dispatch`/`watchers` от синхронного middleware API.
- *Декораторы (TC39 stage 3 / TS 5)*: `@action() mounted = ...` — у декораторов полей есть `context.name` и `addInitializer` — «честное» решение P2. Минусы: требование нативных декораторов у потребителя, синтаксический шум, декоратор не может сузить тип поля → хуже inference. Кандидат «на потом».
- *Явное имя аргументом*: `this.action('mounted', fn)` — дублирование и рассинхрон при рефакторинге (ровно то, от чего ушли), но полезно как opt-in override.
- *`queueMicrotask` в базовом конструкторе* для автофинализации — недетерминизм (синхронный код после `new` увидит несфинализированный диспетчер); допустимо только как страховка.

### 5.3. Сводка

| Критерий | (а) lazy + init | (б) super(storage) | (в) рецепты | (г) декораторы |
|---|---|---|---|---|
| Решает P1 (storage) | да | да (для флоу createSynapse) | да | нет (нужна пара) |
| Решает P2 (имена) | нет (нужен скан) | нет (нужен скан) | нет (нужен скан) | **да** |
| Типобезопасность полей | высокая | высокая | низкая / каст | средняя |
| DX | средний (двухфазность) | высокий | высокий при касте | средний (шум) |
| Переиспользование кода | высокое | высокое | максимальное | низкое |
| Риск runtime-ошибок | забытый init | прямой new | то же | низкий |

**Вывод:** P1 и P2 ортогональны. Оптимум — **(б) + скан полей в скрытой static-фабрике**: storage через `super()` (контракт `createSynapse` уже такой), поля создают сразу настоящие `DispatchFunction` с отложенным именем (существующий `_assignType`), финализация (скан `Object.entries(this)`, нейминг, раскладка в `dispatch`/`watchers`) — в `static create()`, единственной публичной точке инстанцирования. Ленивая само-финализация / понятная ошибка при первом dispatch — как страховка.

---

## 6. Предложение реализации `class Dispatcher<TState>`

Принципы: внутри переиспользуется текущий движок (переименовать существующий класс в `DispatcherCore`; старый API `createDispatcher` сохраняется поверх него); единственная точка создания — `static create(storage)`, конструктор `protected`; поля подкласса создают настоящие функции, имена назначаются в `create()` через существующий протокол `_assignType`; `apiActions` возвращает группу, помеченную symbol'ом.

```ts
import { Observable } from 'rxjs'
import type { IStorage } from '../../core'
import {
  Dispatcher as DispatcherCore,           // существующий класс из dispatcher.module.ts
  type Action, type DispatchFunction, type WatcherFunction, type EnhancedMiddleware,
} from './dispatcher.module'
import { ApiStatus, type ApiRequestState, type ActionExecutionOptions } from './standalone'

const API_GROUP = Symbol('synapse:api-group')

export interface ApiActions<TInitPayload = void> {
  init: DispatchFunction<TInitPayload, TInitPayload>
  loading: DispatchFunction<void, void>
  success: DispatchFunction<void, void>
  failure: DispatchFunction<string, void>
  reset: DispatchFunction<void, void>
  [API_GROUP]: true
}

export interface DispatcherClassOptions<TState extends Record<string, any>> {
  middlewares?: EnhancedMiddleware<TState>[]
}

export abstract class Dispatcher<TState extends Record<string, any>> {
  private readonly core: DispatcherCore<TState>
  protected readonly storage: IStorage<TState>
  private finalized = false

  // ── Совместимость с createSynapse / EffectsModule ──────────────────────
  public get actions(): Observable<Action> { return this.core.actions }   // нужен EffectsModule
  public get dispatch() { return this.core.dispatch }                     // нужен createSynapse (result.actions)
  public get watchers() { return this.core.watchers }

  protected constructor(storage: IStorage<TState>, options?: DispatcherClassOptions<TState>) {
    this.storage = storage
    this.core = new DispatcherCore<TState>({ storage, middlewares: options?.middlewares })
  }

  /**
   * Единственная публичная точка создания: к моменту вызова finalizeRegistration
   * все class fields подкласса уже инициализированы, поэтому Object.entries(this)
   * видит их имена (аналог deferred type assignment из createDispatcher).
   */
  static create<TState extends Record<string, any>, C extends Dispatcher<TState>>(
    this: new (storage: IStorage<TState>, options?: DispatcherClassOptions<TState>) => C,
    storage: IStorage<TState>,
    options?: DispatcherClassOptions<TState>,
  ): C {
    const instance = new this(storage, options)
    instance.finalizeRegistration()
    return instance
  }

  // ── Protected-фабрики для полей подкласса ──────────────────────────────

  /** Экшен: handler в «рецептной» сигнатуре (storage, params) => result */
  protected action<TParams = void, TResult = void>(
    handler: (storage: IStorage<TState>, params: TParams) => Promise<TResult> | TResult,
    options?: ActionExecutionOptions<TParams, TResult> & { type?: string; meta?: Record<string, any> },
  ): DispatchFunction<TParams, TResult> {
    // type не передаём (если не задан явно) → core создаст _assignType,
    // имя придёт из имени поля при finalizeRegistration()
    return this.core.createAction<TParams, TResult>(
      { type: options?.type, meta: options?.meta, action: (params) => handler(this.storage, params) },
      options?.memoize ? { memoize: options.memoize } : undefined,
    )
  }

  protected watcher<R>(config: {
    selector: (state: TState) => R
    shouldTrigger?: (prev: R | undefined, current: R) => boolean
    notifyAfterSubscribe?: boolean
    type?: string
    meta?: Record<string, any>
  }): WatcherFunction<R> {
    return this.core.createWatcher<R>(config)
  }

  /** Группа lifecycle-экшенов API-запроса (аналог createApiActions) */
  protected apiActions<TInitPayload = void>(
    accessor: (draft: TState) => ApiRequestState,
  ): ApiActions<TInitPayload> {
    const path = resolvePath(accessor)   // тот же Proxy-механизм из standalone.ts:144
    const write = (request: ApiRequestState) =>
      this.storage.update((s) => setByPath(s, path, request))

    return {
      [API_GROUP]: true,
      init: this.action<TInitPayload, TInitPayload>((_s, payload) => {
        write({ status: ApiStatus.Idle, error: null })
        return payload
      }),
      loading: this.action(() => write({ status: ApiStatus.Loading, error: null })),
      success: this.action(() => write({ status: ApiStatus.Success, error: null })),
      failure: this.action<string, void>((_s, error) => write({ status: ApiStatus.Error, error })),
      reset:   this.action(() => write({ status: ApiStatus.Reset, error: null })),
    }
  }
  // protected keyedApiActions(...) — по образцу createKeyedApiActions (standalone.ts:267)

  // ── Финализация: аналог цикла Object.entries из createDispatcher ───────
  private finalizeRegistration(): void {
    if (this.finalized) return
    this.finalized = true

    for (const [key, value] of Object.entries(this)) {   // class fields = own enumerable props
      if (typeof value === 'function' && (value as any)._type === 'dispatch') {
        ;(value as any)._assignType?.(key)               // имя экшена = имя поля
        delete (value as any)._assignType
        this.core.dispatch[key] = value as DispatchFunction<any, any>
      } else if (typeof value === 'function' && (value as any)._type === 'watchers') {
        ;(value as any)._assignType?.(key)
        delete (value as any)._assignType
        this.core.watchers[key] = value as WatcherFunction<any>
      } else if (value && typeof value === 'object' && (value as any)[API_GROUP]) {
        for (const sub of ['init', 'loading', 'success', 'failure', 'reset'] as const) {
          const fn = (value as any)[sub]
          fn._assignType?.(`${key}.${sub}`)              // postsRequest → "postsRequest.init", ...
          delete fn._assignType
          this.core.dispatch[`${key}.${sub}`] = fn
        }
      }
    }
  }

  // ── Прокси текущих возможностей движка ─────────────────────────────────
  public use(...middlewares: EnhancedMiddleware<TState>[]): this { this.core.use(...middlewares); return this }
  public findActionByType(t: string) { return this.core.findActionByType(t) }
  public findWatcherByType(t: string) { return this.core.findWatcherByType(t) }
  public destroy(): void { this.core.destroy() }
}
```

Целевой DX:

```ts
class PostsDispatcher extends Dispatcher<PostsState> {
  readonly postsRequest = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)
  readonly mounted = this.action((_store, payload: FeedLifecyclePayload) => payload)
  readonly setPosts = this.action((store, posts: Post[]) => {
    store.update((s) => { s.posts = posts })
    return posts
  })
  readonly watchTotal = this.watcher({ selector: (s) => s.posts.length, notifyAfterSubscribe: true })
}

// Контракт createSynapse не меняется:
createSynapse({
  createStorageFn: ...,
  createDispatcherFn: (storage) => PostsDispatcher.create(storage, { middlewares: [loggerDispatcherMiddleware()] }),
  effects: [...],
})

// ofType работает без изменений (actionType назначен в create() до старта эффектов):
action$.pipe(ofType(dispatcher.postsRequest.init), ...)
dispatcher.mounted({ source: 'feed' })
```

Сохранение текущих возможностей: `actions$` и единая точка эмиссии — тот же `executeChain` (`dispatcher.module.ts:255-265`); middleware — делегирование в `core.use()` (причём `middlewareAPI.actions/watchers` указывают на те же объекты, которые наполняет финализация); memoize — пробрасывается; watchers (lazy, `share()`, `shouldTrigger`, `notifyAfterSubscribe`, `unsubscribe`) — делегирование; авто-имена — тот же `_assignType` (имя поля вместо ключа объекта; `configurable: true` уже позволяет); явное имя — `options.type`; совместимость с `createSynapse` (`'dispatch' in dispatcher`, `destroy`) — геттер и метод.

Открытые вопросы:
1. Конвенция имён группы: `postsRequest.init` vs `postsRequestInit`; `findActionByType` сплитит по `[${storage.name}]` (`dispatcher.module.ts:307-311`) — точки не конфликтуют.
2. Защита от прямого `new`: `protected constructor` работает на уровне типов TS; страховка — текущая ошибка «Action type not assigned» при dispatch без имени (`dispatcher.module.ts:357-359`), стоит дополнить упоминанием `YourDispatcher.create(storage)`.
3. Многоуровневое наследование работает из коробки: к возврату из `new` инициализированы поля всей цепочки.
4. Типизация `create` через `this`-параметр сохраняет тип подкласса (`PostsDispatcher.create(storage): PostsDispatcher`); сигнатуру конструктора стоит зафиксировать как часть контракта.
5. Старый API (`createDispatcher`, `defineAction`, `createApiActions`) остаётся нетронутым слоем поверх `DispatcherCore` — миграция постепенная.
6. `apiActions` в эскизе дублирует логику standalone-версии; альтернатива — общая внутренняя materialize-функция для рецептов, используемая и `createDispatcher`, и классом (тогда `resolvePath`/`setByPath` выносятся в общий модуль).
