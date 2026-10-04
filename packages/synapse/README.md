# Synapse Storage

[![npm version](https://img.shields.io/npm/v/synapse-storage)](https://www.npmjs.com/package/synapse-storage)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/synapse-storage)](https://bundlephobia.com/package/synapse-storage)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![RxJS](https://img.shields.io/badge/RxJS-optional%20(effects%20only)-red?logo=reactivex)](https://rxjs.dev/)

Framework-agnostic state management toolkit and API client for TypeScript applications.
Combines reactive storage, memoized selectors, Redux-Observable style effects, and a tag-based HTTP cache — all in one library.

## Quick Start

```bash
npm install synapse-storage
```

```typescript
// No rxjs, no react required — the root entry is the framework-agnostic core.
import { MemoryStorage, Selectors, Dispatcher, createSynapse } from 'synapse-storage'

class CounterDispatcher extends Dispatcher<{ count: number }> {
  inc = this.action((store) => store.update((s) => { s.count++ }))
}

class CounterSelectors extends Selectors<{ count: number }> {
  count = this.select((s) => s.count)
}

export const counter = createSynapse({
  storage: () => new MemoryStorage({ name: 'counter', initialState: { count: 0 } }),
  dispatcher: (s) => new CounterDispatcher(s),
  selectors: (s) => new CounterSelectors(s),
})
```

> **Two independent layers.** `synapse-storage/core` is the *State Manager* — reactive
> storages (`MemoryStorage`/`LocalStorage`/`IndexedDB`) and selectors, usable on their own.
> On top sits the *Business Logic Layer* — `Dispatcher` / `createSynapse` / `Effects`.
>
> **`rxjs` and `react` are truly optional peers.** The root entry (`synapse-storage`) needs neither:
> storages, selectors, `Dispatcher`, `createSynapse`, `createEventBus` and `ApiClient` work without them.
> React hooks live in `synapse-storage/react` (needs `react`); RxJS effects and operators live only in
> `synapse-storage/reactive` (needs `rxjs`). The package is tree-shakeable (`"sideEffects": false`):
> only what you import ends up in your bundle.
>
> Core streams (`selector.$`, `dispatcher.action$`, watchers, `synapse.state$`) are lightweight interop
> observables — `subscribe` works without RxJS; for operators use `toObservable(x)` (or rxjs `from(x)`).

## Key Features

- **Sync & Async Storage** — MemoryStorage, LocalStorage (synchronous), IndexedDB (async) with unified API
- **Selectors** — memoized computed values with dependency tracking
- **Immer-like Updates** — mutate state directly inside `update()` callbacks
- **API Client** — HTTP client with tag-based caching and invalidation
- **Persist Migrations** — `version` + `migrate(oldState, oldVersion)` for localStorage/IndexedDB
- **SSR Hydration** — `storage.hydrate(state)` to seed server-rendered state; `createSynapseCtx` + `dehydratedState` prop for seeded stores (SSR on by construction, no `ssr` flag); data-less "background" providers server-render on their own (synchronous C-form → auto `buildSyncShell`)
- **React Integration** — hooks on `useSyncExternalStore` (Concurrent Mode safe)
- **RxJS Effects (optional)** — Redux-Observable style effects in `synapse-storage/reactive`; the rest of the library doesn't need RxJS
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
import { Dispatcher, Selectors, MemoryStorage, createSynapse } from 'synapse-storage'
import { Effects, ofType, validateMap, fromRequest, apiResult } from 'synapse-storage/reactive' // rxjs

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

// — Assembly (C-form): synchronous core construction; all async lives in `effects` —
export const postsSynapse = createSynapse({
  storage: () => new MemoryStorage<PostsState>({ name: 'posts', initialState }),
  dispatcher: (s) => new PostsDispatcher(s),
  selectors:  (s) => new PostsSelectors(s, coreSynapse.selectors),     // cross-store DI, synchronous
  dependencies: [coreSynapse],                                         // gate for effects START
  effects: async () => new PostsEffects(await getPostsApi()),          // async resolves here
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
import { toObservable } from 'synapse-storage/reactive' // only for RxJS operators

// Pass the handle (not a call) — factory starts lazily on first Provider mount:
export const { contextSynapse: withPosts, useSynapseSelectors, useSynapseActions } =
  createSynapseCtx(postsSynapse, { loadingComponent: <Spinner /> })

// Reactive reads straight in the component (write still goes through actions).
// `useObservable(selectors.searchQuery.$, '')` works without RxJS; operators need toObservable:
const debounced = useObservable(() => toObservable(selectors.searchQuery).pipe(debounceTime(300), distinctUntilChanged()),
  '',
  [selectors],
)
useSubscription(() => toObservable(selectors.lastId).pipe(skip(1), tap(scrollToEnd)), [selectors])
```

### Reactive reads from a storage (controlled re-renders)

Mutate the store with ordinary methods (`set`/`update`) and read it reactively in a component.
Pick the tool by whether you need RxJS operators (only the last one needs `rxjs`):

```tsx
import { useStorageSubscribe, useStorageObservable } from 'synapse-storage/react'

// 1. Always re-render on change (canonical, RxJS-free, Concurrent-safe).
//    `equals` skips the re-render when the selected slice is unchanged.
const todos = useStorageSubscribe(storage, (s) => s.todos, { equals: (a, b) => a === b })

// 2. Stream path — same value via a stream subscription (no RxJS).
const userId = useStorageObservable(storage, (s) => s.user.id)

// 3. No re-render at all: read the latest value on demand (e.g. in an event handler).
const onSave = () => save(storage.getStateSync().count)
```

Control *when* a component re-renders through the `equals` of `useStorageSubscribe` (skip
re-renders while the slice is "equal"), or with RxJS operators (`filter`/`debounceTime`/…) via
`useObservable(() => toObservable(storage, sel).pipe(...), initial, [storage])`.

For non-React / effect usage, `toObservable(storage, selector?)` (from `synapse-storage/reactive`) turns a
storage into an RxJS `Observable` of the whole state (or a slice with `distinctUntilChanged` when a selector
is given); `toObservable(selector)` / `toObservable(stream)` do the same for selectors and core streams.

### Migration to v7 (rxjs and react become truly optional)

| Before (v6) | Now (v7) |
|---|---|
| `import { useSelector, createSynapseCtx } from 'synapse-storage'` | `from 'synapse-storage/react'` (the root no longer re-exports React) |
| `import { Effects, ofType, toObservable } from 'synapse-storage'` | `from 'synapse-storage/reactive'` (the root no longer re-exports the RxJS layer) |
| `selector.$.pipe(...)` | `toObservable(selector).pipe(...)` (or `from(selector.$)`) |
| `dispatcher.action$.pipe(...)`, `d.someWatcher().pipe(...)` | `toObservable(dispatcher.action$)`, `toObservable(d.someWatcher())` |
| `new XEffects(api, coreSynapse.state$)` (typed `Observable`) | `new XEffects(api, toObservable(coreSynapse.state$))` |
| `effects: () => [(action$, state$) => …]` (a bare function) | `effects: () => [createEffect((action$, state$) => …)]` — classes (`new XEffects()`) unchanged |

Core streams (`selector.$`, `dispatcher.action$`/`actions`, watchers, `synapse.state$`, `useSynapseState$()`,
the dispatcher middleware `actions$`) are now lightweight interop observables: `subscribe()` and
`Symbol.observable`, no `pipe`. `subscribe` works as before; `toObservable(x)` gives an RxJS `Observable`.

Finding the call sites: TypeScript reports
`Argument of type 'InteropObservable<CoreState>' is not assignable to parameter of type 'Observable<CoreState>'`,
but only for the **first** mismatching argument of a call — when one constructor gets two streams
(`new XEffects(a.state$, api, b.state$)`), the second shows up only after fixing the first. Search the code
instead: `grep -rn "\.state\$\|\.\$\.pipe\|action\$\.pipe" src`.
`toObservable(synapse.state$)` keeps the BehaviorSubject-like semantics (the current state on subscribe), so
`withLatestFrom(core$)` in effects works exactly as before (the stream semantics table is in the `toObservable` docs).

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
| `createFeatureSynapse` userland wrapper                     | built-in lazy handle from `createSynapse({ storage, … })` |
| `createSynapseCtx(getPostsSynapse())` (eager on import)     | `createSynapseCtx(postsSynapse)` (lazy handle)            |

## Documentation

Full documentation, API reference, and examples available on [GitHub](https://github.com/Vlad92msk/synapse).

## License

MIT
