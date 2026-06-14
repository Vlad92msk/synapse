# Two layers: State Manager and Business Logic Layer

> [Back to Main](../../README.md)

Synapse is not "yet another state manager". It is **two independent layers**, and they are
best understood separately:

```
synapse-storage
│
├── State Manager        ← "where the state lives"
│   └── synapse-storage/core
│       MemoryStorage · LocalStorage · IndexedDB · IStorage
│       selectors (Selectors / SelectorModule)
│
└── Business Logic Layer ← "how business logic manages the state"
    └── synapse-storage/reactive · /utils · /react
        Dispatcher · Effects · createSynapse · React hooks
```

## Layer 1. State Manager — "where the state lives"

These are the reactive **storages**. They answer a single question: *how to store state and
subscribe to its changes*. A unified `IStorage<T>` interface over three implementations:

| Storage         | When                                          |
|-----------------|-----------------------------------------------|
| `MemoryStorage` | session-scoped state (most features)          |
| `LocalStorage`  | synchronous persistence (settings, theme)     |
| `IndexedDB`     | asynchronous large data (cache, offline)      |

This layer also includes **selectors** — memoized derived state on top of a storage (like
`reselect`, but with cross-store dependencies and a reactive `selector.$`).

**This layer is self-sufficient.** You can take only `synapse-storage/core` without pulling
in anything from the business logic:

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage({ name: 'counter', initialState: { count: 0 } })
await storage.initialize()

storage.subscribe((s) => s.count, (count) => console.log(count))
storage.update((s) => { s.count++ })   // Immer-like
```

No RxJS, no effects, no React — just a reactive storage.

## Layer 2. Business Logic Layer — "how logic manages the state"

On top of a storage, the BL layer describes the **application's behavior**: which intents
(actions) exist, how they change the state, and which network/reactive side effects they
trigger. Three thin classes over the same engines:

| Class           | Role                                                          |
|-----------------|---------------------------------------------------------------|
| `Dispatcher`    | intents and store updates. Action name = class field name     |
| `Selectors`     | derived state (lives in the State Manager, but usually written alongside) |
| `Effects`       | side effects on RxJS (Redux-Observable style): network, sockets |
| `createSynapse` | the "module" assembler — wires up storage, dispatcher, selectors and effects |

This is **Synapse in the full sense** — the business logic management layer, whose shape
resembles NestJS services/controllers: a class, dependencies through the constructor,
field-methods. But without a heavy DI container — what's needed is the **shape**, not an IoC
mechanism.

```typescript
import { Dispatcher, Effects, ofType, validateMap, fromRequest, apiResult } from 'synapse-storage/reactive'
import { Selectors, MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

// Intents and store updates. Action name = field name.
class PostsDispatcher extends Dispatcher<PostsState> {
  loadPosts = this.apiActions<PostsParams>((s) => s.api.postsRequest) // callable group
  applyPosts = this.action((store, page: Page) => store.update((s) => { s.list = page.data }))
}

// Derived state. Fields are real SelectorAPI right away (eager).
class PostsSelectors extends Selectors<PostsState> {
  list = this.select((s) => s.list)
  isLoading = this.combine([this.list], () => /* ... */ false)
}

// Side effects. Services — through the constructor, captured in the closure.
class PostsEffects extends Effects<PostsState, PostsDispatcher> {
  constructor(private api: PostsApi) { super() }

  loadPosts = this.effect((action$, _state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadPosts),
      validateMap({
        loadingAction: () => d.loadPosts.loading(),
        errorAction: (e) => d.loadPosts.failure(String(e)),
        apiCall: ([a]) => fromRequest(this.api.getPosts(a.payload)).pipe(
          apiResult((page) => { d.applyPosts(page); d.loadPosts.success() }),
        ),
      }),
    ),
  )
}

// Module assembly — a lazy singleton handle.
export const postsSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<PostsState>({ name: 'posts', initialState })
  return {
    storage,
    dispatcher: new PostsDispatcher(storage),
    selectors: new PostsSelectors(storage),
    effects: new PostsEffects(await getPostsApi()),
  }
})
```

## Why this separation matters

1. **Take only what you need.** Need just a reactive IndexedDB cache — take the
   State Manager and don't pull in RxJS. Need a full module with networking — add the BL
   layer. `rxjs`/`react` are optional peer dependencies for exactly this reason.

2. **Responsibility boundary.** The State Manager knows nothing about intents and networking;
   the BL layer knows nothing about *how* the state is physically stored. Swap `MemoryStorage`
   for `IndexedDB` — the business logic stays untouched.

3. **Testability.** A storage is tested as a data structure. A dispatcher — as a set of pure
   transitions. An effect — in isolation: `new PostsEffects(mockApi).loadPosts(action$, state$, ctx)`
   without spinning up the whole synapse.

4. **Mental model = NestJS.** `createSynapse` is a "module", dispatcher/effects are
   "services". A familiar shape for those coming from the backend, without the cost of a
   full-blown DI.

## Where to go next

- [Basic assembly (`createSynapse`)](./create-synapse-basic.md) — storage + selectors
- [Dispatcher](./create-synapse-dispatcher.md) — intents and store updates
- [Effects](./create-synapse-effects.md) — side effects on RxJS
- [Selectors](./selector-system.md) — derived state and the reactive `selector.$`
- [Cross-module dependencies](./dependencies.md) — cross-store and module communication
