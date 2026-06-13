# Research 02: Модуль селекторов (`core/selector`)

> Изученные файлы:
> - `/Users/vlad/web_dev/synapse/packages/synapse/src/core/selector/selector.module.ts` (502 строки)
> - `/Users/vlad/web_dev/synapse/packages/synapse/src/core/selector/selector.interface.ts` (106 строк)
> - `/Users/vlad/web_dev/synapse/packages/synapse/src/core/selector/index.ts`
> - `/Users/vlad/web_dev/synapse/packages/synapse/src/utils/createSynapse/createSynapse.ts`, `types.ts` (точка подключения селекторов)
> - `/Users/vlad/web_dev/synapse/packages/synapse/src/react/hooks/useSelector.ts` (потребление в React)
>
> Примечание: живой пример `/Users/vlad/web_dev/sn_client/src/modules/posts/synapse/posts.selectors.ts` прочитать не удалось — доступ за пределы репозитория запрещён в сессии субагента. Выводы о паттерне использования сделаны по контракту `ISelectorCreator` и `createSynapse` (живые паттерны см. research/05-usage-patterns.md).

---

## 1. Как работает `SelectorModule.createSelector`

### 1.1. Состав папки selector

`index.ts` экспортирует наружу только часть интерфейсов:

```typescript
// core/selector/index.ts
export type { ISelectorModule, SelectorAPI } from './selector.interface'
export * from './selector.module'
```

`Selector`, `SelectorOptions`, `Subscriber`, `ISelectorCreator`, `SelectorCreatorFunction` через index **не** реэкспортируются — публичный контракт фактически сводится к `ISelectorModule` + `SelectorAPI` + классу `SelectorModule` (и утилите `deepEquals`).

### 1.2. `SelectorAPI` — то, что получает потребитель

`selector.interface.ts:14-23`:

```typescript
export interface SelectorAPI<T> {
  select: () => T
  selectSync: () => T
  subscribe: (subscriber: Subscriber<T>) => VoidFunction
  getId: () => string
  /** @internal — проверка готовности источника данных */
  isSourceReady: () => boolean
  /** @internal — подписка на изменение статуса источника */
  onSourceStatusChange: (callback: (isReady: boolean) => void) => VoidFunction
}
```

- `select()` — «свежее» вычисление: дергает `getState()` (читает `source.getStateSync()` и прогоняет через мемоизированный селектор), минуя кеш `SelectorSubscription`.
- `selectSync()` — читает кеш подписки: `SelectorSubscription.getValue()` (`selector.module.ts:178-184`) возвращает `lastValue`, вычисляя его лениво при первом обращении; дальше кеш обновляется лишь в `notify()`. Именно `selectSync` использует React-хук как snapshot.
- `subscribe(subscriber)` — принимает `{ notify: (value) => void }` (`Subscriber<T>`, `selector.interface.ts:10-12`), при подписке **синхронно** шлёт текущее значение (`selector.module.ts:148-166`), возвращает unsubscribe.
- `getId()` — имя селектора (`options.name` либо автогенерированное `${storageName}_selector_${counter}`, `selector.module.ts:230-232`).
- `isSourceReady` / `onSourceStatusChange` — пробрасывают статус инициализации **хранилища-источника** (`selector.module.ts:217-225`, поверх `IStorageBase.initStatus`/`onStatusChange`, `storage.interface.ts:107-111`); используются хуком `useSelector` для `withLoading`.

Важно: `SelectorAPI<T>` — самодостаточный, **не привязанный к типу стора** интерфейс. Это ключевой факт для cross-store композиции (раздел 2).

### 1.3. Простой селектор `(state) => value`

Перегрузки (`selector.module.ts:270-271`, дублируются в `ISelectorModule`, `selector.interface.ts:48,65`):

```typescript
createSelector<T>(selector: Selector<S, T>, options?: SelectorOptions<T>): SelectorAPI<T>
createSelector<Deps extends unknown[], T>(
  dependencies: { [K in keyof Deps]: SelectorAPI<Deps[K]> },
  resultFn: (...args: Deps) => T,
  options?: SelectorOptions<T>,
): SelectorAPI<T>
```

Различение вариантов в рантайме — просто `Array.isArray(selectorOrDeps)` (`selector.module.ts:279`).

