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

## Class-based BL layer (v4.2+)

Since `4.2.0` modules can be described with four thin classes over the same engines.
Action / selector names come from **field names**, API lifecycles are **callable groups**,
and assembly is a **lazy singleton handle**. The old `createSynapse(config)` form keeps
working unchanged — both forms are interoperable in each other's `dependencies`.

```typescript
import { Dispatcher, Effects, ofType, validateMap, fromRequest, apiResult } from 'synapse-storage/reactive'
import { Selectors, MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage'

// — Dispatcher: action name = field name. apiActions returns a CALLABLE group —
class PostsDispatcher extends Dispatcher<PostsState> {
  // d.loadPosts(params) = init intent; d.loadPosts.loading/.success/.failure/.reset = lifecycle
  readonly loadPosts  = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)
  readonly mounted    = this.signal<FeedPayload>('Feed mounted')        // pure signal
  readonly applyPosts = this.action((store, page: PostsPage) =>          // (storage, params) => result
    store.update((s) => { s.list = page.data }))
}

// — Selectors: eager fields, cross-store deps via constructor —
class PostsSelectors extends Selectors<PostsState> {
  constructor(storage: IStorage<PostsState>, private readonly core: CoreSelectors) { super(storage) }
  private readonly api    = this.select((s) => s.api)                    // private = intermediate
  readonly list           = this.select((s) => s.list)
  readonly isPostsLoading = this.combine([this.api], (a) => a.postsRequest.status === 'loading')
  readonly currentUserId  = this.combine([this.core.profile], (p) => p?.id ?? null) // cross-store
}

// — Effects: services/external stores via constructor, captured in the closure —
class PostsEffects extends Effects<PostsState, PostsDispatcher> {
  constructor(private readonly api: PostsEndpoints) { super() }
  readonly load = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadPosts),                                              // catches ONLY init
      validateMap({
        loadingAction: () => d.loadPosts.loading(),
        errorAction: (e) => d.loadPosts.failure(String(e)),
        apiCall: ([action]) => fromRequest(this.api.getPosts.request(action.payload)).pipe(
          apiResult((page) => { d.applyPosts(page); d.loadPosts.success() }),
        ),
      }),
    ))
  override onDestroy() { /* close sockets etc. */ }
}

// — Assembly: lazy singleton handle. Factory runs once on first await/ready(), not on import —
export const postsSynapse = createSynapse(async () => {
  const core = await coreSynapse                                        // handle is thenable
  const storage = new MemoryStorage<PostsState>({ name: 'posts', initialState })
  return {
    storage,
    dependencies: [core],
    dispatcher: new PostsDispatcher(storage),
    selectors:  new PostsSelectors(storage, core.selectors),
    effects:    new PostsEffects(api),
  }
})

const { storage, state$, dispatcher, actions, selectors } = await postsSynapse
```

### Rules to keep in mind

- **`ofType(d.loadPosts)` matches only `init`.** To react to a result, listen explicitly:
  `ofType(d.loadPosts.success)`.
- **Services only in closures.** A constructor service (`this.api`) may be captured inside
  the `this.effect(fn)` recipe, but not dereferenced in a field initializer — parameter
  properties are assigned *after* derived-class field initializers run.
- **Reserved field names** (`storage`, `action$`, `actions`, `dispatch`, `watchers`, `use`,
  `destroy`) cannot be used for actions; a field-alias (one action under two names) is
  rejected at finalization with a clear error.
- **Cross-store eager selectors** require `useDefineForClassFields: false` (so field
  initializers run after parameter-property assignment), or initialize those selectors in
  the constructor body.

### React

```tsx
import { createSynapseCtx, useObservable, useSubscription } from 'synapse-storage/react'

// Pass the handle (not a call) — factory starts lazily on first Provider mount:
export const { contextSynapse: withPosts, useSynapseSelectors, useSynapseActions } =
  createSynapseCtx(postsSynapse, { loadingComponent: <Spinner /> })

// Reactive reads straight in the component (write still goes through actions):
const debounced = useObservable(() => selectors.searchQuery.$.pipe(debounceTime(300), distinctUntilChanged()),
  '',
  [selectors],
)
useSubscription(() => selectors.lastId.$.pipe(skip(1), tap(scrollToEnd)), [selectors])
```

### Migration: `createSynapse(config)` → `createSynapse(factory)`

The migration is mechanical and per-file — convert one module, leave the rest on the old
form (cross-dependencies stay compatible). See the full `pokemon-class` example in
`packages/examples` (next to the functional `pokemon-advanced`).

| Old (functional)                                            | New (class-based)                                         |
|-------------------------------------------------------------|-----------------------------------------------------------|
| `defineAction<S>()` + `createDispatcher(...)` registry      | fields on `class extends Dispatcher<S>`                   |
| `createApiActions` flattened into 5 keys by hand            | one `this.apiActions(accessor)` callable group            |
| `dispatcher.dispatch.loadPostsLoading()`                    | `d.loadPosts.loading()`                                   |
| `createSelectorsFn: (s) => ({ ... })`                       | fields on `class extends Selectors<S>`                    |
| external selectors typed twice (value + manual type)        | a constructor parameter (`private core: CoreSelectors`)   |
| 6-slot `Effect<...>` generics + `services`/`externalStates` | `class extends Effects<S, D, Ext?>`, deps via constructor |
| `createFeatureSynapse` userland wrapper                     | built-in lazy handle from `createSynapse(factory)`        |
| `createSynapseCtx(getPostsSynapse())` (eager on import)     | `createSynapseCtx(postsSynapse)` (lazy handle)            |

## Documentation

Full documentation, API reference, and examples available on [GitHub](https://github.com/Vlad92msk/synapse).

## License

MIT
