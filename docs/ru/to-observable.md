# toObservable

> [Назад к оглавлению](./README.md)

**TL;DR.** `toObservable(source)` — мост из Synapse в RxJS. Превращает хранилище (опционально — его
срез), селектор или любой поток ядра (`selector.$`, `dispatcher.action$`, вотчер, `synapse.state$`) в
RxJS `Observable`. Это **низкоуровневая утилита для эффектов и не-React кода**. Импорт —
`synapse-storage/reactive` (нужен `rxjs`). В примерах —
сквозной `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`).

## Зачем

Хранилище само по себе — не RxJS-источник: у него `subscribe`/`getStateSync`, а не `pipe`. Как только
состояние нужно **прогнать через операторы** (`debounceTime`, `scan`, `bufferTime`, …) или **скормить в
`createEffectConfig` как внешний стейт**, требуется `Observable`. `toObservable` и делает этот мост:
эмитит текущее состояние при подписке, затем — на каждое изменение.

## Когда использовать / когда НЕ нужно

**Использовать:**

- строишь поток **вне React** — в эффектах, watcher-ах, обычных не-React модулях;
- нужен `Observable` состояния как **внешний стейт** для `createEffectConfig.externalStates`;
- в React нужен **свой набор операторов** поверх среза — тогда `toObservable(...)` в фабрике +
  [`useObservable`](./use-storage-observable.md) / [`useSubscription`](./use-subscription.md).

**НЕ нужно:**

- **просто срез в компонент без своих операторов** → [`useStorageObservable`](./use-storage-observable.md)
  (RxJS не нужен);
- **реактивное чтение вообще без RxJS** → [`useStorageSubscribe`](./use-storage-subscribe.md);
- нужно лишь подписаться на мемоизированный `SelectorAPI` — `selector.$.subscribe(...)` работает без RxJS,
  см. [Селекторы](./selector-system.md).

> В React-компоненте **не** создавай `toObservable(...)` прямо в рендере — новый Observable на каждый
> рендер провоцирует переподписки. Мемоизируй либо передавай **фабрикой** в `useObservable`.

## Сигнатура

```typescript
// весь стейт
toObservable<T>(storage: IStorageBase<T>): Observable<T>

// срез + опциональный компаратор
toObservable<T, R>(
  storage: IStorageBase<T>,
  selector: (state: T) => R,
  equals?: (a: R, b: R) => boolean,
): Observable<R>

// селектор (SelectorAPI) → поток его значений
toObservable<T>(selector: SelectorAPI<T>): Observable<T>

// любой поток ядра: selector.$, dispatcher.action$, d.someWatcher(), synapse.state$
toObservable<T>(stream: Subscribable<T>): Observable<T>
```

Потоки ядра — лёгкие *interop*-потоки без `pipe` (ядро не зависит от RxJS); `toObservable` эквивалентен
rxjs `from(stream)`:

```typescript
toObservable(selectors.searchQuery).pipe(debounceTime(300))
toObservable(dispatcher.action$).pipe(ofType(dispatcher.loadPosts))
toObservable(coreSynapse.state$) // например, чтобы передать в конструктор Effects
```

Что подписчик получает сразу, зависит от источника — `toObservable` ничего не добавляет и не теряет:

| Источник | При подписке | Дальше |
|---|---|---|
| хранилище (`toObservable(storage)`) | текущее состояние (общий поток, `shareReplay`) | каждое изменение |
| `synapse.state$` / `useSynapseState$()` | текущее состояние — **каждому подписчику, в т.ч. позднему** (как BehaviorSubject) | каждое изменение |
| селектор (`toObservable(selector)`, `selector.$`) | текущее значение | каждое реальное изменение |
| `dispatcher.action$` | **ничего** — горячий поток без replay | только экшены после подписки |
| вотчер `d.someWatcher()` | ничего (или текущее значение асинхронно при `notifyAfterSubscribe: true`) | каждое срабатывание |

Поэтому `withLatestFrom(toObservable(otherSynapse.state$))` в эффекте безопасен: экшен, задиспатченный сразу
после `ready()`, уже видит актуальное состояние чужого стора.

## `selector` — срез вместо всего стейта

Без селектора поток эмитит **всё** состояние на **каждое** изменение хранилища — даже если поменялось
поле, которое тебе не нужно. С селектором поток `map`-ит состояние в срез и прогоняет его через
`distinctUntilChanged`, поэтому эмитит, **только когда срез реально изменился**:

```typescript
import { toObservable } from 'synapse-storage/reactive'

const state$ = toObservable(todoStorage)                        // Observable<TodoState>, на любой чих
const count$ = toObservable(todoStorage, (s) => s.todos.length) // Observable<number>, только при смене числа
```

Здесь `count$` не дёрнется, если поменялся `filter`, — длина `todos` та же. Это и есть оптимизация:
подписчик (компонент/эффект) не просыпается на чужие изменения.

## `equals` — как сравнивать срезы

Третий параметр — компаратор для `distinctUntilChanged`. Он решает, считать ли новое значение среза
«тем же» (вернул `true` → эмит пропускается). По умолчанию сравнение идёт через `Object.is`.

`Object.is` хватает для **примитивов** (`number`, `string`, `boolean`) и для срезов со **стабильной
ссылкой** (когда иммутабельные обновления не трогают этот объект — ссылка сохраняется). Свой `equals`
нужен в двух случаях:

**1. Селектор каждый раз возвращает новый объект/массив.** Тогда `Object.is` видит новую ссылку на каждом
тике и `distinctUntilChanged` не дедуплицирует — поток эмитит на каждое изменение стора. Передай
сравнение по содержимому:

```typescript
// селектор-фабрика: каждый раз новый массив → нужен equals по значению
const ids$ = toObservable(
  todoStorage,
  (s) => s.todos.map((t) => t.id),
  (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
)
```

**2. Нужна более «грубая» эквивалентность, чем идентичность.** Например, эмитить только при смене не
самого значения, а его свойства:

```typescript
// эмитит только при смене чётности количества (1→3 молчит, 3→4 эмитит)
const parity$ = toObservable(todoStorage, (s) => s.todos.length, (a, b) => a % 2 === b % 2)
```

> `equals` имеет смысл только вместе с `selector` — без среза сравнивать нечего.

## В эффектах

Типовой кейс — пробросить состояние одного стора как внешний стейт в `createEffectConfig`:

```typescript
const auth$ = toObservable(authStorage, (s) => s.user.id)

createEffectConfig: () => ({
  externalStates: { userId: auth$ },
})
```

## Все параметры (закомментировано)

```typescript
import { toObservable } from 'synapse-storage/reactive'

const slice$ = toObservable(
  // 1. storage — IStorageBase (Memory/Local/IndexedDB — общий интерфейс).
  //    Поток подписывается на storage.subscribeToAll и эмитит getStateSync().
  todoStorage,

  // 2. selector? — какой срез вытащить. Без него поток эмитит ВЕСЬ стейт на любое
  //    изменение. С ним — map + distinctUntilChanged, эмит только при смене среза.
  (s) => s.todos.length,

  // 3. equals? — компаратор для distinctUntilChanged (по умолчанию Object.is).
  //    Нужен, если selector возвращает новый объект/массив каждый тик, либо нужна
  //    более грубая эквивалентность. Имеет смысл ТОЛЬКО вместе с selector.
  (a, b) => a === b,
)
```

## Параметры

| Параметр | Тип | Описание |
|---|---|---|
| `storage` | `IStorageBase<T>` | Хранилище. Поток эмитит `getStateSync()` при подписке и на каждое изменение. |
| `selector?` | `(state: T) => R` | Срез. Без него — весь стейт; с ним — `map` + `distinctUntilChanged`. |
| `equals?` | `(a: R, b: R) => boolean` | Компаратор для `distinctUntilChanged`. По умолчанию `Object.is`. Только вместе с `selector`. |

## Заметки

- Поток сразу эмитит текущее состояние при подписке (через `getStateSync()`), затем — на каждое изменение.
- Под капотом `shareReplay({ refCount: true })`: несколько подписчиков делят одну подписку на стор, а при
  падении их числа до нуля поток отписывается от хранилища (без утечки слушателей).

## См. также

- [useStorageObservable / useObservable](./use-storage-observable.md) — тот же поток в React-компоненте.
- [useSubscription](./use-subscription.md) — подписка-side-effect в React (тот же `toObservable` внутри).
- [useStorageSubscribe](./use-storage-subscribe.md) — реактивное чтение в компоненте без RxJS.
- [Реактивное чтение](./reactive-reads.md) — обзор и выбор инструмента.