Пайплайн простого селектора (`createSimpleSelector`, `selector.module.ts:331-387`):

1. **Мемоизация + Proxy-трекинг зависимостей** — `memoizeSelector` (`selector.module.ts:75-105`):
   - кеш по ссылке на state: пересчёт только если `lastState !== state`;
   - при каждом реальном пересчёте state оборачивается в `Proxy` (`trackDependencies`, строки 59-72), который собирает в `Set<string>` имена **top-level ключей**, к которым обратился селектор;
   - если новый результат `equals`-равен старому, возвращается **старая ссылка** (строки 93-95) — референсная стабильность результата.
2. **Подписка на стор с фильтрацией по `changedPaths`** (`selector.module.ts:351-370`): модуль подписывается через `source.subscribeToAll` и на событии `storage:update` сверяет `event.changedPaths` (вида `"users.0.name"`) с натреканными ключами — берётся top-level сегмент (`path.split('.')[0]`). Нет пересечения — селектор вообще не пересчитывается. Автоматическая гранулярность без ручного объявления зависимостей.
3. **Батчинг**: обновления складываются в `pendingUpdates` и синхронно прогоняются в `processPendingUpdates()` (`selector.module.ts:237-268`) с флагом `batchUpdateInProgress` против реентерабельности.
4. **`SelectorSubscription`** (`selector.module.ts:107-189`) — носитель кеша и подписчиков. `notify()` пересчитывает значение, сравнивает через `equals` и уведомляет подписчиков только если значение реально изменилось.

`equals` по умолчанию — `===` (`defaultEquals`, строки 8-10); опционально свой, в т.ч. экспортируемый `deepEquals` (строки 18-53, лимит глубины 10, защита от циклов через `WeakSet`).

### 1.4. Combined-селектор `([dep1, dep2], (v1, v2) => value)`

`createCombinedSelector` (`selector.module.ts:389-485`):

1. **Мемоизация в стиле reselect** (строки 397-427): хранится `lastArgs`, аргументы сравниваются поэлементно **по ссылке**; все равны — возвращается `lastResult` без вызова `resultFn`. Если `resultFn` дал `equals`-равный результат — сохраняется старая ссылка.
2. `getState()` (строки 429-432): `selectors.map((s) => s.selectSync())` — зависимостям достаточно реализовать `SelectorAPI`.
3. **Подписки на зависимости** (строки 459-465): combined подписывается через `dep.subscribe(...)` на каждую зависимость; любое уведомление вызывает `triggerUpdate()`.
4. **Батчинг через microtask** (строки 443-457): `queueMicrotask` схлопывает залп уведомлений в один `subscription.notify()`. Флаг `destroyed` (взводится одной из `unsubscribeFunctions`, строки 468-470) гасит отложенный microtask после уничтожения.

Следствие microtask-батчинга: между изменением зависимости и `notify()` есть «окно» в один microtask, в котором `selectSync()` combined-селектора вернёт устаревшее значение (а `select()` — свежее). Для React не проблема (`useSyncExternalStore` дергает snapshot после `onStoreChange`), для императивного кода — нюанс.

### 1.5. Кеширование и жизненный цикл внутри модуля

- Каждый селектор регистрируется в `subscriptions: Map<id, SelectorSubscription>` и `localSelectorCache: Map<id, { api, dependencies?, unsubscribeFunctions }>` (строки 195-204, 322-326).
- **Кеш по имени работает только для явно именованных селекторов** (строки 284-292): повторный `createSelector` с тем же `options.name` вернёт существующий API. Анонимные создаются каждый раз заново, каждый вешает новую подписку на стор. Вызов `createSelector` в рендере без имени = утечка до `destroy()` модуля.
- `destroy()` (строки 487-500) — **только модульный, тотальный**: чистит все подписки, `pendingUpdates`, вызывает все `unsubscribeFunctions`. Точечного `removeSelector(id)` / `api.destroy()` **нет** — пробел, который придётся учитывать в class-дизайне.
- Нюанс: `SelectorSubscription.cleanup()` (строки 168-172) молча очищает подписчиков. Если на этот селектор был подписан combined из другого модуля — тот «замерзает» без ошибки.

### 1.6. Потребление в React

`react/hooks/useSelector.ts:17-73` — обёртка над `useSyncExternalStore`:

