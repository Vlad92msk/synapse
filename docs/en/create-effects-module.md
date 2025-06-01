> [🏠 Home](../../README.md)

# Creating Effects Module
___

The effects module (`EffectsModule`) allows you to create reactive effects for handling actions and states without using the `createSynapse` utility. This is useful when you need more detailed control over effects configuration.

## Prerequisites

To create an effects module, we need ready-made components:

- [🚀 Creating Storage](./basic-usage.md#creating-storage)
- [⚡ Creating Dispatcher](./create-dispatcher.md)
- [⚡ Creating Effects](./create-effects.md)
- [🌐 API Client](./api-client.md) (optional)

## Creating Effects Module

```typescript
import { EffectsModule } from 'synapse-storage/reactive'

// 1. Create storage
const storage = await new MemoryStorage<PokemonState>({...}).initialize()

// 2. Get computed selectors (optional)
const selectors = new SelectorModule(storage)

// 3. Create dispatcher
const dispatcher = createDispatcher({ storage }, (...) => ({...}))

// 4. Prepare external states (other EffectsModule.state$)
const externalStates = {
  userState$: userEffectsModule.state$,
  settingsState$: settingsEffectsModule.state$
}

// 5. Create effects module
const effectsModule = new EffectsModule(
  storage,                             // State storage
  externalStates,                      // External states (state$ from other modules)
  { pokemonDispatcher: dispatcher },   // Object with dispatchers
  { pokemonApi },                      // Object with API/services
  { apiTimeout: 5000 }                 // Configuration for effects/project
)

// 6. Add combined effects
effectsModule.add(pokemonEffects)

// 7. Start effects
effectsModule.start()

// 8. Get state stream
const state$ = effectsModule.state$
```

## Linking Modules

The main feature - `externalStates` is `state$` from other `EffectsModule`:

```typescript
// Base modules
const userModule = new EffectsModule(userStorage, {}, { userDispatcher }, {}, {})
const settingsModule = new EffectsModule(settingsStorage, {}, { settingsDispatcher }, {}, {})

userModule.start()
settingsModule.start()

// Main module uses base module states
const pokemonModule = new EffectsModule(
  pokemonStorage,
  {
    userState$: userModule.state$,        // 👈 state$ from another module
    settingsState$: settingsModule.state$ // 👈 state$ from another module
  },
  { pokemonDispatcher },
  { pokemonApi },
  {}
)

pokemonModule.add(pokemonEffects).start()
```

## Usage in Effects

```typescript
const crossModuleEffect = createEffect((action$, state$, externalStates, dispatchers, api) =>
  action$.pipe(
    ofType(dispatchers.pokemonDispatcher.dispatch.loadPokemon),
    withLatestFrom(
      externalStates.userState$,    // 👈 Data from userModule
      externalStates.settingsState$ // 👈 Data from settingsModule
    ),
    switchMap(([action, userState, settingsState]) => {
      // Use data from other modules
      return from(api.pokemonApi.fetchPokemon({
        id: action.payload.id,
        userId: userState.id,
        lang: settingsState.language
      }))
    })
  )
)
```

## Lifecycle Management

```typescript
// Adding effects at runtime
effectsModule.add(newEffect)

// Stop
effectsModule.stop()

// Clean up resources
await storage.destroy()
```

## When to Use

- Detailed control over initialization
- Complex multi-level state systems
- Modular architecture with independent domains
- Integration with existing systems

---

## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### Related sections:
- [⚡ Creating Dispatcher](./create-dispatcher.md)
- [⚡ Creating Effects](./create-effects.md)
- [🛠️ createSynapse utility](./create-synapse.md)
- [🚀 Basic usage](./basic-usage.md)
