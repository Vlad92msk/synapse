# useCreateStorage (memory)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HookExample.tsx)

React-хук, который создаёт и инициализирует хранилище прямо внутри компонента и уничтожает его
при размонтировании. Не нужно держать стор на уровне модуля — его жизненный цикл совпадает с
жизненным циклом компонента.

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)).

## useCreateStorage

```typescript
import { useCreateStorage } from 'synapse-storage/react'

function TodoApp() {
  const { storage, isReady, isLoading, hasError, status } = useCreateStorage<TodoState>({
    type: 'memory',           // 'memory' | 'localStorage' | 'indexedDB'
    name: 'todo-hook-memory',
    initialState: initialTodoState,
  })

  // Опционально: настройки жизненного цикла вторым аргументом
  const result = useCreateStorage<TodoState>(
    { type: 'memory', name: 'todo-hook-memory', initialState: initialTodoState },
    {
      autoInitialize: true,    // автоинициализация (по умолчанию: true)
      destroyOnUnmount: true,  // уничтожить при размонтировании (по умолчанию: true для memory/local)
    },
  )

  // isReady = true  -> storage доступен (тип: ISyncStorage<TodoState>)
  // isReady = false -> storage = null
  if (!isReady) return <div>Loading…</div>

  // После isReady storage гарантированно не null
  storage.set('filter', 'active')
}
```

## Чтение состояния — useStorageSubscribe

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// Подписка на всё состояние или на отдельные поля (ререндер только при изменении результата)
const state = useStorageSubscribe(storage, (s) => s)
const filter = useStorageSubscribe(storage, (s) => s.filter)
const activeCount = useStorageSubscribe(storage, (s) => s.todos.filter((t) => !t.done).length)
```

`useStorageSubscribe` принимает `storage | null`, поэтому его можно вызывать до готовности —
вернёт `undefined`. Подробнее — в разделе [Подписки](./subscriptions.md).

## Когда брать

- Стор нужен только внутри конкретного компонента/экрана и должен исчезать вместе с ним.
- Не хочется ручного `initialize()` / `destroy()` в `useEffect`.

## Когда не брать

- Стор должен быть глобальным и переживать размонтирование компонента → создавайте его на
  уровне модуля (см. [MemoryStorage](./memory-storage.md)) или через
  [createSynapse](./create-synapse-basic.md).
