# Synapse Storage

> **Русский** | [English](../../packages/synapse/README.md) | [📝 ChangeLog](../../packages/synapse/CHANGELOG.md)

Тулкит для управления состоянием + API-клиент

[![npm version](https://badge.fury.io/js/synapse-storage.svg)](https://badge.fury.io/js/synapse-storage)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/synapse-storage)](https://bundlephobia.com/package/synapse-storage)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![RxJS Version](https://img.shields.io/badge/RxJS-%5E7.8.2-red?logo=reactivex)](https://rxjs.dev/)

Фреймворк-агностик тулкит для управления состоянием и API-клиент для TypeScript-приложений.
Объединяет реактивные хранилища, мемоизированные селекторы, эффекты в стиле Redux-Observable и HTTP-кэш на основе тегов — всё в одной библиотеке.

## Быстрый старт

```bash
npm install synapse-storage
```

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { Dispatcher } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'

class CounterDispatcher extends Dispatcher<{ count: number }> {
  inc = this.action((store) => store.update((s) => { s.count++ }))
}

class CounterSelectors extends Selectors<{ count: number }> {
  count = this.select((s) => s.count)
}

export const counter = createSynapse(async () => {
  const storage = new MemoryStorage({ name: 'counter', initialState: { count: 0 } })
  return {
    storage,
    dispatcher: new CounterDispatcher(storage),
    selectors: new CounterSelectors(storage),
  }
})
```

> **Synapse — это два слоя:** реактивные **хранилища** (State Manager) и **слой
> бизнес-логики** поверх них (Dispatcher / Effects / createSynapse). Начните с
> [**Архитектуры: два слоя**](./architecture.md) — это ключ к ментальной модели.

## Ключевые возможности

- **Sync & Async хранилища** — MemoryStorage, LocalStorage (синхронные), IndexedDB (async) с единым API
- **Селекторы** — мемоизированные вычисляемые значения с отслеживанием зависимостей
- **Immer-like обновления** — мутация state напрямую внутри `update()`
- **API-клиент** — HTTP-клиент с кэшированием и инвалидацией на основе тегов
- **Persist-миграции** — `version` + `migrate(oldState, oldVersion)` для localStorage/IndexedDB
- **SSR-гидрация** — `storage.hydrate(state)` для серверного состояния
- **React интеграция** — хуки на `useSyncExternalStore` (Concurrent Mode safe), с поддержкой **SSR** (`createSynapseCtx({ ssr: true })` + `dehydrate`)
- **RxJS эффекты** — диспетчеры, эффекты и watchers (стиль Redux-Observable)
- **Middleware** — расширяемые sync/async пайплайны (batching, shallowCompare, logger, broadcast)
- **EventBus** — декаплинг межмодульного общения с wildcard-паттернами
- **Cross-tab синхронизация** — BroadcastChannel middleware для multi-tab state

## Документация

### Концепция

| Тема                                          | Описание                                            |
|-----------------------------------------------|-----------------------------------------------------|
| [Архитектура: два слоя](./architecture.md)    | State Manager vs Business Logic Layer — с этого начать |

### Хранилища

| Тема                                                    | Описание                                |
|---------------------------------------------------------|-----------------------------------------|
| [MemoryStorage](./memory-storage.md)                    | In-memory хранилище, синхронный API     |
| [LocalStorage](./local-storage.md)                      | Персистентное хранилище через localStorage |
| [IndexedDB Storage](./indexeddb-storage.md)             | Async хранилище для больших данных      |
| [StorageFactory](./storage-factory.md)                  | Динамическое создание хранилищ          |
| [Статический .create()](./static-create.md)             | Альтернативный паттерн создания         |
| [Persist-миграции](./persist-migration.md)              | `version` + `migrate` для смены схемы    |
| [SSR-гидрация](./ssr-hydration.md)                      | `hydrate(state)` для серверного состояния |

### React хуки

| Тема                                                                   | Описание                    |
|------------------------------------------------------------------------|-----------------------------|
| [useCreateStorage (Memory)](./hook-memory.md)                          | Хук для MemoryStorage       |
| [useCreateStorage (LocalStorage)](./hook-local-storage.md)             | Хук для LocalStorage        |
| [useCreateStorage (IndexedDB)](./hook-indexeddb.md)                    | Хук для IndexedDB           |
| [createSynapseCtx](./synapse-ctx.md)                                  | React context интеграция + SSR (`ssr`, `dehydrate`) |
| [awaitSynapse](./await-synapse.md)                                    | Async synapse в компонентах |

### Работа с данными

| Тема                                                                    | Описание                       |
|-------------------------------------------------------------------------|--------------------------------|
| [Чтение данных](./reading-data.md)                                      | get, getState, селекторы       |
| [Запись данных](./writing-data.md)                                       | set, update (Immer-like)       |
| [Удаление / Has / Keys / Clear / Reset](./delete-has-keys.md)           | Операции с хранилищем          |
| [Подписки](./subscriptions.md)                                          | Подписка на изменения state    |
| [Селекторы](./selector-system.md)                                       | Мемоизированный derived state  |

### Business Logic Layer (class-based)

| Тема                                                            | Описание                                  |
|-----------------------------------------------------------------|-------------------------------------------|
| [Базовая сборка](./create-synapse-basic.md)                     | `createSynapse(factory)` + storage + селекторы |
| [Dispatcher](./create-synapse-dispatcher.md)                    | `class extends Dispatcher` — намерения и апдейты |
| [Effects](./create-synapse-effects.md)                          | `class extends Effects` — RxJS side effects |
| [Dispatcher (подробно)](./dispatcher-detailed.md)               | action / signal / apiActions / watcher    |
| [Зависимости и cross-store](./dependencies.md)                  | межмодульные связи, 4 способа общения      |
| [Pokemon пример](./pokemon-advanced.md)                         | полный рабочий модуль                      |

### Паттерны и утилиты

| Тема                                                     | Описание                                   |
|----------------------------------------------------------|--------------------------------------------|
| [Middlewares](./middlewares.md)                           | Перехват операций чтения/записи            |
| [Singleton](./singleton.md)                              | Общие экземпляры с merge-стратегиями       |
| [ApiClient](./api-client.md)                             | HTTP-клиент с кэшем на основе тегов        |
| [createSynapseAwaiter](./synapse-awaiter.md)             | Ожидание нескольких synapse                |
| [createEventBus](./event-bus.md)                         | Декаплинг событийного общения              |

## Примеры

Примеры находятся в [`packages/examples/src/examples`](../../packages/examples/src/examples).

## Автор

**Vladislav** — Senior Frontend Developer (React, TypeScript)

[GitHub](https://github.com/Vlad92msk/) | [LinkedIn](https://www.linkedin.com/in/vlad-firsov/)

---

*PS: Пока не рекомендуется для продакшена, так как я разрабатываю это в свободное время.
Библиотека работает в целом, но гарантии смогу дать только после полной интеграции в мой пет-проект — Social Network.
Это произойдёт не раньше смены текущего места работы и страны проживания.*

## Лицензия

MIT
