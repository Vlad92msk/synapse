# Cross-module dependencies

> [Back to Main](../../README.md)

One `createSynapse` can depend on another. Dependencies are awaited before the factory runs.

## Dependency (Auth module)

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher } from 'synapse-storage/reactive'

class AuthSelectors extends Selectors<AuthState> {
  readonly token = this.select((s) => s.token)
  readonly userId = this.select((s) => s.userId)
}

class AuthDispatcher extends Dispatcher<AuthState> {
  readonly login = this.action((store, userId: string) => {
    store.update((s) => { s.token = `jwt-${userId}`; s.userId = userId })
    return userId
  })
  readonly logout = this.action((store) => {
    store.update((s) => { s.token = null; s.userId = null })
  })
}

// The Auth module — others will depend on it
const authSynapse = createSynapse(async () => {
  await fetchAuth()  // the factory's async prologue
  const storage = new MemoryStorage<AuthState>({
    name: 'auth',
    initialState: { token: 'jwt-123', userId: 'user-1' },
  })
  return {
    storage,
    dispatcher: new AuthDispatcher(storage),
    selectors: new AuthSelectors(storage),
  }
})

export type AuthSynapse = Awaited<typeof authSynapse>
```

## Dependent storage (Settings) + cross-store selector

```typescript
import type { IStorage, SelectorAPI } from 'synapse-storage/core'

// Cross-store: external selectors come through the constructor
class SettingsSelectors extends Selectors<SettingsState> {
  readonly theme = this.select((s) => s.theme)
  readonly currentUserId: SelectorAPI<string | null>

  constructor(storage: IStorage<SettingsState>, private auth: AuthSynapse['selectors']) {
    super(storage)
    // depends on another store's selector → recomputes reactively
    this.currentUserId = this.combine([this.auth.userId], (userId) => userId)
  }
}

const settingsSynapse = createSynapse(async () => {
  const auth = await authSynapse              // the handle is a thenable
  const storage = new MemoryStorage<SettingsState>({ name: 'settings', initialState })
  return {
    storage,
    dependencies: [auth],                     // wait for readiness before assembly
    dependencyTimeout: 5000,                  // ms, default 30000
    selectors: new SettingsSelectors(storage, auth.selectors),
  }
})
```

## Four patterns of cross-module communication

### 1. Read another store's STATE in effects — via `toObservable`

```typescript
import { toObservable } from 'synapse-storage/reactive'

class SettingsEffects extends Effects<SettingsState, SettingsDispatcher> {
  // another module's raw store as an Observable
  constructor(private readonly auth$: Observable<AuthState>) { super() }

  readonly onAuthChange = this.effect((_action$, _state$, { dispatcher: d }) =>
    this.auth$.pipe(/* ... react to changes in another's state ... */),
  )
}

// assembly:
effects: new SettingsEffects(toObservable(auth.storage))
```

### 2. Read another store's SELECTORS — via the Selectors constructor (cross-store)

```typescript
// (see SettingsSelectors above)
new SettingsSelectors(storage, auth.selectors)
// → this.combine([this.auth.userId], ...) — reactive derived state on top of another store
```

### 3. React to another store's ACTIONS — via `externalDispatchers`

External dispatchers are declared as the third generic `Effects<…, Ext>` and arrive in `ctx.external`:

```typescript
class SettingsEffects extends Effects<SettingsState, SettingsDispatcher, { auth: AuthDispatcher }> {
  readonly onLogout = this.effect((action$, _state$, { dispatcher: d, external }) =>
    action$.pipe(
      ofType(external.auth.logout),   // an action from ANOTHER module
      tap(() => d.resetSettings()),
    ),
  )
}

// in assembly the external dispatchers are wired in as externalDispatchers
return {
  storage,
  dependencies: [auth],
  dispatcher: new SettingsDispatcher(storage),
  effects: new SettingsEffects(),
  externalDispatchers: { auth: auth.dispatcher },
}
```

### 4. Mediator / event-bus

When modules shouldn't know about each other, they are linked by a separate mediator synapse (or `createEventBus`):
it is subscribed to the actions/states of both and relays events between them. More details — [createEventBus](./event-bus.md).

## Initialization order

```typescript
// The order inside a createSynapse factory:
// 1. Dependencies are ready (Promise.all + timeout)
// 2. The factory runs → creates storage, dispatcher, selectors, effects
// 3. storage.initialize() + starting the effects

// On timeout — an error is thrown:
// "Dependency ("auth") timed out after 5000ms"

// Any createSynapse handle works as a dependency (it is thenable + waitForReady)
```
