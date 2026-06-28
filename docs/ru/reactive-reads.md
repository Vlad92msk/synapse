# Реактивное чтение и управляемые ререндеры

> [Назад на главную](../../README.md)

Повседневный паттерн: меняешь хранилище обычными методами (`set`/`update`), а в компоненте читаешь его
**реактивно**. Synapse даёт для этого несколько хуков — разница между ними в том, **насколько ты
контролируешь ререндеры**. В примерах используется сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

| Хук | Ререндеры | RxJS | Когда использовать |
|-----|-----------|------|--------------------|
| `useStorageSubscribe` | на каждое изменение выбранного среза | нет | реактивное чтение по умолчанию |
| `useSelector` | на каждое изменение выбранного среза | нет | чтение `SelectorAPI` |
| `useStorageObservable` | на каждое изменение выбранного среза | да | нужны RxJS-операторы |
| `useStorageRef` | **только когда ты сам решишь** | нет | ты сам контролируешь ререндеры |

## useStorageSubscribe — по умолчанию

Под капотом `useSyncExternalStore` (Concurrent-safe), без RxJS. Ререндерит при изменении выбранного
среза. Для примитивных селекторов дедуплицирует через `Object.is`; для объектных/массивных срезов
передавай `equals`, чтобы постороннее изменение стора не дёргало компонент.

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// примитивный срез — дедупликация автоматом
const filter = useStorageSubscribe(todoStorage, (s) => s.filter)

// объектный/массивный срез — `equals` держит стабильный снапшот и гасит лишние ререндеры
const todos = useStorageSubscribe(todoStorage, (s) => s.todos, {
  equals: (a, b) => a === b,
})
```

## useStorageObservable — RxJS-путь

Мемоизирующая обёртка над `toObservable` + `useObservable`. Эквивалент `useStorageSubscribe`, но можно
навесить RxJS-операторы поверх потока состояния. Мемоизирует observable по `[storage]`, поэтому **не**
переподписывается на каждый рендер (footgun инлайнового `toObservable(storage)` в рендере).

```typescript
import { useStorageObservable } from 'synapse-storage/react'

// всё состояние
const state = useStorageObservable(todoStorage)

// срез — эмитит только при изменении среза (distinctUntilChanged)
const total = useStorageObservable(todoStorage, (s) => s.todos.length)
```

## useStorageRef — ты контролируешь ререндеры

Держит **свежее** значение в `ref` (обновляется на каждое изменение стора), но **не** ререндерит
компонент автоматически. Возвращает `{ ref, get, rerender }` и отдаёт контроль тебе:

```typescript
import { useStorageRef } from 'synapse-storage/react'

function TodoCounter() {
  const { ref, get, rerender } = useStorageRef(todoStorage, (s) => s.todos.length)

  // «вообще без ререндера» — читаем актуальное значение по требованию в обработчике
  const logCount = () => console.log('текущее значение:', get())

  // «ререндер, когда я сам решу» — UI читает ref.current, ререндеришь вручную
  return (
    <div>
      <span>{ref.current}</span>
      <button onClick={logCount}>лог</button>
      <button onClick={rerender}>обновить</button>
    </div>
  )
}
```

**«Ререндер по условию»** — передай `shouldRerender(prev, next)`; компонент ререндерится только когда
он вернул `true` (значение в `ref` к этому моменту уже свежее):

```typescript
// ререндерим только при переходе пусто/не-пусто
const { ref } = useStorageRef(todoStorage, (s) => s.todos.length, {
  shouldRerender: (prev, next) => (prev === 0) !== (next === 0),
})
```

Заметки:

- `useStorageRef` **не** использует `useSyncExternalStore` (тот не умеет пропускать ререндер по
  решению компонента), поэтому осознанно отказывается от tearing-гарантий Concurrent Mode — что
  приемлемо для сценария «я сам контролирую ререндеры».
- Возвращаемый `{ ref, get, rerender }` стабилен между рендерами.
- Селектор по умолчанию возвращает всё состояние. Если передать `null` вместо стора (до инициализации),
  `get()` вернёт `undefined`.

## toObservable — вне React

Для эффектов и не-React кода `toObservable(storage)` превращает хранилище в `Observable` всего
состояния. Со селектором поток эмитит только срез, дедуплицируя через `distinctUntilChanged` (по
умолчанию `Object.is`, либо кастомный `equals`):

```typescript
import { toObservable } from 'synapse-storage/reactive'

const state$ = toObservable(todoStorage)                       // Observable<TodoState>
const count$ = toObservable(todoStorage, (s) => s.todos.length) // Observable<number>, distinct
```
