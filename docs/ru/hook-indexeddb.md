# useCreateStorage (indexedDB)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HookIndexedDBExample.tsx)

Тот же [`useCreateStorage`](./hook-memory.md) с `type: 'indexedDB'`. Возвращает `IAsyncStorage`.
Примечание: `destroyOnUnmount` по умолчанию равен `false` для IndexedDB (персистентное хранилище
обычно не нужно стирать при размонтировании).

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

## Использование

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady } = useCreateStorage<TodoState>({
    type: 'indexedDB',
    name: 'todo-hook-idb',
    initialState: initialTodoState,
  })
  // storage имеет тип IAsyncStorage<TodoState> | null

  // Чтобы уничтожать стор при размонтировании — передайте опцию явно:
  const result = useCreateStorage<TodoState>(
    { type: 'indexedDB', name: 'todo-hook-idb', initialState: initialTodoState },
    { destroyOnUnmount: true },
  )

  if (!isReady) return <div>Loading…</div>

  // useStorageSubscribe работает идентично для синхронных и асинхронных хранилищ
  const todos = useStorageSubscribe(storage, (s) => s.todos)

  // set/update возвращают Promise, но await в обработчиках не обязателен
  storage.update((s) => { s.filter = 'active' })
}
```

## Когда брать

- Компонентному стору нужна персистентность и/или большие объёмы данных.

## Когда не брать

- Маленькое состояние без асинхронности → [localStorage-вариант](./hook-local-storage.md).
- Эфемерное состояние → [memory-вариант](./hook-memory.md).

Подробнее про асинхронные операции — раздел «Работа с данными».
