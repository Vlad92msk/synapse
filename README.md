# Synapse Storage

> **English** | [Русский](./docs/ru/README.md) | [📝 ChangeLog](./packages/synapse/CHANGELOG.md)

[![npm version](https://badge.fury.io/js/synapse-storage.svg)](https://badge.fury.io/js/synapse-storage)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/synapse-storage)](https://bundlephobia.com/package/synapse-storage)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![RxJS Version](https://img.shields.io/badge/RxJS-%5E7.8.2-red?logo=reactivex)](https://rxjs.dev/)

Framework-agnostic state management toolkit and API client for TypeScript applications.
Combines reactive storage, memoized selectors, Redux-Observable style effects, and a tag-based HTTP cache — all in one library.

## Quick Start

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

> **Synapse is two layers:** reactive **storages** (State Manager) and a **business-logic
> layer** on top (Dispatcher / Effects / createSynapse). The two are independent — take
> only `synapse-storage/core` for storage, add the BL layer when you need actions, effects
> and assembly.

## Key Features

- **Sync & Async Storage** — MemoryStorage, LocalStorage (synchronous), IndexedDB (async) with unified API
- **Selectors** — memoized computed values with dependency tracking
- **Immer-like Updates** — mutate state directly inside `update()` callbacks
- **API Client** — HTTP client with tag-based caching and invalidation
- **React Integration** — hooks on `useSyncExternalStore` (Concurrent Mode safe)
- **RxJS Effects** — dispatchers, effects, and watchers (Redux-Observable style)
- **Middleware & Plugins** — extensible sync/async pipelines
- **EventBus** — decoupled inter-module communication with wildcards
- **Cross-tab Sync** — BroadcastChannel middleware for multi-tab state

## Documentation

### Storage

| Topic                                                   | Description                         |
|---------------------------------------------------------|-------------------------------------|
| [MemoryStorage](./docs/en/memory-storage.md)            | In-memory storage, synchronous API  |
| [LocalStorage](./docs/en/local-storage.md)              | Persistent storage via localStorage |
| [IndexedDB Storage](./docs/en/indexeddb-storage.md)     | Async storage for large data        |
| [StorageFactory](./docs/en/storage-factory.md)          | Create storages dynamically         |
| [Static .create()](./docs/en/static-create.md)          | Alternative creation pattern        |

### React Hooks

| Topic                                                                  | Description                 |
|------------------------------------------------------------------------|-----------------------------|
| [useCreateStorage (Memory)](./docs/en/hook-memory.md)                  | Hook for MemoryStorage      |
| [useCreateStorage (LocalStorage)](./docs/en/hook-local-storage.md)     | Hook for LocalStorage       |
| [useCreateStorage (IndexedDB)](./docs/en/hook-indexeddb.md)            | Hook for IndexedDB          |
| [createSynapseCtx](./docs/en/synapse-ctx.md)                          | React context integration   |
| [awaitSynapse](./docs/en/await-synapse.md)                            | Async synapse in components |

### Working with Data

| Topic                                                                   | Description                |
|-------------------------------------------------------------------------|----------------------------|
| [Reading Data](./docs/en/reading-data.md)                               | get, getState, selectors   |
| [Writing Data](./docs/en/writing-data.md)                               | set, update (Immer-like)   |
| [Delete / Has / Keys / Clear / Reset](./docs/en/delete-has-keys.md)     | Storage operations         |
| [Subscriptions](./docs/en/subscriptions.md)                             | Subscribe to state changes |
| [Selectors](./docs/en/selector-system.md)                              | Memoized derived state     |

### Synapse (createSynapse)

| Topic                                                           | Description                |
|-----------------------------------------------------------------|----------------------------|
| [Basic](./docs/en/create-synapse-basic.md)                      | Storage + selectors        |
| [Dispatcher](./docs/en/create-synapse-dispatcher.md)            | Actions and reducers       |
| [Effects](./docs/en/create-synapse-effects.md)                  | RxJS side effects          |
| [Dispatcher (standalone)](./docs/en/dispatcher-detailed.md)     | Dispatcher API in detail   |
| [Dependencies](./docs/en/dependencies.md)                      | Inter-synapse dependencies |
| [Pokemon Example](./docs/en/pokemon-advanced.md)                | Full working example       |

### Patterns & Utilities

| Topic                                                    | Description                            |
|----------------------------------------------------------|----------------------------------------|
| [Middlewares](./docs/en/middlewares.md)                   | Intercept read/write operations        |
| [Plugins](./docs/en/plugins.md)                          | Extend storage lifecycle               |
| [Singleton](./docs/en/singleton.md)                      | Shared instances with merge strategies |
| [ApiClient](./docs/en/api-client.md)                     | HTTP client with tag-based cache       |
| [createSynapseAwaiter](./docs/en/synapse-awaiter.md)     | Await multiple synapses                |
| [createEventBus](./docs/en/event-bus.md)                 | Decoupled event communication          |

## Examples

Examples are located in [`packages/examples/src/examples`](./packages/examples/src/examples).

## Author

**Vladislav** — Senior Frontend Developer (React, TypeScript)

[GitHub](https://github.com/Vlad92msk/) | [LinkedIn](https://www.linkedin.com/in/vlad-firsov/)

---

*PS: Not recommended for production use yet as I develop this in my free time.
The library works in general, but I can provide guarantees only after full integration into my pet project - Social Network.
This won't happen before changing my current workplace and country of residence*

## License

MIT