```typescript
export function useSelector<T>(selector: SelectorAPI<T>): T
export function useSelector<T>(selector: SelectorAPI<T>, options: UseSelectorOptions<T> & { withLoading: true }): { data: T; isLoading: boolean }
```

- subscribe → `selector.subscribe({ notify: () => onStoreChange() })` (строки 26-35);
- snapshot → `selector.selectSync()` с опциональной мемоизацией через пользовательский `equals` (строки 37-48);
- `withLoading` → второй `useSyncExternalStore` поверх `selector.onSourceStatusChange` / `isSourceReady` (строки 53-66);
- бонус-паттерн `useKeyedSliceSelector` (строки 86-91) — изоляция ререндеров по ключу map-стора через `equals: (a, b) => a[key] === b[key]`.

Вывод для редизайна: **React-слой зависит только от формы `SelectorAPI`**. Какой бы class-API мы ни сделали, поля-селекторы должны оставаться `SelectorAPI<T>`, и `useSelector` не потребует изменений.

---

## 2. Внешние (cross-store) селекторы сегодня

### 2.1. Контракт фабрики

`selector.interface.ts:77-96`:

```typescript
export interface ISelectorCreator<TStore extends Record<string, any>, TSelectors, TExternalSelectors = Record<string, any>> {
  (selectorModule: ISelectorModule<TStore>, externalSelectors?: TExternalSelectors): TSelectors
}
```

Подключение в `createSynapse` (`utils/createSynapse/createSynapse.ts:104-119`):

```typescript
if (config.createSelectorsFn) {
  selectorModule = new SelectorModule(storageInstance)
  const externalSelectors = config.externalSelectors || ({} as TExternalSelectors)
  result.selectors = config.createSelectorsFn(selectorModule, externalSelectors)
  ...
  cleanupCallbacks.push(() => selectorModule.destroy())
}
```

Конфиг (`utils/createSynapse/types.ts:33-36`):

```typescript
// Внешние селекторы
externalSelectors?: TExternalSelectors
// Функция создания селекторов
createSelectorsFn?: (selectorModule: ISelectorModule<TStore>, externalSelectors: TExternalSelectors) => TSelectors
```

«Подключение» внешних селекторов — **не интеграция на уровне модуля**: пользователь сам кладёт в `config.externalSelectors` произвольный объект (обычно `otherSynapse.selectors` уже созданного стора), а `createSynapse` пробрасывает его вторым аргументом в фабрику. Порядок готовности обеспечивается снаружи через `config.dependencies` + `waitForDependencies` (`createSynapse.ts:70`).

### 2.2. Работает ли combined поверх чужого `SelectorAPI`? Да

Combined из модуля A может зависеть от `SelectorAPI` модуля B, потому что `createCombinedSelector` использует от зависимостей **только** `selectSync()` (строка 430) и `subscribe()` (строки 459-465) — оба метода замкнуты на собственный модуль/стор зависимости. Проверки «свой/чужой» нет, тип зависимостей — `SelectorAPI<any>[]`. Это работает сейчас и является штатным паттерном.

Ограничения текущей схемы:

1. **`isSourceReady`/`onSourceStatusChange` combined-селектора отражают только хост-стор** (`selector.module.ts:480-481` отдают `this.isSourceReady` модуля-владельца). Если внешний стор не готов, `useSelector(combined, { withLoading: true })` покажет `isLoading: false`, а `selectSync` внешней зависимости прочитает кеш неинициализированного хранилища.
2. **Нет управления порядком уничтожения**: `destroy()` внешнего модуля молча отписывает всех (раздел 1.5) — combined в хост-модуле остаётся «живым», но больше не обновляется.
3. **Типизация на совести пользователя**: `TExternalSelectors` по умолчанию `Record<string, any>`.
4. Фильтрация по `changedPaths` работает только в simple; combined обновляется по любому уведомлению зависимостей (впрочем, simple-зависимости уже отфильтрованы).

---

## 3. Class-стиль: проблема инициализации полей и варианты

Целевой синтаксис:

```typescript
class PostsSelectors extends Selectors<PostsState> {
  readonly list = this.select((s) => s.list)
  readonly isLoading = this.selectWith([this.api], (a) => a.status === 'loading')
}
```

