# toObservable

> [Назад на главную](../../README.md)

Превращает хранилище (`IStorageBase`) в RxJS `Observable` потока состояния — для **эффектов и не-React
кода**. Это низкоуровневая утилита, на которой построен [useStorageObservable](./use-storage-observable.md).
Импортируется из `synapse-storage/reactive`. В примерах — сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Базовое использование

Без селектора поток эмитит **всё** состояние на каждое изменение хранилища. Со селектором — только срез,
дедуплицируя повторы через `distinctUntilChanged` (по умолчанию `Object.is`, либо переданный `equals`):

```typescript
import { toObservable } from 'synapse-storage/reactive'

const state$ = toObservable(todoStorage)                        // Observable<TodoState>
const count$ = toObservable(todoStorage, (s) => s.todos.length) // Observable<number>, distinct
```

Поток сразу эмитит текущее состояние при подписке (через `getStateSync()`), а затем — на каждое
изменение. Под капотом `shareReplay(1)`, поэтому несколько подписчиков делят одну подписку на стор.

## В эффектах

Типовой кейс — пробросить состояние одного стора как внешний стейт в `createEffectConfig`:

```typescript
const auth$ = toObservable(authStorage, (s) => s.user.id)

createEffectConfig: () => ({
  externalStates: { userId: auth$ },
})
```

## Кастомный `equals`

Второй аргумент селекторной перегрузки — компаратор для `distinctUntilChanged`:

```typescript
// эмитит только при смене чётности количества
const parity$ = toObservable(todoStorage, (s) => s.todos.length, (a, b) => a % 2 === b % 2)
```

## Заметки

- В React-компоненте **не** создавай `toObservable(...)` прямо в рендере — мемоизируй (это и делает
  [useStorageObservable](./use-storage-observable.md)) или подписывайся через `useObservable` с фабрикой.
- Для простого реактивного чтения в компоненте без RxJS бери
  [useStorageSubscribe](./use-storage-subscribe.md).
