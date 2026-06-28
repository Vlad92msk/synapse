# useCreateStorage (localStorage)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HookLocalStorageExample.tsx)

Тот же [`useCreateStorage`](./hook-memory.md), только с `type: 'localStorage'` — данные переживают
перезагрузку страницы. Единственное отличие от memory-варианта — поле `type`.

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

## Использование

```typescript
import { useCreateStorage, useStorageSubscribe } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady } = useCreateStorage<TodoState>({
    type: 'localStorage',         // <- единственное отличие от memory
    name: 'todo-hook-local',
    initialState: initialTodoState,
  })

  if (!isReady) return <div>Loading…</div>

  // Чтение и запись — как с memory
  const todos = useStorageSubscribe(storage, (s) => s.todos)
  storage.set('filter', 'completed')
}
```

## Когда брать

- Состояние компонента/экрана должно пережить перезагрузку (черновик, выбранный фильтр,
  настройки), но глобальный модульный стор заводить не хочется.

## Когда не брать

- Состояние эфемерное → [memory-вариант](./hook-memory.md).
- Большие данные → [IndexedDB-вариант](./hook-indexeddb.md).

Подробнее про подписки и операции — раздел «Работа с данными».