### 3.1. Уточнение проблемы

Class fields в JS выполняются **внутри конструктора подкласса сразу после `super()`**. Значит:

- Если `SelectorModule` попадает в инстанс **через конструктор базового класса** — проблемы нет: к моменту `this.select(...)` в инициализаторе поля `super()` уже отработал и `this.sm` установлен.
- Проблема реальна только для сценария «создали инстанс без модуля, модуль придёт позже» (DI-контейнер, декларация до создания стора, циклические зависимости между сторами).

### 3.2. Вариант A: `sm` через `constructor`/`super` (eager-материализация)

```typescript
createSelectorsFn: (sm, ext) => new PostsSelectors(sm, ext)
```

**Плюсы:**
- Нулевая магия: `this.select` — прямой вызов `sm.createSelector`, поля сразу настоящие `SelectorAPI<R>`.
- Полная типобезопасность: типы полей выводятся; обращение `this.api` до объявления поля `api` ловится компилятором (TS2729 «Property is used before its initialization») — порядок объявления полей контролируется статически.
- Идеально ложится на существующий `createSelectorsFn` — миграция тривиальна.

**Минусы:**
- Инстанс нельзя создать «заранее», до готовности стора; для DI придётся регистрировать фабрику, а не класс.
- Бойлерплейт конструктора в подклассах с внешними зависимостями.

### 3.3. Вариант B: ленивые дескрипторы (рецепты + материализация при `init`)

Поля записывают рецепт; `this.select` возвращает **lazy-обёртку** (Proxy либо объект-делегат), которая до `init(sm)` бросает/буферизует, после — делегирует в материализованный `SelectorAPI`.

**Плюсы:**
- `new PostsSelectors()` без аргументов → DI-контейнер, синглтоны, разруливание циклических cross-store зависимостей.
- **Автоименование**: на этапе `init` база может пройтись по own-полям, сматчить обёртки с рецептами и присвоить `name = "PostsSelectors.list"`. В eager-варианте имя поля в момент `this.select` неизвестно. Реальный DX-выигрыш (логи/devtools), недоступный нынешнему API.
- `selectWith([this.api], ...)` работает: в массив попадает стабильная lazy-ссылка; рецепты материализуются в порядке объявления полей.

**Минусы:**
- Поле типизировано `SelectorAPI<R>`, но до `init` вызов `selectSync()` — рантайм-ошибка. «Врущий тип» — главный удар по типобезопасности.
- Proxy: `proxy !== realApi` (identity), накладные расходы, сложнее дебаг. Делегат без Proxy честнее, но требует перечислить все методы `SelectorAPI` и поддерживать их.
- `subscribe` до `init`: либо throw (рано смонтированный компонент падает), либо очередь отложенных подписок — больше скрытой машинерии.
- Два состояния объекта (до/после init) — классический источник багов.

### 3.4. Вариант C: Proxy на инстанс / на `state`

Трекающий Proxy без реального state не может исполнить произвольную логику селектора (условия, вычисления); Proxy на весь инстанс ломает прозрачность, усложняет наследование, делает порядок материализации зависимым от порядка обращений. Годится только для path-DSL (`select('list')`), не для произвольных функций. Отбрасываем.

### 3.5. Рекомендация

**Базовый вариант — A (constructor injection).** `createSynapse` и так создаёт селекторы строго после готовности стора. Вариант B держать как расширение (`LazySelectors`) только если редизайн действительно идёт в DI-контейнер с инстанцированием до готовности сторов — и тогда его главный козырь не «ленивость», а автоименование полей.

---

## 4. Типизация внешних (cross-store) селекторов

### 4.1. Через конструктор подкласса

```typescript
class PostsSelectors extends Selectors<PostsState> {
  constructor(sm: ISelectorModule<PostsState>, private core: CoreSelectors) {
    super(sm)
  }
  readonly listForUser = this.selectWith(
    [this.list, this.core.currentUserId],
    (list, uid) => list.filter((p) => p.authorId === uid),
  )
}
```

Типы точные; зависимость явная (NestJS-дух); несколько внешних источников — несколько параметров. Параметр-свойство `private core` присваивается сразу после `super()`, **до** field initializers — т.е. `this.core` в инициализаторах полей корректно доступен. Минус — бойлерплейт конструктора.

