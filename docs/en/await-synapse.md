# awaitSynapse

> [Back to Main](../../README.md)

A React utility for waiting until a Synapse module is ready: HOC + hook + programmatic API.

`createSynapse` returns a **lazy handle** (see [create-synapse-basic](./create-synapse-basic.md)) — the
factory starts on the first `await`/subscription, not on import. `awaitSynapse` lifts that handle: it kicks
off initialization, holds `loadingComponent` during the async prologue, and hands over the ready synapse
once `storage` is initialized.

Same domain — the `pokemonSynapse` assembled on the previous pages. This is the "manual" way to hand the
module to components (no Context): an alternative to the [createSynapseCtx](./synapse-ctx.md) provider. It
is exactly `awaitSynapse` that the module's demo uses — `PokemonAdvancedExample.tsx`.

## Creating

`awaitSynapse(handle, options?)` is created **once, at module level** — not inside a component, otherwise
the awaiter (and initialization) would be recreated on every render.

```typescript
import { awaitSynapse } from 'synapse-storage/react'
import { pokemonSynapse } from './pokemon.synapse'

// pokemonSynapse — the lazy handle from createSynapse (async prologue: initPokemonApi).
const pokemonAwaiter = awaitSynapse(pokemonSynapse, {
  loadingComponent: <div>Initializing...</div>,
  errorComponent: (error) => <div>Init failed: {error.message}</div>,
})
```

`options` is optional: by default `loadingComponent` is `<div>Initializing...</div>` and `errorComponent`
is the error text. It accepts not only a handle, but also a Promise of a ready synapse or a ready synapse
itself.

## withSynapseReady (HOC) — how the demo module is lifted

The HOC shows `loadingComponent` while the module isn't ready, and renders the component **only** when
`storage` is fully initialized. This is exactly what `PokemonAdvancedExample.tsx` does:

```typescript
import { useEffect } from 'react'

function PokemonContent() {
  // The HOC guarantees readiness — store is available synchronously, no undefined checks.
  const store = pokemonAwaiter.getStoreIfReady()!

  // Initial list load — once, when the module is ready.
  useEffect(() => {
    store.actions.loadList()
  }, [store])

  return <PokemonDemo store={store} />
}

// In JSX it first shows loadingComponent, then PokemonContent with the ready store:
export const PokemonAdvancedExample = pokemonAwaiter.withSynapseReady(PokemonContent)
```

Inside `PokemonContent` the whole module surface is available: `store.selectors` (see
[selector-system](./selector-system.md)), `store.actions` (the dispatcher's intents), and `store.dispatcher`.

## useSynapseReady (hook)

A hook for manual control over readiness — when you need to show an initialization status, not just hide
the component behind a loader:

```typescript
function PokemonStatus() {
  const { isReady, isPending, isError, store, error } = pokemonAwaiter.useSynapseReady()

  if (isPending) return <div>Loading the module...</div>
  if (isError)   return <div>Error: {error?.message}</div>
  if (isReady)   return <div>Pokemon loaded: {store!.storage.getStateSync().pokemonList.length}</div>
}

// Fields of the returned object:
// isReady:   boolean — the module is initialized
// isPending: boolean — waiting for initialization
// isError:   boolean — initialization error
// store:     PokemonSynapse | undefined  (defined only when isReady)
// error:     Error | null
```

## Programmatic API

Available outside React — in effects, utilities, on the server:

```typescript
// Synchronous checks
pokemonAwaiter.isReady()         // boolean
pokemonAwaiter.getStatus()       // 'pending' | 'ready' | 'error'
pokemonAwaiter.getError()        // Error | null
pokemonAwaiter.getStoreIfReady() // PokemonSynapse | undefined

// Asynchronous waiting
const store = await pokemonAwaiter.waitForReady()
store.actions.loadList()

// Callbacks (return an unsubscribe function)
const unsub = pokemonAwaiter.onReady((store) => {
  console.log('Pokemon module ready', store.storage.getStateSync())
})

const unsubErr = pokemonAwaiter.onError((error) => {
  console.error('Init failed:', error.message)
})

// If the module is already ready — onReady fires immediately.

// Cleanup
pokemonAwaiter.destroy()
```

## Relation to createSynapseAwaiter

`awaitSynapse` is a thin React wrapper around the framework-independent `createSynapseAwaiter`:

```typescript
// awaitSynapse adds: withSynapseReady (HOC) and useSynapseReady (hook).
// Proxies: waitForReady, isReady, getStoreIfReady, onReady, onError, getStatus, getError, destroy.

// For vanilla JS / Node.js / without React — createSynapseAwaiter directly:
import { createSynapseAwaiter } from 'synapse-storage/utils'
const awaiter = createSynapseAwaiter(pokemonSynapse)
// The same programmatic API, but without React hooks.
```

More on the framework-independent variant and the SSR sync-fast-path — on the
[synapse-awaiter](./synapse-awaiter.md) page. The full module walkthrough — in the
[pokemon-advanced recipe](./pokemon-advanced.md).
