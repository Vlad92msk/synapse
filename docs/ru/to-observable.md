# toObservable

> [Назад на главную](../../README.md)

Превращает хранилище (`IStorageBase`) в RxJS `Observable` потока состояния — для **эффектов и не-React
кода**. Это низкоуровневая утилита, на которой построен [useStorageObservable](./use-storage-observable.md).
Импортируется из `synapse-storage/reactive`. В примерах — сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

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
```

Три параметра:

1. **`storage`** — хранилище.
2. **`selector`** *(опц.)* — какой срез вытащить из состояния.
3. **`equals`** *(опц.)* — как сравнивать соседние значения среза, чтобы пропускать повторы.

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

## Заметки

- Поток сразу эмитит текущее состояние при подписке (через `getStateSync()`), а затем — на каждое
  изменение.
- Под капотом `shareReplay({ refCount: true })`: несколько подписчиков делят одну подписку на стор, а при
  падении их числа до нуля поток отписывается от хранилища (без утечки слушателей).
- В React-компоненте **не** создавай `toObservable(...)` прямо в рендере — мемоизируй (это и делает
  [useStorageObservable](./use-storage-observable.md)) или подписывайся через `useObservable` с фабрикой.
- Для простого реактивного чтения в компоненте без RxJS бери
  [useStorageSubscribe](./use-storage-subscribe.md).
