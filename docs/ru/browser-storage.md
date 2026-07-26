# browserStorage (server-safe)

> [Назад к оглавлению](./README.md)

`browserStorage(config, { client })` (экспорт из `synapse-storage/core`) — **server-safe фабрика
хранилища** для синхронной C-формы [`createSynapse`](./create-synapse-basic.md). Она возвращает
фабрику `() => ISyncStorage<T>`, которую передают в поле `storage` как есть:

- **на сервере** (`typeof window === 'undefined'`) → поднимает `MemoryStorage` из `initialState`
  (клиентская фабрика **не вызывается**);
- **в браузере** → вызывает `client(config)` и строит клиент-специфичное хранилище (`LocalStorage`
  и т.п.).

## Зачем

Конструкция C-формы синхронна и **бежит и на сервере** (из sync-ядра выводится SSR-оболочка). Но
browser-only хранилища этого не переживают: `LocalStorage` требует `localStorage`, которого на
сервере нет. Раньше в каждом модуле приходилось писать ветку вручную:

```typescript
// было: ручной гард в каждом модуле
storage: () => (typeof window === 'undefined'
  ? new MemoryStorage<DraftState>({ name: 'draft', initialState })
  : new LocalStorage<DraftState>({ name: 'draft', initialState })),
```

`browserStorage` убирает этот ритуал: обе ветки — sync-стор одной формы, а `TState` выводится из
`initialState` без ручных дженериков.

## Использование

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
`client`** — на сервере она не подключится:

```typescript
import { browserStorage, LocalStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

storage: browserStorage(
  { name: 'draft', initialState },
  {
    client: (cfg) => new LocalStorage({
      ...cfg,
      middlewares: () => [syncBroadcastMiddleware({ storageType: 'localStorage', storageName: 'draft' })],
    }),
  },
),
```

## Опции

| Поле | Тип | Описание |
|---|---|---|
| `client` | `(config) => ISyncStorage<T>` | Клиентская фабрика sync-хранилища. Зовётся **только** в браузере. |
| `isServer?` | `() => boolean` | Переопределение проверки «сервер». По умолчанию `typeof window === 'undefined'`. |

## См. также

- [createSynapse (базовый)](./create-synapse-basic.md) — C-форма, куда передаётся фабрика.
- [SSR-гидрация](./ssr-hydration.md) — почему конструкция бежит на сервере.
- [LocalStorage](./local-storage.md) · [MemoryStorage](./memory-storage.md) — обе ветки `browserStorage`.
