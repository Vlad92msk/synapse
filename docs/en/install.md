# Install

> [Back to contents](./README.md)

One package — `synapse-storage`. It has no dependencies of its own: `react` and `rxjs` are optional
peer dependencies, and the package is tree-shakeable (`"sideEffects": false`) — only what you import
ends up in your bundle. `rxjs` is needed only for the effects layer (`synapse-storage/reactive`).

## Installing the package

```bash
# npm
npm install synapse-storage

# yarn
yarn add synapse-storage

# pnpm
pnpm add synapse-storage
```

## Peer dependencies

```bash
# React hooks and SSR (the synapse-storage/react layer)
npm install react react-dom

# Only if you write effects (synapse-storage/reactive): Effects, ofType, validateMap, toObservable…
npm install rxjs
```

**`rxjs` is truly optional.** Everything except the effects layer works without it — install it only
when you write `Effects`:

- **without `rxjs`:** storages (`MemoryStorage`, `LocalStorage`, `IndexedDBStorage`, `WorkerCacheStorage`)
  and their middleware, `Selectors`, `Dispatcher`, `createSynapse`, `createSynapseCtx`/`awaitSynapse`,
  `createEventBus`, `ApiClient`, and all React hooks (`useSelector`, `useStorageSubscribe`, `useStorage`,
  `useApiQuery`, `useApiMutation`, `useObservable`, `useSubscription`, `useStorageObservable`);
- **with `rxjs`:** only `synapse-storage/reactive` — `Effects`, the operators (`ofType`, `validateMap`,
  `mutationMap`, `apiResult`, …), `fromRequest`, `toObservable`.

Core streams (`selector.$`, `dispatcher.action$`, watchers, `synapse.state$`) are lightweight
*interop* observables: they have `subscribe()` and `Symbol.observable`, but no `pipe`. Subscribe to them
directly, or turn them into an RxJS `Observable` with `toObservable(x)` (from `synapse-storage/reactive`)
or rxjs `from(x)`:

```typescript
import { toObservable } from 'synapse-storage/reactive'

selectors.query.$.subscribe((q) => console.log(q)) // no rxjs needed
toObservable(selectors.query).pipe(debounceTime(300)) // with rxjs operators
```

## Imports by layer (sub-entrypoints)

The root import (`synapse-storage`) is the framework-agnostic core — it needs **neither `rxjs` nor
`react`** and is tree-shakeable. Optional peers live only in their own entrypoints: a bundler resolves
every import of an entry point's modules *before* tree-shaking, so an entry that mentioned `react` or
`rxjs` would fail to build without them.

```typescript
import { MemoryStorage, Selectors, Dispatcher, createSynapse, ApiClient } from 'synapse-storage'
import { useSelector, createSynapseCtx } from 'synapse-storage/react' // requires react
import { Effects, ofType, validateMap, toObservable } from 'synapse-storage/reactive' // requires rxjs
```

| Entrypoint | What's inside | Requires |
|---|---|---|
| `synapse-storage` | `core` + `dispatcher` + `utils` + `api` | — |
| `synapse-storage/core` | Storages (`MemoryStorage`, `LocalStorage`, `IndexedDBStorage`, `WorkerCacheStorage`), middleware, selectors | — |
| `synapse-storage/dispatcher` | `Dispatcher`, `ApiStatus`, dispatcher middleware | — |
| `synapse-storage/utils` | `createSynapse`, `createEventBus`, `createSynapseAwaiter`, `dehydrateModule` | — |
| `synapse-storage/react` | React hooks and the SSR wrapper (`createSynapseCtx`) | `react`, `react-dom` |
| `synapse-storage/api` | HTTP client with tag-based caching | — |
| `synapse-storage/reactive` | Redux-Observable-style effects + RxJS operators (also re-exports `Dispatcher`) | `rxjs` |

> The package is **ESM-only** (`"type": "module"`). CommonJS `require` is not supported.

## See also

- [createSynapse (basic)](./create-synapse-basic.md) — where to start assembling a module.
- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) — your first storages.
