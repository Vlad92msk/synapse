# Подписки (subscribe)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SubscriptionPatternsExample.tsx)

Все способы подписки на изменения данных в хранилище. Примеры используют сквозной `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`). Работают одинаково для Memory, LocalStorage и
IndexedDB.

## 1. subscribe(key, callback)

Подписка на конкретный ключ верхнего уровня. Коллбек вызывается при каждом изменении этого ключа.

```typescript
const unsub = todoStorage.subscribe('filter', (newFilter) => {
  console.log('фильтр изменился:', newFilter)  // 'all' | 'active' | 'completed'
})

const unsub2 = todoStorage.subscribe('todos', (newTodos) => {
  console.log('список изменился:', newTodos)  // Todo[]
})

// Отписка
unsub()
```

## 2. subscribe(selector, callback)

Подписка через функцию-селектор. Коллбек вызывается, когда результат селектора изменяется.

```typescript
// Вычисляемое значение — число активных задач
const unsub = todoStorage.subscribe(
  (state) => state.todos.filter((t) => !t.done).length,
  (activeCount) => console.log('активных задач:', activeCount)
)

// Подписка на отдельное поле
const unsub2 = todoStorage.subscribe(
  (state) => state.filter,
  (filter) => console.log('фильтр:', filter)
)

unsub()
```

## 3. subscribeToAll(callback)

Подписка на ВСЕ изменения хранилища. Коллбек получает событие с информацией об изменении.

```typescript
const unsub = todoStorage.subscribeToAll((event) => {
  console.log(event.type)          // 'set' | 'update' | 'remove' | 'clear' | 'reset'
  console.log(event.key)           // ключ или массив ключей
  console.log(event.changedPaths)  // пути к изменённым полям
})

unsub()
```

## 4. useStorageSubscribe (React-хук)

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function TodoStats({ storage }: { storage: ISyncStorage<TodoState> }) {
  // Подписка на одно поле
  const filter = useStorageSubscribe(storage, (s) => s.filter)

  // Вычисляемое значение — ре-рендер только при изменении результата
  const total = useStorageSubscribe(storage, (s) => s.todos.length)
  const active = useStorageSubscribe(storage, (s) => s.todos.filter((t) => !t.done).length)

  return <div>{filter}: {active} активных из {total}</div>
}
```
