# SSR-гидрация (hydrate)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HydrateExample.tsx)

`storage.hydrate(state)` заменяет состояние хранилища готовым снапшотом. Основной сценарий —
**SSR**: сервер сериализует состояние, клиент инициализирует им хранилище, чтобы избежать
мерцания и лишнего запроса данных.

- **Sync-хранилища** (`MemoryStorage`, `LocalStorage`): `hydrate(state): void`
- **Async-хранилища** (`IndexedDB`): `hydrate(state): Promise<void>`

## Гидрация до initialize()

Вызванная **до** `initialize()`, `hydrate` засевает хранилище так, что инициализация
не перезатирает его `initialState`-ом — серверное состояние побеждает.

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<AppState>({
  name: 'app',
  initialState: { user: null, items: [] },   // дефолт для «чистого» клиента
})

// На клиенте: данные пришли с сервера (window.__INITIAL_STATE__)
storage.hydrate(window.__INITIAL_STATE__)

await storage.initialize()   // initialState НЕ перезатрёт гидрированное состояние
```

## Гидрация после initialize()

Вызванная **после** `initialize()`, `hydrate` заменяет состояние и уведомляет подписчиков
(селекторы, React-хуки реактивно обновятся).

```typescript
await storage.initialize()

// позже, например при навигации между страницами в SPA с серверными данными
storage.hydrate(nextPageState)
// подписчики получат новое состояние
```

## С persist-миграциями

Если задана [`version`](./persist-migration.md), `hydrate` фиксирует текущую версию схемы:
серверный снапшот считается уже актуальным, миграция на нём не запускается.

## React / createSynapse

`hydrate` доступен на `synapse.storage` после сборки модуля:

```typescript
const synapse = await appSynapse.ready()
synapse.storage.hydrate(serverState)
```

Для Next.js удобно гидрировать в провайдере на первом рендере — до того как компоненты
подпишутся на селекторы.

## Типы

```typescript
interface ISyncStorage<T> {
  hydrate(state: T): void
  // ...
}

interface IAsyncStorage<T> {
  hydrate(state: T): Promise<void>
  // ...
}
```

## См. также

- [Persist-миграции](./persist-migration.md)
- [createSynapseCtx](./synapse-ctx.md)
