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

> **Two independent layers.** `synapse-storage/core` is the *State Manager* — reactive
> storages (`MemoryStorage`/`LocalStorage`/`IndexedDB`) and selectors, usable on their own.
> On top sits the *Business Logic Layer* — `Dispatcher` / `Effects` / `createSynapse`.
> `rxjs` and `react` are optional peers: take only what you use.

## Key Features

- **Sync & Async Storage** — MemoryStorage, LocalStorage (synchronous), IndexedDB (async) with unified API
- **Selectors** — memoized computed values with dependency tracking
- **Immer-like Updates** — mutate state directly inside `update()` callbacks
- **API Client** — HTTP client with tag-based caching and invalidation
- **Persist Migrations** — `version` + `migrate(oldState, oldVersion)` for localStorage/IndexedDB
- **SSR Hydration** — `storage.hydrate(state)` to seed server-rendered state
- **React Integration** — hooks on `useSyncExternalStore` (Concurrent Mode safe)
- **RxJS Effects** — dispatchers, effects, and watchers (Redux-Observable style)
- **Middleware** — extensible sync/async pipelines (batching, shallowCompare, logger, broadcast)
- **EventBus** — decoupled inter-module communication with wildcards
- **Cross-tab Sync** — BroadcastChannel middleware for multi-tab state

## Class-based modules

A module is four thin classes over the same engines. Action / selector names come from
**field names**, API lifecycles are **callable groups**, and assembly is a **lazy singleton
handle**.

> **v5 note.** The functional API (`createSynapse(config)`, `defineAction`,
> `createDispatcher`, `createApiActions`, `createSelectorsFn`) was removed in **v5.0.0**.
> Class-based modules are the only form. On v4.x both forms coexist — see the migration
> table below.

```typescript
import { Dispatcher, Effects, ofType, validateMap, fromRequest, apiResult } from 'synapse-storage/reactive'
import { Selectors, MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage'

// — Dispatcher: action name = field name. apiActions returns a CALLABLE group —
class PostsDispatcher extends Dispatcher<PostsState> {
  // d.loadPosts(params) = init intent; d.loadPosts.loading/.success/.failure/.reset = lifecycle
   loadPosts  = this.apiActions<PostsFindAllParams>((s) => s.api.postsRequest)
   mounted    = this.signal<FeedPayload>('Feed mounted')        // pure signal
   applyPosts = this.action((store, page: PostsPage) =>          // (storage, params) => result
    store.update((s) => { s.list = page.data }))
}

// — Selectors: eager fields, cross-store deps via constructor —
class PostsSelectors extends Selectors<PostsState> {
  constructor(storage: IStorage<PostsState>, private  core: CoreSelectors) { super(storage) }
  private readonly api    = this.select((s) => s.api)                    // private = intermediate
   list                   = this.select((s) => s.list)
   isPostsLoading         = this.combine([this.api], (a) => a.postsRequest.status === 'loading')
   currentUserId          = this.combine([this.core.profile], (p) => p?.id ?? null) // cross-store
}

// — Effects: services/external stores via constructor, captured in the closure —
class PostsEffects extends Effects<PostsState, PostsDispatcher> {
  constructor(private  api: PostsEndpoints) { super() }
   load = this.effect((action$, state$, { dispatcher: d }) =>
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

### Reactive reads from a storage (controlled re-renders)

Mutate the store with ordinary methods (`set`/`update`) and read it reactively in a component.
Pick the hook by how much control over re-renders you need:

```tsx
import { useStorageSubscribe, useStorageObservable, useStorageRef } from 'synapse-storage/react'

// 1. Always re-render on change (canonical, RxJS-free, Concurrent-safe).
//    `equals` skips the re-render when the selected slice is unchanged.
const todos = useStorageSubscribe(storage, (s) => s.todos, { equals: (a, b) => a === b })

// 2. RxJS path — same, but you can pipe operators. Memoizes the observable for you,
//    so no extra re-subscribes (don't inline `toObservable(storage)` in render).
const userId = useStorageObservable(storage, (s) => s.user.id)

// 3. You control the re-renders. The ref always holds the fresh value; nothing
//    re-renders unless you ask.
const { ref, get, rerender } = useStorageRef(storage, (s) => s.count)
//   - "no re-render at all":      read get() inside an event handler
//   - "re-render when I decide":  call rerender()
//   - "re-render conditionally":  useStorageRef(storage, sel, { shouldRerender: (prev, next) => ... })
```

For non-React / effect usage, `toObservable(storage, selector?)` turns a storage into an
`Observable` of the whole state (or a slice with `distinctUntilChanged` when a selector is given).

### Migration from v4 (functional → class-based)

On v4.x the migration is mechanical and per-file — convert one module, leave the rest on
the old form (cross-dependencies stay compatible). In v5.0.0 the functional form is gone.
See the full `pokemon-class` example in `packages/examples` (next to the functional
`pokemon-advanced`).

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
