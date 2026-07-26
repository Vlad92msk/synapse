# LocalStorage

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/LocalStorageExample.tsx)

**TL;DR:** синхронное хранилище поверх `localStorage`. Данные переживают перезагрузку, API идентичен [MemoryStorage](./memory-storage.md). Для мелких настроек, которые должны сохраняться.

## Зачем

Персистентность без асинхронности: состояние автоматически пишется в `localStorage` браузера и подхватывается при следующей загрузке. Ключ в `localStorage` равен полю `name`. Читать/писать можно синхронно, без `await`.

Тот же сквозной todo-домен (`TodoState`, `initialTodoState` — см. [MemoryStorage](./memory-storage.md)), но теперь задачи сохраняются между перезагрузками.

## Когда использовать

- Небольшие пользовательские настройки, которые должны пережить перезагрузку: тема, выбранный фильтр, черновик формы.
- Нужен синхронный API и простота — без асинхронных `await`.

## Когда НЕ нужно

- **Большие объёмы**, массивы на тысячи элементов, бинарные данные → `localStorage` ограничен (~5 МБ) и сериализует всё в строку. Бери [IndexedDB](./indexeddb-storage.md).
- Данные **не должны** переживать сессию → [MemoryStorage](./memory-storage.md).
- Стор строится **на сервере** (SSR/SSG) → чистый `new LocalStorage()` там упадёт (нет `localStorage`). Оберни в [browserStorage](./browser-storage.md): на сервере он поднимет `MemoryStorage`, в браузере — `LocalStorage`.

## Чем отличается от соседних хранилищ

| | API | Лимит | Сервер |
|---|---|---|---|
| [MemoryStorage](./memory-storage.md) | sync | RAM | работает, но данные не персистятся |
| **LocalStorage** | sync | ~5 МБ, только строки | **падает** без `localStorage` → нужен [browserStorage](./browser-storage.md) |
| [IndexedDB](./indexeddb-storage.md) | **async** | большие/бинарные данные | нет sync-конструкции |

## Использование

Copy-paste минимальная форма:

```typescript
import { LocalStorage } from 'synapse-storage/core'

// Через new
const storage = new LocalStorage<TodoState>({
  name: 'todo-local', // ключ в localStorage
  initialState: initialTodoState,
})

// Или через статический .create() — эквивалент new
const storage = LocalStorage.create<TodoState>({
  name: 'todo-local',
  initialState: initialTodoState,
})

// initialize() загрузит сохранённые данные из localStorage, если они есть
await storage.initialize()
```

## Все параметры (закомментировано)

`LocalStorage` принимает тот же `SyncStorageConfig<T>`, что и `MemoryStorage`, но `version`/`migrate` здесь реально работают (данные персистентны).

```typescript
import { LocalStorage } from 'synapse-storage/core'

const storage = new LocalStorage<TodoState>({
  // name — обязательное. Также служит КЛЮЧОМ в localStorage.
  name: 'todo-local',

  // initialState — дефолт при первом запуске (когда в localStorage ещё пусто).
  //   Если данные уже сохранены — initialize() подхватит их, а не initialState.
  initialState: initialTodoState,

  // version? — версия схемы персистентного состояния. Задай, когда форма initialState
  //   меняется между релизами и в localStorage могут лежать данные старой схемы.
  version: 2,

  // migrate? — преобразует сохранённое состояние старой версии к текущей схеме.
  //   Вызывается при initialize(), только если задана version и сохранённая версия ниже.
  migrate: (persisted, fromVersion) =>
    fromVersion < 2 ? normalizeOld(persisted) : persisted,

  // clearOnDestroy? — стирать ли данные в localStorage при destroy().
  //   Для localStorage по умолчанию FALSE (персистентное: переживает destroy, как IndexedDB).
  clearOnDestroy: false,

  // middlewares? — конвейер sync-middleware (getDefault даёт batching/shallowCompare/logger).
  middlewares: (getDefault) => [getDefault().shallowCompare()],

  // singleton? — один экземпляр на name/key (enabled/mergeStrategy/warnOnConflict/key).
  singleton: { enabled: true },
})
```

| Поле | Тип | Описание |
|---|---|---|
| `name` | `string` | **Обязательно.** Идентификатор + ключ в `localStorage`. |
| `initialState?` | `T` | Дефолт при первом запуске. |
| `version?` | `number` | Версия схемы для миграций. |
| `migrate?` | `MigrateFn<T>` | Преобразование старой схемы к текущей. |
| `clearOnDestroy?` | `boolean` | Чистить `localStorage` при `destroy()` (по умолчанию `false`). |
| `middlewares?` | `(getDefault) => SyncMiddleware[]` | Конвейер middleware. |
| `singleton?` | `SingletonOptions` | Один экземпляр на `name`/`key`. |

## destroy() и clearOnDestroy

`destroy()` по умолчанию **не стирает** данные в localStorage — состояние переживает уничтожение хранилища (так же ведёт себя персистентный IndexedDB). Поведение управляется флагом конфига `clearOnDestroy?: boolean` (`SyncStorageConfig`): по умолчанию `false` для `localStorage` и `true` для `memory` (эфемерное). Чтобы `destroy()` чистил localStorage, передай `{ clearOnDestroy: true }`.

## Работа с данными

API записи/чтения/подписок идентичен MemoryStorage — см. раздел «Работа с данными» ([Чтение](./reading-data.md), [Запись](./writing-data.md), [Подписки](./subscriptions.md)). Единственное отличие — данные автоматически синхронизируются в localStorage; ключ в localStorage равен полю `name`.

## Persist-миграции и SSR

Так как данные персистентны, при смене формы `initialState` между релизами их можно мигрировать через `version` + `migrate` — см. [Persist-миграции](./persist-migration.md). Серверное состояние можно засеять через [`hydrate(state)`](./ssr-hydration.md), а безопасно построить стор на сервере — через [browserStorage](./browser-storage.md).

## См. также

- [MemoryStorage](./memory-storage.md) · [IndexedDB](./indexeddb-storage.md)
- [browserStorage](./browser-storage.md) — server-safe LocalStorage для SSR/SSG.
- [Persist-миграции](./persist-migration.md) · [SSR-гидрация](./ssr-hydration.md)
