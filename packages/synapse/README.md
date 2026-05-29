# Synapse Storage

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

Full documentation, API reference, and examples available on [GitHub](https://github.com/Vlad92msk/synapse).

## License

MIT
