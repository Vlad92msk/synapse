# LocalStorage

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/LocalStorageExample.tsx)

Данные хранятся в `localStorage` браузера и переживают перезагрузку страницы. Синхронный API,
полностью идентичный [MemoryStorage](./memory-storage.md).

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)),
но теперь задачи сохраняются между перезагрузками.

## Создание

```typescript
import { LocalStorage } from 'synapse-storage/core'

// Через new
const storage = new LocalStorage<TodoState>({
  name: 'todo-local', // ключ в localStorage
  initialState: initialTodoState,
})

// Или через статический .create()
const storage = LocalStorage.create<TodoState>({
  name: 'todo-local',
  initialState: initialTodoState,
})

// initialize() загрузит сохранённые данные из localStorage, если они есть
await storage.initialize()
```

## Когда брать

- Небольшие пользовательские настройки и состояние, которое должно пережить перезагрузку
  (тема, выбранный фильтр, черновик).
- Нужен синхронный API и простота — без асинхронных `await`.

## Когда не брать

- Большие объёмы данных, массивы на тысячи элементов или бинарные данные → localStorage
  ограничен (~5 МБ) и сериализует всё в строку. Используйте [IndexedDB](./indexeddb-storage.md).
- Данные не должны переживать сессию → [MemoryStorage](./memory-storage.md).

## Работа с данными

API записи/чтения/подписок идентичен MemoryStorage — см. раздел «Работа с данными»
([Чтение](./reading-data.md), [Запись](./writing-data.md), [Подписки](./subscriptions.md)).
Единственное отличие — данные автоматически синхронизируются в localStorage; ключ в
localStorage равен полю `name`.

## destroy() и clearOnDestroy

`destroy()` по умолчанию **не стирает** данные в localStorage — состояние переживает
уничтожение хранилища (так же ведёт себя персистентный IndexedDB). Поведение управляется
флагом конфига `clearOnDestroy?: boolean` (`SyncStorageConfig`): по умолчанию `false` для
`localStorage` и `true` для `memory` (эфемерное). Чтобы `destroy()` чистил localStorage,
передайте `{ clearOnDestroy: true }`.

## Persist-миграции и SSR

Так как данные персистентны, при смене формы `initialState` между релизами их можно
мигрировать через `version` + `migrate` — см. [Persist-миграции](./persist-migration.md).
Серверное состояние можно засеять через [`hydrate(state)`](./ssr-hydration.md).
