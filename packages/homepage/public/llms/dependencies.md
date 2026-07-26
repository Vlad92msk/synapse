<!-- source: docs/en/dependencies.md · canonical: https://synapse-homepage.web.app/docs/dependencies · part of https://synapse-homepage.web.app/llms-full.txt -->

# Cross-module dependencies


One `createSynapse` can depend on another storage or module. `dependencies` is a **gate for the
START of effects, not for construction**: the core (storage/dispatcher/selectors) is assembled
synchronously right away, while `waitForDependencies` runs inside `ready()` before starting the
effects — by the time effects start, the dependencies are guaranteed to be initialized.

Same domain — `pokemon-advanced`. It depends on a separate `settingsStorage` (`pageSize`).

## The real case: pokemon → settingsStorage

`settingsStorage` is a standalone settings storage living outside the pokemon module:

```typescript
// pokemon.settings.ts
import { MemoryStorage } from 'synapse-storage/core'

export interface PokemonSettings { pageSize: number }

export const settingsStorage = new MemoryStorage<PokemonSettings>({
  name: 'pokemon-settings',
  initialState: { pageSize: 12 },
})
```

The pokemon module declares it in `dependencies` and folds `settings$` into the effects:

```typescript
// pokemon.synapse.ts
import { MemoryStorage } from 'synapse-storage/core'
import { toObservable } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'

export const pokemonSynapse = createSynapse({
  storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  dependencies: [settingsStorage],             // gate for the START of effects (core is built right away)
  dependencyTimeout: 10000,                     // ms, default 30000
  dispatcher: (s) => new PokemonDispatcher(s),
  selectors: (s) => new PokemonSelectors(s),
  // settings$ — the external store's state as an Observable (pattern 1, see below)
  effects: async () => {
    await initPokemonApi()                     // the async prologue moved into the effects factory
    return new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage))
  },
})
```

**A dependency can be** (`DependencyInput`):

- a raw `IStorage` — like `settingsStorage` above (its `initialize()` is awaited for us);
- another synapse handle — `dependencies: [otherSynapse]` (the handle is itself thenable — no `await` needed);
- any `PromiseLike<{ storage }>`.

In the effects `pageSize` arrives via `withLatestFrom(this.settings$)` — see
[Effects](./create-synapse-effects.md). Change `settingsStorage.set('pageSize', 24)` and the next list
load takes the new page size, without wiring the modules together directly.

## Four patterns of cross-module communication

Pokemon uses **pattern 1** (it reads `settingsStorage`'s state). The other three are for richer links —
demonstrated by the [Auth → Settings sandbox](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/DependenciesExample.tsx).

### 1. Read another store's STATE in effects — via `toObservable`

Exactly what pokemon does with the settings:

```typescript
import { toObservable } from 'synapse-storage/reactive'

class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(private readonly api: PokemonApiEndpoints, private readonly settings$: Observable<PokemonSettings>) {
    super()
  }
  // this.settings$ is folded into the pipe via withLatestFrom → the apiCall takes pageSize
}

// assembly:
effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage))
```

### 2. Read another store's SELECTORS — via the Selectors constructor (cross-store)

External selectors come through the constructor and participate in `this.combine(...)` as reactive
dependencies (sandbox example — Settings depends on Auth):

```typescript
import type { IStorage, SelectorAPI } from 'synapse-storage/core'

class SettingsSelectors extends Selectors<SettingsState> {
  theme = this.select((s) => s.theme)
  currentUserId: SelectorAPI<string | null>

  constructor(storage: IStorage<SettingsState>, private auth: AuthSynapse['selectors']) {
    super(storage)
    // depends on ANOTHER store's selector → recomputes reactively
    this.currentUserId = this.combine([this.auth.userId], (userId) => userId)
  }
}

// assembly: cross-store DI SYNCHRONOUSLY — the C-form exposes `authSynapse.selectors` without await
createSynapse({
  storage: () => new MemoryStorage<SettingsState>({ name: 'settings', initialState }),
  dependencies: [authSynapse],                                  // gate for the start of effects
  selectors: (s) => new SettingsSelectors(s, authSynapse.selectors),
})
```

> `combineAcross` / `createLazyForeignSelector` are no longer needed and have been **removed** — the
> cross-store link is built directly through constructor DI (`authSynapse.selectors` is available synchronously).

### 3. React to another store's ACTIONS — via `externalDispatchers`

External dispatchers are declared as the third generic `Effects<…, Ext>` and arrive in `ctx.external`
(their actions are already merged into the shared `action$`):

```typescript
class SettingsEffects extends Effects<SettingsState, SettingsDispatcher, { auth: AuthDispatcher }> {
  readonly onLogout = this.effect((action$, _state$, { dispatcher: d, external }) =>
    action$.pipe(
      ofType(external.auth.logout),   // an action from ANOTHER module
      tap(() => d.resetSettings()),
    ),
  )
}

// in assembly the external dispatchers are wired in as externalDispatchers — a lazy slot function
// (doesn't force eager construction of the other store on import; resolved at the start of effects)
createSynapse({
  storage: () => new MemoryStorage<SettingsState>({ name: 'settings', initialState }),
  dependencies: [authSynapse],
  dispatcher: (s) => new SettingsDispatcher(s),
  effects: () => new SettingsEffects(),
  externalDispatchers: () => ({ auth: authSynapse.dispatcher }),
})
```

### 4. Mediator / event-bus

When modules shouldn't know about each other, they are linked by a separate mediator synapse (or
`createEventBus`): it is subscribed to the actions/states of both and relays events between them. More
details — [createEventBus](./event-bus.md).

## Initialization order

```typescript
// The order in the C-form createSynapse:
// 1. Construction is SYNCHRONOUS: storage.initializeSync() → READY, dispatcher finalized,
//    selectors materialized, state$ present — all available BEFORE ready()/await (cross-store DI)
// 2. ready()/await: waitForDependencies (Promise.all + timeout) — gate for the START of effects
// 3. Resolve the effects factory (may be async) + externalDispatchers → start the effects

// On timeout — an error is thrown (default 30000ms, pokemon uses 10000):
// 'Dependency 0 ("pokemon-settings") timed out after 10000ms. Check that it initializes correctly.'
```

How to hand the assembled `pokemonSynapse` to React and await readiness — [createSynapseCtx](./synapse-ctx.md)
and [awaitSynapse](./await-synapse.md). The full module — [Pokemon (recipe)](./pokemon-advanced.md).
