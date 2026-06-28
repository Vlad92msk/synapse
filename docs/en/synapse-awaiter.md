# createSynapseAwaiter — framework-independent awaiter

> [Back to Main](../../README.md)

A utility for waiting on a Synapse module's async initialization. Works in any JS environment: Node.js,
browser, React Native, workers. The React wrapper over it is [awaitSynapse](./await-synapse.md) (it adds
the `withSynapseReady` HOC and the `useSynapseReady` hook); the method surface itself
(`waitForReady`/`isReady`/`getStoreIfReady`/`onReady`/`onError`/`getStatus`/`getError`/`destroy`) is
proxied by `awaitSynapse` straight from here.

It takes the lazy handle from `createSynapse` (see [create-synapse-basic](./create-synapse-basic.md)),
starts its initialization, and gives synchronous/asynchronous ways to wait for `storage` to be ready.

## Imports and creation

```typescript
import { createSynapseAwaiter } from 'synapse-storage/utils'
import { pokemonSynapse } from './pokemon.synapse'

// Accepts a lazy handle (typical case — the initPokemonApi async prologue in the factory),
// a Promise of a ready synapse, or a ready synapse itself.
const pokemonAwaiter = createSynapseAwaiter(pokemonSynapse)

// Variant with an already-ready module:
const ready = await pokemonSynapse
const awaiter2 = createSynapseAwaiter(ready)
```

## Programmatic surface

```typescript
// Synchronous checks
pokemonAwaiter.isReady()         // boolean
pokemonAwaiter.getStatus()       // 'pending' | 'ready' | 'error'
pokemonAwaiter.getError()        // Error | null
pokemonAwaiter.getStoreIfReady() // PokemonSynapse | undefined

// Asynchronous waiting — Promise<PokemonSynapse>. Safe to call repeatedly: the same store.
const store = await pokemonAwaiter.waitForReady()
store.actions.loadList()

// Callbacks (return an unsubscribe function). onReady on a ready module fires immediately.
const unsub = pokemonAwaiter.onReady((store) => {
  console.log('pokemon ready, list:', store.storage.getStateSync().pokemonList.length)
})
const unsubErr = pokemonAwaiter.onError((error) => console.error('init failed:', error.message))

// Cleanup: resets subscriptions, status -> 'pending', store -> undefined.
pokemonAwaiter.destroy()
```

`getStoreIfReady()` returns the assembled module — its shape depends on the `createSynapse`
configuration. For `pokemonSynapse` that's the full set: `storage`, `selectors`, `dispatcher`/`actions`,
`state$`, `destroy()`. Until ready — `undefined`.

## SSR sync-fast-path

The key difference from ordinary waiting: if the input is an **already-ready** synapse (or a handle whose
`getSnapshot()` returns a synapse with a `READY` storage), the awaiter sets `store` and `status = 'ready'`
**synchronously in the function body**, before returning — no microtask. Then
`getStoreIfReady()`/`isReady()` return the store on the first synchronous render, which is exactly what
server `renderToString` needs. A not-yet-warmed handle falls back to the ordinary async path.

```typescript
// On the server: warm the module first, then the awaiter resolves synchronously.
await pokemonSynapse.ready()           // the factory has run, storage is READY
const awaiter = createSynapseAwaiter(pokemonSynapse)

awaiter.isReady()          // true — synchronously, no await
awaiter.getStoreIfReady()  // PokemonSynapse, available in the same tick
// → renderToString sees the ready state on the first pass
```

The full SSR flow (dehydrate on the server → hydrate on the client) — on the
[createSynapseCtx](./synapse-ctx.md) page.

## Usage in React (without the wrapper)

If you'd rather not pull in the HOC/hook from `awaitSynapse`, the awaiter can be used manually via
subscriptions:

```typescript
function PokemonStatus() {
  const [status, setStatus] = useState(pokemonAwaiter.getStatus())
  const [count, setCount] = useState(0)

  useEffect(() => {
    const unsubReady = pokemonAwaiter.onReady((store) => {
      setStatus('ready')
      setCount(store.storage.getStateSync().pokemonList.length)
    })
    const unsubError = pokemonAwaiter.onError(() => setStatus('error'))

    // If the module is already ready at mount time — sync up right away.
    if (pokemonAwaiter.isReady()) {
      setStatus('ready')
      setCount(pokemonAwaiter.getStoreIfReady()?.storage.getStateSync().pokemonList.length ?? 0)
    }

    return () => { unsubReady(); unsubError() }
  }, [])

  if (status === 'pending') return <div>Loading the module...</div>
  if (status === 'error') return <div>Initialization error</div>
  return <div>Pokemon loaded: {count}</div>
}
```

> In a real React app this case is better served by [awaitSynapse](./await-synapse.md) — it encapsulates
> exactly this subscription in a HOC/hook. `createSynapseAwaiter` is needed where there is no React
> (Node render, data preload, scripts) or where the sync-fast-path is required.

The full module walkthrough — in the [pokemon-advanced recipe](./pokemon-advanced.md).
