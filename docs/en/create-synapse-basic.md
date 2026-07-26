# createSynapse (basic)

> [Back to contents](./README.md) · [Module assembly (`pokemon.synapse.ts`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/pokemon.synapse.ts) · [Minimal sandbox (storage + selectors)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/CreateSynapseBasicExample.tsx)

`createSynapse(config)` assembles the **data-management layer** into a single lazy module. The
only form is a **synchronous config object** (C-form): `storage` (a factory for synchronous
storage), optionally `dispatcher` / `selectors` / `dependencies` / `effects`. Core construction is
synchronous; everything async (endpoints, sockets, dependency readiness) moves into the effects
lifecycle. The minimal form is **storage + selectors**, with no dispatcher or effects: changes go
through storage directly. We'll add the dispatcher and effects on the next pages
([Dispatcher](./create-synapse-dispatcher.md), [Effects](./create-synapse-effects.md)).

Everything on one domain — `pokemon-advanced` (see the [Pokemon example](./pokemon-advanced.md)).
Here we take exactly two bricks from it: `pokemon.store.ts` and `pokemon.selectors.ts`.

## Storage and state (`pokemon.store.ts`)

```typescript
import type { PokemonState } from './pokemon.types'

export const initialState: PokemonState = {
  api: {
    listRequest: { status: 'idle', error: null },
    detailsRequest: { status: 'idle', error: null },
  },
  pokemonList: [],
  offset: 0,
  hasMore: true,
  selectedPokemonId: null,
  selectedPokemon: null,
  searchQuery: '',
  favorites: [],
}
```

## Selectors (`pokemon.selectors.ts`)

Selectors are derived values. Class fields become real `SelectorAPI`s right after construction
(eager), the selector name = the field name. Intermediate slices can be kept `private` — invisible
from outside, but they work as dependencies in `combine`.

```typescript
import { Selectors } from 'synapse-storage/core'
import type { PokemonState } from './pokemon.types'

export class PokemonSelectors extends Selectors<PokemonState> {
  // private = an intermediate slice, not exported outside
  private readonly api = this.select((s) => s.api)

  // Simple selectors — a single state field
  readonly pokemonList = this.select((s) => s.pokemonList)
  readonly searchQuery = this.select((s) => s.searchQuery)
  readonly favorites = this.select((s) => s.favorites)

  // Combined ones — depend on other selectors and are recomputed memoized
  readonly isListLoading = this.combine([this.api], (a) => a.listRequest.status === 'loading')

  // Filter the list by the search string
  readonly filteredList = this.combine([this.pokemonList, this.searchQuery], (list, query) =>
    query ? list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : list,
  )

  // Favorites — the intersection of the list and the ids in favorites
  readonly favoriteCount = this.combine([this.favorites], (favs) => favs.length)
  readonly favoritePokemon = this.combine([this.pokemonList, this.favorites], (list, favs) =>
    list.filter((p) => favs.includes(p.id)),
  )
}
```

> The full set of selectors (statuses and errors of both requests, `selectedPokemon`, `hasMore`) is
> in `pokemon.selectors.ts`. More on selectors themselves — [Selectors](./selector-system.md).

## Assembly: createSynapse(config)

`createSynapse(config)` returns a **lazy handle**. The factories (`storage`/`dispatcher`/
`selectors`) run lazily — on the first `await` / `ready()` (or on the first synchronous access to
`.storage`/`.selectors`), not on import (this matters for SSR and for keeping a module import from
hitting the network). Yet core construction itself is **synchronous**: `storage` is driven to
`READY` in a single tick, and `state$` is always present — even before `await`.

The minimal form — storage + selectors only:

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

import { PokemonSelectors } from './pokemon.selectors'
import { initialState } from './pokemon.store'
import type { PokemonState } from './pokemon.types'

export const pokemonSynapse = createSynapse({
  // storage — a factory for SYNCHRONOUS storage (Memory/LocalStorage); TState is inferred from it
  storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  selectors: (s) => new PokemonSelectors(s),
  // dispatcher / effects — we'll add them on the next pages
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
```

> `TState` (the `PokemonState` type) is **inferred** from the `storage` factory — no need to spell
> out generics by hand. If the type is awkward to infer from the factory, there's an explicit form
> `createSynapse.of<State, Dispatcher, Selectors>({ … })`.

## The return value

```typescript
// The handle is thenable: await starts effects and returns the assembled module
const store = await pokemonSynapse

// The result (basic — no dispatcher):
store.storage    // IStorage<PokemonState> — the storage
store.selectors  // a PokemonSelectors instance — fields = SelectorAPI
store.state$     // Observable<PokemonState> — the state stream (ALWAYS present, even without effects)
store.dispatcher // undefined (no dispatcher)
store.actions    // undefined (the dispatcher alias)

// The C-form exposes the main core SYNCHRONOUSLY (no await) — the basis of cross-store DI:
pokemonSynapse.storage        // IStorage<PokemonState> — available immediately
pokemonSynapse.selectors      // PokemonSelectors — can be passed into other selectors' constructors
pokemonSynapse.state$         // Observable<PokemonState>

// The handle itself:
pokemonSynapse.ready()        // Promise<store> — same as await (starts effects)
pokemonSynapse.isReady()      // boolean
pokemonSynapse.getSnapshot()  // store | undefined — synchronous access (needed for SSR)
pokemonSynapse.destroy()      // Promise<void> — cleanup + memoization reset (the handle is recreatable)
```

## Usage in React

Without a dispatcher we read through `useSelector` and write through storage **directly**:

```typescript
import { useSelector } from 'synapse-storage/react'

const filteredList = useSelector(store.selectors.filteredList)
const favoriteCount = useSelector(store.selectors.favoriteCount)
const searchQuery = useSelector(store.selectors.searchQuery)

// State change — directly through storage
store.storage.set('searchQuery', 'pika')

store.storage.update((s) => {
  const i = s.favorites.indexOf(25)
  if (i >= 0) s.favorites.splice(i, 1)
  else s.favorites.push(25)
})
```

> Direct `storage.set/update` is fine for simple state. As soon as named intents and side-effects
> (loading from an API) appear — that's the job of [Dispatcher](./create-synapse-dispatcher.md) and
> [Effects](./create-synapse-effects.md).

## Async lives in the `effects` factory

Core construction is **synchronous**, so everything async lives in the `effects` factory: it can be
`async` and lazily resolves browser-only resources (an API client's `init()`, endpoints, the `ApiClient`
IndexedDB cache, sockets) — after the core is built, and only on the client:

```typescript
export const pokemonSynapse = createSynapse({
  storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  selectors: (s) => new PokemonSelectors(s),
  // async — only here; core construction and rendering don't touch it
  effects: async () => new PokemonEffects(await getPokemonEndpoints()),
})
```

> Server and client build the store identically from `initialState`, the SSR shell is inferred
> automatically (see [SSR](./ssr-hydration.md)), and a module import doesn't hit the network. How
> `effects` looks together with the dispatcher and dependencies — [Effects](./create-synapse-effects.md)
> and the [Pokemon example](./pokemon-advanced.md).

## Full shape — every config field

You usually need 2–3 fields, but here is the **entire surface** of the C-form at once (commented-out
fields are optional), so you can see what it can do:

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

export const pokemonSynapse = createSynapse(
  {
    // 1. storage — the ONLY required field. A factory for a synchronous storage
    //    (MemoryStorage/LocalStorage). TState is inferred from its type.
    storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),

    // 2. dispatcher — a factory for the class dispatcher (intents + store updates). Gets storage.
    dispatcher: (s) => new PokemonDispatcher(s),

    // 3. selectors — a factory for the class selectors. Gets storage; this is also where
    //    cross-store DI goes (ANOTHER module's selectors are available synchronously):
    //    new X(s, coreSynapse.selectors).
    selectors: (s) => new PokemonSelectors(s),

    // 4. dependencies — the gate for STARTING effects (not construction): the core is built
    //    immediately, effects wait for these stores/modules to be ready. An item is an IStorage,
    //    a synapse handle, or any PromiseLike<{ storage }>.
    dependencies: [settingsStorage],

    // 5. dependencyTimeout — the dependencies wait timeout, ms (defaults to 30000).
    dependencyTimeout: 10000,

    // 6. externalDispatchers — foreign dispatchers whose actions are merged into the shared
    //    action$ (communication pattern 3). A lazy slot-function is preferred — it doesn't force
    //    eager construction of the foreign store on import; resolved when effects start.
    externalDispatchers: () => ({ settings: settingsSynapse.dispatcher }),

    // 7. effects — an effects factory; MAY be async (the whole async prologue goes here).
    //    ctx = { storage, dispatcher, selectors, deps }. Returns Effects instance(s) /
    //    effect functions / undefined.
    effects: async ({ selectors }) =>
      new PokemonEffects(await getPokemonEndpoints(), selectors),
  },
  {
    // 8. The SECOND argument — options. postConstruct: a synchronous hook after core construction
    //    (storage READY, dispatcher finalized), BEFORE the first render. The home for normalizing
    //    persisted state (clearing transient flags).
    postConstruct: ({ actions }) => actions.resetTransient(),
  },
)
```

## A realistic large-project module: cross-store DI + several APIs + a socket

The minimal examples above show the shape. But in a real app a module rarely lives in isolation: its
selectors **combine its own state with someone else's** (data from other modules), and its effects hit
**several APIs** at once, listen to a **WebSocket**, and react to the streams of neighboring stores.
Here is how it all comes together, on a messenger domain (`chat`) that depends on `authSynapse` (the
current user) and `settingsSynapse` (settings: blocked users).

### 1. Selectors: `combine` from your own + foreign selectors (cross-store DI)

Foreign selectors arrive as **constructor parameters** and take part in `this.combine([...])` on equal
footing with your own — the combined selector recomputes both when your store changes and when the
foreign one does:

```typescript
import { Selectors, type IStorage } from 'synapse-storage/core'
import type { AuthSelectors } from '../auth/auth.selectors'
import type { SettingsSelectors } from '../settings/settings.selectors'
import type { ChatState } from './chat.types'

export class ChatSelectors extends Selectors<ChatState> {
  constructor(
    storage: IStorage<ChatState>,
    private readonly auth: AuthSelectors,          // ← selectors of a FOREIGN module
    private readonly settings: SettingsSelectors,  // ← and one more
  ) {
    super(storage)
  }

  // own slices
  private readonly messages = this.select((s) => s.messagesByConversation)
  readonly activeId = this.select((s) => s.activeConversationId)
  readonly connection = this.select((s) => s.connectionStatus)

  readonly activeMessages = this.combine([this.messages, this.activeId], (byConv, id) =>
    id ? byConv[id] ?? [] : [],
  )

  // cross-store: own messages + foreign currentUserId (auth) + foreign blockedUsers (settings).
  // Recomputes when ANY of the three stores changes.
  readonly visibleMessages = this.combine(
    [this.activeMessages, this.auth.currentUserId, this.settings.blockedUsers],
    (msgs, myId, blocked) =>
      msgs
        .filter((m) => !blocked.includes(m.authorId))
        .map((m) => ({ ...m, mine: m.authorId === myId })),
  )

  readonly unreadCount = this.combine([this.messages, this.auth.currentUserId], (byConv, myId) =>
    Object.values(byConv).flat().filter((m) => !m.readBy.includes(myId!)).length,
  )
}
```

> ⚠️ **Cross-store `combine` pitfall.** If `tsconfig` compiles with
> `useDefineForClassFields: true` (the default at `target: ES2022+`), parameter properties
> (`this.auth`) are assigned **after** field initializers → at the moment of
> `this.combine([this.auth.x])` the dependency is still `undefined`. Synapse catches this with a clear
> dev error. Fixes: either `"useDefineForClassFields": false`, or create such selectors **inside the
> constructor body** after `super(storage)`.

### 2. Effects: several APIs + a socket + a neighboring store's stream

All external resources — REST endpoints of **two** APIs, a WebSocket service, an `Observable` of a
neighboring store — arrive through the constructor and are captured in the effects' closure:

```typescript
import { type Observable, tap } from 'rxjs'
import { Effects, apiResult, fromRequest, ofType, validateMap } from 'synapse-storage/reactive'
import type { MessagesApiEndpoints } from './messages.api'
import type { UsersApiEndpoints } from './users.api'
import type { ChatSocketService } from './chat.socket'
import type { PresenceState } from '../presence/presence.types'
import type { ChatState } from './chat.types'
import type { ChatDispatcher } from './chat.dispatcher'

export class ChatEffects extends Effects<ChatState, ChatDispatcher> {
  constructor(
    private readonly messagesApi: MessagesApiEndpoints, // REST #1
    private readonly usersApi: UsersApiEndpoints,       // REST #2
    private readonly socket: ChatSocketService,         // WebSocket service
    private readonly presence$: Observable<PresenceState>, // a neighboring store's stream
  ) {
    super()
  }

  // Conversation history on selection (REST #1)
  readonly loadHistory = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.openConversation),
      validateMap({
        loadingAction: () => d.loadHistory.loading(),
        errorAction: (err) => d.loadHistory.failure(String(err)),
        apiCall: (action) =>
          fromRequest(this.messagesApi.getHistory.request({ conversationId: action.payload })).pipe(
            apiResult((data) => {
              d.applyHistory(data)
              d.loadHistory.success()
            }),
          ),
      }),
    ),
  )

  // Pull in author profiles (REST #2)
  readonly loadAuthors = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.applyHistory),
      validateMap({
        apiCall: (action) =>
          fromRequest(this.usersApi.getByIds.request({ ids: authorIds(action.payload) })).pipe(
            apiResult((users) => d.applyAuthors(users)),
          ),
      }),
    ),
  )

  // Incoming socket messages flow into the store. Dispatch is a side effect via tap
  // (an effect's emissions are NOT dispatched automatically — only d.* calls are).
  readonly incoming = this.effect((action$, state$, { dispatcher: d }) =>
    this.socket.messages$.pipe(tap((msg) => d.messageReceived(msg))),
  )

  // Sending: action → socket.send
  readonly send = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.sendMessage),
      tap((action) => this.socket.send(action.payload)),
    ),
  )

  // React to a NEIGHBORING store's stream (presence): mark interlocutors online/offline
  readonly presenceSync = this.effect((action$, state$, { dispatcher: d }) =>
    this.presence$.pipe(tap((presence) => d.applyPresence(presence.online))),
  )

  // Close the socket when the module is destroyed
  override onDestroy() {
    this.socket.disconnect()
  }
}
```

### 3. Wiring: pass everything into `createSynapse`

`selectors` receives foreign selectors synchronously (cross-store DI), `dependencies` holds the start
of effects until those modules are ready, and `effects` (async) lazily resolves both APIs and opens the
socket — on the client, after the core is constructed:

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

import { authSynapse } from '../auth/auth.synapse'
import { settingsSynapse } from '../settings/settings.synapse'
import { presenceSynapse } from '../presence/presence.synapse'
import { getMessagesApi } from './messages.api'
import { getUsersApi } from './users.api'
import { connectChatSocket } from './chat.socket'
import { ChatDispatcher } from './chat.dispatcher'
import { ChatSelectors } from './chat.selectors'
import { ChatEffects } from './chat.effects'
import { initialState } from './chat.store'
import type { ChatState } from './chat.types'

export const chatSynapse = createSynapse({
  storage: () => new MemoryStorage<ChatState>({ name: 'chat', initialState }),

  dispatcher: (s) => new ChatDispatcher(s),

  // cross-store DI: foreign selectors are available SYNCHRONOUSLY (the foreign module's main core is built lazily).
  selectors: (s) => new ChatSelectors(s, authSynapse.selectors, settingsSynapse.selectors),

  // effects START gate: wait until both modules whose state we read are ready.
  dependencies: [authSynapse, settingsSynapse, presenceSynapse],

  // async prologue: resolve TWO APIs + open the socket + a neighboring store's stream — client-only.
  effects: async () =>
    new ChatEffects(
      await getMessagesApi(),
      await getUsersApi(),
      connectChatSocket(),
      presenceSynapse.state$,
    ),
})
```

What this demonstrates all at once: **combine from n selectors** (your own + two foreign modules),
**multiple dependencies** in `dependencies`, **several APIs** and a **socket** in one effects class,
and **reading a neighboring store's stream** via `state$`. The core construction stayed synchronous —
everything "heavy" moved into `effects` and doesn't get in the way of SSR.

## Extras (DX)

- **`browserStorage(config, { client })`** (exported from `synapse-storage/core`) — a server-safe
  storage factory: `MemoryStorage` on the server (no `window`), `client(config)` in the browser.
  Removes the manual `const isServer = typeof window === …` + branch; add client-only middleware
  (`syncBroadcastMiddleware`) inside `client`. Both branches are a sync store of the same shape, and
  the type is inferred without manual generics.
  ```typescript
  // browserStorage(...) itself returns a factory () => ISyncStorage — pass it as-is
  storage: browserStorage(
    { name: 'draft', initialState },
    { client: (cfg) => new LocalStorage(cfg) },
  )
  ```
- **`postConstruct` — the second argument** `createSynapse(config, { postConstruct })`. A synchronous
  hook after core construction (storage `READY`, dispatcher finalized), BEFORE the first render — for
  normalizing persisted state (clearing transient flags). A separate argument (not a config field) so
  the callback is contextually typed with the already-inferred `TDispatcher`:
  ```typescript
  export const accounts = createSynapse(
    {
      storage: () => new LocalStorage<AccountsState>({ name: 'accounts', initialState }),
      dispatcher: (s) => new AccountsDispatcher(s),
    },
    // persisted state from localStorage may have kept transient flags (isSubmitting, etc.) —
    // clear them synchronously BEFORE the first render. `actions` is typed as AccountsDispatcher.
    { postConstruct: ({ actions }) => actions.resetTransient() },
  )
  ```
- **`createSynapse.of<State, Dispatcher, Selectors>(config, options?)`** — the explicitly-typed C-form,
  for when `TState` is awkward to infer from the `storage` factory (manual generics without falling
  through to a constraint error):
  ```typescript
  // generics set manually; config fields and the second argument are the same as createSynapse
  export const accounts = createSynapse.of<AccountsState, AccountsDispatcher, AccountsSelectors>(
    {
      storage: () => new LocalStorage({ name: 'accounts', initialState }),
      dispatcher: (s) => new AccountsDispatcher(s),
      selectors: (s) => new AccountsSelectors(s),
    },
    { postConstruct: ({ actions }) => actions.resetTransient() },
  )
  ```
