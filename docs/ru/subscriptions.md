# Подписки (subscribe)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SubscriptionPatternsExample.tsx)

Подписки — это **реакция на изменения** данных (в отличие от разового [чтения](./reading-data.md)).
Три низкоуровневых способа + React-хук; выбор зависит от того, на что именно реагируешь:

| Способ | На что реагирует | Когда использовать |
|---|---|---|
| `subscribe(key, cb)` | изменение одного ключа верхнего уровня | нужно одно поле как есть |
| `subscribe(selector, cb)` | изменение результата функции-селектора | вычисляемое/вложенное значение |
| `subscribeToAll(cb)` | **любое** изменение стора | логирование, синхронизация, отладка |
| `useStorageSubscribe(...)` | значение среза в React-компоненте | подписка + ре-рендер в React |

Для **мемоизированных и комбинируемых** производных значений вместо inline-селектора лучше
[Селекторы](./selector-system.md) — здесь же селектор пересчитывается на каждое изменение стора.

Все способы возвращают функцию **отписки** — вызови её, чтобы прекратить подписку (в React —
верни из `useEffect`). Примеры используют сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`). Работают одинаково для Memory, LocalStorage и IndexedDB.

## 1. subscribe(key, callback) — один ключ

Коллбек вызывается при каждом изменении конкретного ключа верхнего уровня.

```typescript
const unsub = todoStorage.subscribe('filter', (newFilter) => {
  console.log('фильтр изменился:', newFilter)  // 'all' | 'active' | 'completed'
})

const unsub2 = todoStorage.subscribe('todos', (newTodos) => {
  console.log('список изменился:', newTodos)  // Todo[]
})

unsub()   // отписка
```

## 2. subscribe(selector, callback) — вычисляемое значение

Функция-селектор считается на каждое изменение стора; коллбек вызывается, **только когда её результат
изменился**. Так подписываются на вложенное или производное значение.

```typescript
// Число активных задач — коллбек только при изменении именно этого числа.
const unsub = todoStorage.subscribe(
  (state) => state.todos.filter((t) => !t.done).length,
  (activeCount) => console.log('активных задач:', activeCount),
)

// Отдельное поле через селектор.
const unsub2 = todoStorage.subscribe(
  (state) => state.filter,
  (filter) => console.log('фильтр:', filter),
)

unsub()
```

> Если селектор возвращает **объект/массив**, он сравнивается по ссылке — новый объект на каждое
> изменение будет каждый раз считаться «изменившимся». Для стабильных производных значений с
> кастомным сравнением используй [Селекторы](./selector-system.md) (`this.select(..., { equals })`).

## 3. subscribeToAll(callback) — любое изменение

Коллбек получает **событие** на каждое изменение стора — с типом операции, ключами и путями.
Подходит для логирования, кросс-синхронизации, отладки.

```typescript
const unsub = todoStorage.subscribeToAll((event) => {
  // event.type          — тип операции: 'set' | 'update' | 'remove' | 'clear' | 'reset' и т.п.
  // event.key           — затронутый ключ или массив ключей (StorageKeyType | StorageKeyType[])
  // event.changedPaths  — пути к изменённым полям (string[]), напр. ['todos', 'filter']
  // event.value         — новое значение (когда применимо)
  console.log(event.type, event.key, event.changedPaths)
})

unsub()
```

## 4. useStorageSubscribe — React-хук

Подписка на срез состояния с ре-рендером компонента при изменении результата.

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function TodoStats({ storage }: { storage: ISyncStorage<TodoState> }) {
  const filter = useStorageSubscribe(storage, (s) => s.filter)

  // Ре-рендер только при изменении результата селектора.
  const total = useStorageSubscribe(storage, (s) => s.todos.length)
  const active = useStorageSubscribe(storage, (s) => s.todos.filter((t) => !t.done).length)

  return <div>{filter}: {active} активных из {total}</div>
}
```

Для объектных/массивных срезов передай `equals`, чтобы не ре-рендерить, когда содержимое не изменилось:

```typescript
// { equals } поддерживает именно хук useStorageSubscribe (у низкоуровневого subscribe его нет).
const todos = useStorageSubscribe(storage, (s) => s.todos, { equals: (a, b) => a === b })
```

## См. также

- [Селекторы](./selector-system.md) — мемоизированные комбинируемые производные значения и `selector.$`.
- [Реактивное чтение и управляемые ре-рендеры](./reactive-reads.md) — `useStorageObservable` (RxJS)
  и `useStorageRef` (чтение без ре-рендера / ручной триггер).
- [Чтение данных](./reading-data.md) — разовое чтение вместо реакции на изменения.
