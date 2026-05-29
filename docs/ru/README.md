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
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { useSelector } from 'synapse-storage/react'

const synapse = createSynapse({
  storage: new MemoryStorage({
    name: 'counter',
    initialState: { count: 0 },
  }),
  createSelectorsFn: (s) => ({
    count: s.createSelector((state) => state.count),
  }),
})
```

## Ключевые возможности

- **Sync & Async хранилища** — MemoryStorage, LocalStorage (синхронные), IndexedDB (async) с единым API
- **Селекторы** — мемоизированные вычисляемые значения с отслеживанием зависимостей
- **Immer-like обновления** — мутация state напрямую внутри `update()`
- **API-клиент** — HTTP-клиент с кэшированием и инвалидацией на основе тегов
- **React интеграция** — хуки на `useSyncExternalStore` (Concurrent Mode safe)
- **RxJS эффекты** — диспетчеры, эффекты и watchers (стиль Redux-Observable)
- **Middleware и плагины** — расширяемые sync/async пайплайны
- **EventBus** — декаплинг межмодульного общения с wildcard-паттернами
- **Cross-tab синхронизация** — BroadcastChannel middleware для multi-tab state

## Документация

### Хранилища

| Тема                                                    | Описание                                |
|---------------------------------------------------------|-----------------------------------------|
| [MemoryStorage](./memory-storage.md)                    | In-memory хранилище, синхронный API     |
| [LocalStorage](./local-storage.md)                      | Персистентное хранилище через localStorage |
| [IndexedDB Storage](./indexeddb-storage.md)             | Async хранилище для больших данных      |
| [StorageFactory](./storage-factory.md)                  | Динамическое создание хранилищ          |
| [Статический .create()](./static-create.md)             | Альтернативный паттерн создания         |

### React хуки

| Тема                                                                   | Описание                    |
|------------------------------------------------------------------------|-----------------------------|
| [useCreateStorage (Memory)](./hook-memory.md)                          | Хук для MemoryStorage       |
| [useCreateStorage (LocalStorage)](./hook-local-storage.md)             | Хук для LocalStorage        |
| [useCreateStorage (IndexedDB)](./hook-indexeddb.md)                    | Хук для IndexedDB           |
| [createSynapseCtx](./synapse-ctx.md)                                  | React context интеграция    |
| [awaitSynapse](./await-synapse.md)                                    | Async synapse в компонентах |

### Работа с данными

| Тема                                                                    | Описание                       |
|-------------------------------------------------------------------------|--------------------------------|
| [Чтение данных](./reading-data.md)                                      | get, getState, селекторы       |
| [Запись данных](./writing-data.md)                                       | set, update (Immer-like)       |
| [Удаление / Has / Keys / Clear / Reset](./delete-has-keys.md)           | Операции с хранилищем          |
| [Подписки](./subscriptions.md)                                          | Подписка на изменения state    |
| [Селекторы](./selector-system.md)                                       | Мемоизированный derived state  |

### Synapse (createSynapse)

| Тема                                                            | Описание                     |
|-----------------------------------------------------------------|------------------------------|
| [Базовый](./create-synapse-basic.md)                            | Storage + селекторы          |
| [Dispatcher](./create-synapse-dispatcher.md)                    | Экшены и редюсеры            |
| [Effects](./create-synapse-effects.md)                          | RxJS side effects            |
| [Dispatcher (standalone)](./dispatcher-detailed.md)             | Dispatcher API подробно      |
| [Зависимости](./dependencies.md)                                | Межмодульные зависимости     |
| [Pokemon пример](./pokemon-advanced.md)                         | Полный рабочий пример        |

### Паттерны и утилиты

| Тема                                                     | Описание                                   |
|----------------------------------------------------------|--------------------------------------------|
| [Middlewares](./middlewares.md)                           | Перехват операций чтения/записи            |
| [Плагины](./plugins.md)                                  | Расширение жизненного цикла хранилища      |
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
