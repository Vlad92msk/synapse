# Install

> [Back to contents](./README.md)

One package — `synapse-storage`. The core pulls in no extra dependencies: `rxjs` and `react` are
only needed if you use the matching layer.

## Installing the package

```bash
# npm
npm install synapse-storage

# yarn
yarn add synapse-storage

# pnpm
pnpm add synapse-storage
```

## Optional peer dependencies

Install them as needed — only for the layers you actually use:

```bash
# effects on RxJS (the synapse-storage/reactive layer)
npm install rxjs

# React hooks and SSR (the synapse-storage/react layer)
npm install react react-dom
```

> Need only the reactive store (`MemoryStorage`, selectors, dispatcher)? A single `synapse-storage`
> is enough — no `rxjs`, no `react`.

## Imports by layer (sub-entrypoints)

The library is split into sub-packages so that only what you need ends up in the bundle. Import from
a specific layer, not from the root:

```typescript
import { MemoryStorage, LocalStorage, Selectors } from 'synapse-storage/core'
import { Dispatcher, createEffect } from 'synapse-storage/reactive'
import { useStorageSubscribe, createSynapseCtx } from 'synapse-storage/react'
import { createSynapse, createEventBus } from 'synapse-storage/utils'
import { ApiClient } from 'synapse-storage/api'
```

| Entrypoint | What's inside | Requires |
|---|---|---|
| `synapse-storage/core` | Storages (`MemoryStorage`, `LocalStorage`, `IndexedDBStorage`), middleware, selectors | — |
| `synapse-storage/reactive` | Dispatchers (`Dispatcher`) and Redux-Observable-style effects | `rxjs` |
| `synapse-storage/react` | React hooks (`useStorageSubscribe`) and the SSR wrapper (`createSynapseCtx`) | `react`, `react-dom` |
| `synapse-storage/utils` | `createSynapse`, `createEventBus`, `createSynapseAwaiter`, `dehydrateModule` | — |
| `synapse-storage/api` | HTTP client with tag-based caching | — |

> The package is **ESM-only** (`"type": "module"`). CommonJS `require` is not supported.

## See also

- [createSynapse (basic)](./create-synapse-basic.md) — where to start assembling a module.
- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) — your first storages.