### 4.2. Через generic базового класса + `this.external`

```typescript
abstract class Selectors<TState extends Record<string, any>, TExternal = void> {
  protected readonly external: TExternal
  constructor(sm: ISelectorModule<TState>, external?: TExternal) { ... }
}

class PostsSelectors extends Selectors<PostsState, CoreSelectors> {
  readonly listForUser = this.selectWith([this.list, this.external.currentUserId], (list, uid) => ...)
}
```

Типы точные, без бойлерплейта; зеркально повторяет текущий `createSelectorsFn(sm, externalSelectors)` — миграция механическая. Минусы: `TExternal` — один «мешок» (при двух+ внешних сторах придётся собирать `{ core, auth }`); опциональность `external` в конструкторе надо дожимать перегрузками, иначе типы полей считают его всегда заданным.

### 4.3. `this.external` без generic (`declare` / `Record<string, any>`)

Либо `any`, либо `declare external: CoreSelectors` — компилятор поверит, рантайм не гарантирует. Отбрасываем.

| Критерий | 4.1 конструктор | 4.2 generic + `this.external` |
|---|---|---|
| Точность типов | максимальная | максимальная |
| Бойлерплейт | конструктор в каждом подклассе | нет |
| Несколько внешних источников | естественно | объект-мешок |
| Соответствие текущему API | нужен адаптер | 1-в-1 |
| Явность зависимостей | высокая | средняя |
| Гарантия наличия в рантайме | да | через перегрузки |

**Рекомендация**: база реализует 4.2 как дефолт; 4.1 совместим с ним без изменений (просто дополнительные параметры конструктора подкласса) — продвигать его для multi-store случаев.

---

## 5. Предложение: базовый класс `Selectors<TState>`

Eager-вариант (A + 4.2), тонкий сахар поверх неизменного `SelectorModule`. Класс умеет владеть модулем (создавать его из `IStorage`) — тогда `destroy` осмыслен.

```typescript
import type { ISelectorModule, Selector, SelectorAPI, SelectorOptions } from '../core/selector/selector.interface'
import { SelectorModule } from '../core/selector/selector.module'
import type { IStorage } from '../core/storage'

type SelectorSource<TState extends Record<string, any>> = ISelectorModule<TState> | IStorage<TState>

function isSelectorModule<S extends Record<string, any>>(src: SelectorSource<S>): src is ISelectorModule<S> {
  return typeof (src as ISelectorModule<S>).createSelector === 'function'
}

export abstract class Selectors<TState extends Record<string, any>, TExternal = void> {
  /** Внешние (cross-store) селекторы — типизированы generic-параметром */
  protected readonly external: TExternal

  private readonly sm: ISelectorModule<TState>
  /** true, если модуль создан классом — тогда destroy() класса уничтожает модуль */
  private readonly ownsModule: boolean

  // external обязателен, если TExternal задан
  constructor(source: SelectorSource<TState>, ...ext: TExternal extends void ? [] : [external: TExternal])
  constructor(source: SelectorSource<TState>, external?: TExternal) {
    if (isSelectorModule(source)) {
      this.sm = source
      this.ownsModule = false
    } else {
      this.sm = new SelectorModule(source)
      this.ownsModule = true
    }
    this.external = external as TExternal
    // Field initializers подкласса выполнятся ПОСЛЕ этого конструктора —
    // this.sm и this.external к их моменту уже установлены.
  }

  /** Простой селектор: (state) => value */
  protected select<R>(selector: Selector<TState, R>, options?: SelectorOptions<R>): SelectorAPI<R> {
    return this.sm.createSelector(selector, options)
  }

  /** Combined: зависимости — любые SelectorAPI, в т.ч. из других сторов */
  protected selectWith<Deps extends unknown[], R>(
    deps: { [K in keyof Deps]: SelectorAPI<Deps[K]> },
    fn: (...args: Deps) => R,
    options?: SelectorOptions<R>,
  ): SelectorAPI<R> {
    return this.sm.createSelector(deps, fn, options)
  }

  /**
   * Если модуль создан классом — полный destroy модуля (снимаются подписки на storage
   * и на зависимости combined, см. SelectorModule.destroy, selector.module.ts:487-500).
   * Если модуль передан извне — за его жизненный цикл отвечает владелец
   * (в createSynapse — cleanupCallbacks, createSynapse.ts:113-115).
   */
  destroy(): void {
    if (this.ownsModule) this.sm.destroy()
  }
}
```

