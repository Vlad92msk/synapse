# browserStorage (server-safe)

> [Назад к оглавлению](./README.md)

`browserStorage(config, { client })` (экспорт из `synapse-storage/core`) — **обёртка, которая делает
browser-only хранилище безопасным для сервера**. Возвращает фабрику `() => ISyncStorage<T>`, которую
передают в поле `storage` синхронной C-формы [`createSynapse`](./create-synapse-basic.md) как есть:

- **на сервере** (`typeof window === 'undefined'`) → поднимает `MemoryStorage` из `initialState`
  (клиентская фабрика **не вызывается**);
- **в браузере** → вызывает `client(config)` и строит настоящее клиентское хранилище (`LocalStorage`
  и т.п.).

Это **не отдельный тип хранилища**, а env-переключатель поверх тех, что уже есть.

## Зачем

C-форма `createSynapse` синхронна и **исполняется и на сервере** (из sync-ядра выводится SSR-оболочка,
`renderToString` строит стор из `initialState`). Но browser-only хранилища этого не переживают:
`LocalStorage` требует глобального `localStorage`, которого на сервере нет — конструкция падает.
Раньше в каждом модуле приходилось писать env-ветку руками:

```typescript
// было: ручной гард в КАЖДОМ модуле
storage: () => (typeof window === 'undefined'
  ? new MemoryStorage<DraftState>({ name: 'draft', initialState })
  : new LocalStorage<DraftState>({ name: 'draft', initialState })),
```

`browserStorage` убирает этот ритуал: обе ветки — sync-стор одной формы, `TState` выводится из
`initialState` без ручных дженериков, а `name`/`initialState` пишутся один раз.

## Когда использовать

- Модуль хочет **персистентность в браузере** (`LocalStorage`, sync-хранилище поверх SharedWorker),
  но при этом **должен рендериться на сервере** (SSR/SSG) без падений.
- Нужна межвкладочная синхронизация (`syncBroadcastMiddleware`) — она тоже browser-only, её кладут
  внутрь `client` (см. ниже).

## Когда НЕ нужно

- **Стор и так только in-memory** → бери `MemoryStorage` напрямую, оборачивать не во что.
- **Нет SSR** (чистый SPA, стор строится только в браузере) → можно `storage: () => new LocalStorage(...)`
  без обёртки; `browserStorage` тут просто ничего не ломает, но и не даёт выгоды.
- **Async-хранилище (IndexedDB)** → у него нет синхронной конструкции, C-форма его не поднимает
  синхронно; `browserStorage` предназначен для sync-хранилищ.

## Чем отличается от остальных хранилищ

| | Что это | Сервер | Браузер |
|---|---|---|---|
| [MemoryStorage](./memory-storage.md) | in-memory, sync | работает | данные живут до перезагрузки |
| [LocalStorage](./local-storage.md) | персист через `localStorage`, sync | **падает** (нет `localStorage`) | персистентно |
| [IndexedDB](./indexeddb-storage.md) | большие данные, **async** | нет sync-конструкции | персистентно |
| **`browserStorage`** | **не хранилище, а env-обёртка** | → `MemoryStorage` из `initialState` | → `client(config)` (напр. `LocalStorage`) |

Идея: `browserStorage` = «`LocalStorage` в браузере, `MemoryStorage` на сервере» одной строкой.

## Использование

Copy-paste минимальная форма:

```typescript
import { browserStorage, LocalStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

export const draftSynapse = createSynapse({
  // browserStorage(...) САМ возвращает фабрику () => ISyncStorage — передаётся как есть
  storage: browserStorage(
    { name: 'draft', initialState },
    { client: (cfg) => new LocalStorage(cfg) },
  ),
  dispatcher: (s) => new DraftDispatcher(s),
})
```

На сервере `draftSynapse` поднимется пустым из `initialState` (MemoryStorage), в браузере — из
`localStorage` (LocalStorage). SSR-оболочка выводится сама, `renderToString` не падает.

## Client-only middleware

Клиент-специфику (например межвкладочную синхронизацию `syncBroadcastMiddleware`) добавляй **внутри
`client`** — на сервере она не подключится, потому что ветка `client` там не исполняется:

```typescript
import { browserStorage, LocalStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

storage: browserStorage(
  { name: 'draft', initialState },
  {
    client: (cfg) => new LocalStorage({
      ...cfg,   // важно прокинуть name/initialState/version дальше
      middlewares: () => [syncBroadcastMiddleware({ storageType: 'localStorage', storageName: 'draft' })],
    }),
  },
),
```

## Все параметры (закомментировано)

Вся поверхность API разом — что можно передать и зачем:

```typescript
import { browserStorage, LocalStorage } from 'synapse-storage/core'

storage: browserStorage<DraftState>(
  // 1. config — обычный SyncStorageConfig: попадает в ОБЕ ветки (Memory на сервере, client в браузере).
  //    name/initialState объявляются здесь один раз; TState выводится из initialState.
  {
    name: 'draft',
    initialState,
    // version / migrate и прочие поля SyncStorageConfig тоже можно — см. Persist-миграции.
  },
  {
    // 2. client — ОБЯЗАТЕЛЬНОЕ. Фабрика клиентского sync-хранилища, зовётся ТОЛЬКО в браузере.
    //    Сюда же кладут client-only middleware (syncBroadcastMiddleware).
    client: (cfg) => new LocalStorage(cfg),

    // 3. isServer? — переопределение проверки «сервер».
    //    По умолчанию () => typeof window === 'undefined'. Нужно редко:
    //    напр. кастомная SSR-среда, где window определён, но localStorage использовать нельзя.
    isServer: () => typeof window === 'undefined',
  },
)
```

## Опции

| Поле | Тип | Описание |
|---|---|---|
| `config` | `SyncStorageConfig<T>` | `name` + `initialState` (+ `version`/`migrate`). Общий для обеих веток. |
| `client` | `(config) => ISyncStorage<T>` | **Обязательно.** Клиентская фабрика sync-хранилища. Зовётся **только** в браузере. |
| `isServer?` | `() => boolean` | Переопределение проверки «сервер». По умолчанию `typeof window === 'undefined'`. |

## См. также

- [createSynapse (базовый)](./create-synapse-basic.md) — C-форма, куда передаётся фабрика.
- [SSR-гидрация](./ssr-hydration.md) — почему конструкция бежит на сервере.
- [LocalStorage](./local-storage.md) · [MemoryStorage](./memory-storage.md) — обе ветки `browserStorage`.
- [Persist-миграции](./persist-migration.md) — `version`/`migrate` в `config`.