Использование:

```typescript
export class PostsSelectors extends Selectors<PostsState, CoreSelectors> {
  readonly list = this.select((s) => s.list)
  readonly status = this.select((s) => s.status)
  readonly isLoading = this.selectWith([this.status], (st) => st === 'loading')
  readonly myPosts = this.selectWith(
    [this.list, this.external.currentUserId],   // cross-store как обычная зависимость
    (list, uid) => list.filter((p) => p.authorId === uid),
  )
}

// подключение без изменения ядра:
const postsSynapse = createSynapse({
  storage: postsStorage,
  externalSelectors: coreSynapse.selectors,
  createSelectorsFn: (sm, ext) => new PostsSelectors(sm, ext),
})

// или автономно (класс сам владеет модулем):
const selectors = new PostsSelectors(postsStorage, coreSelectors)
selectors.destroy()
```

Заметки:
- Материализация **eager**, строго сверху вниз; ссылка на необъявленное поле — compile-error TS2729.
- Поля — обычные `SelectorAPI<T>`, `useSelector(posts.selectors.list)` работает без изменений.
- `protected select` снаружи не виден; промежуточные селекторы прячутся как `private readonly`.

Желательные доработки ядра (опционально):
1. **Точечная очистка**: добавить в `ISelectorModule` метод `removeSelector(id)` (вызвать `unsubscribeFunctions`, почистить обе Map) — тогда база копит `createdIds` и в `destroy()` удаляет только своё, не убивая чужие селекторы на общем модуле.
2. **Автоименование**: статическая фабрика `Selectors.create(Ctor, sm, ext)`, которая после `new` проходит по own-полям и присваивает имена `${Ctor.name}.${field}` (полноценно — только с lazy-вариантом или с rename-методом в ядре). Не для MVP.
3. **Агрегированный `isSourceReady`** для combined с внешними зависимостями (раздел 2.2 п.1) — отдельная задача ядра.

---

## 6. Есть ли смысл в классе, или фабрика удобнее?

Честный ответ: **функциональной необходимости в классе нет** — замыкание `createSelectorsFn = (sm, ext) => ({ list: sm.createSelector(...), ... })` покрывает всё то же: лучший вывод типов (тип набора выводится из литерала возврата), нет `this`-ловушек (обычные `const` + TDZ), тривиальная композиция.

Аргументы **за** класс — архитектурно-DX-овые, и в контексте цели «class-based как NestJS» весомые:

1. **Единообразие**: если сторы/диспетчеры/эффекты переезжают на классы, селекторы-фабрика будут инородным телом.
2. **Именованный тип «из коробки»**: у фабрики тип набора анонимный (`ReturnType<typeof createPostsSelectors>` — типичный костыль); `PostsSelectors` — сразу и значение, и тип, который удобно принимать в конструкторах других классов (`constructor(private core: CoreSelectors)`) — class-стиль селекторов усиливает вариант 4.1 cross-store типизации.
3. **Жизненный цикл**: `destroy()` как метод инстанса + владение `SelectorModule`; у фабрики cleanup живёт снаружи (`cleanupCallbacks` в `createSynapse.ts:113-115`), и фабрика про него не знает.
4. **Площадка для будущего**: декораторы (`@Named`, `@DeepEquals`), наследование наборов (`AdminPostsSelectors extends PostsSelectors`), `private`-поля для промежуточных селекторов, автоименование по имени поля (в фабрике недостижимо без обвязки).

Аргументы **против**: `this`-дисциплина (порядок полей), чуть худший tree-shaking, вопросы новичков (`strictPropertyInitialization`), и сахар тонкий — база из раздела 5 это ~40 строк поверх неизменного ядра.

**Вывод**: класс оправдан как *основной публичный стиль* нового API — при условии, что остаётся тонкой обёрткой над `SelectorModule` (eager, constructor injection), а `ISelectorModule.createSelector` и функциональная фабрика сохраняются как низкоуровневый слой (обратная совместимость + кому фабрика милее). Lazy-вариант (рецепты/Proxy) внедрять только вместе с реальным DI-контейнером — без него это сложность без выгоды.
