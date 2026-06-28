# createEventBus — Event Bus

> [Back to Main](../../README.md)

A pub/sub bus for communication **between independent modules**. Built on the same bricks as the
rest of the BLL: `createSynapse` + `MemoryStorage` + `Dispatcher` (see [create-synapse-basic](./create-synapse-basic.md)).
Supports wildcard patterns, priorities, TTL, and event history.

Where this fits our domain: the pokemon module (see [pokemon-advanced](./pokemon-advanced.md)) only
knows about itself — it loads the list, tracks favorites, holds the selected pokemon. If **other**
parts of the app should react to those actions (analytics, toasts, a header badge), there's no need
to wire them together tightly. Pokemon publishes domain events (`POKEMON_SELECTED`, `FAVORITE_TOGGLED`),
and anyone subscribes to them. This is the "pattern 3 / mediator" from [dependencies](./dependencies.md),
just packaged as a ready-made utility.

> The reference pokemon module does **not** bake the bus in — event-bus is an optional integration on
> top of it, so this page has no canonical pokemon file, only a runnable sandbox.

## Imports

```typescript
import { createEventBus } from 'synapse-storage/utils'
```

## Creating

```typescript
const eventBusHandle = createEventBus({
  name: 'pokemon-events',     // name (for singleton/debugging)
  autoCleanup: true,          // auto-cleanup of old events
  maxEvents: 1000,            // max stored events (default 1000)
})

// createEventBus returns a SynapseModule handle (lazy, PromiseLike) —
// the factory runs on the first await/ready()
const eventBus = await eventBusHandle

// The result (Synapse<EventBusState, EventBusDispatcher, undefined>):
// {
//   storage: IStorage<EventBusState>       — the state storage
//   actions: EventBusDispatcher            — typed actions (alias of dispatcher)
//   dispatcher: EventBusDispatcher         — the same dispatcher instance
//   selectors: undefined                   — the bus has no selectors
//   state$: Observable<EventBusState>      — the state stream (always present)
//   destroy: () => Promise<void>           — cleanup
// }

// EventBusState:
// {
//   events: Record<string, EventBusEvent>
//   subscriptions: Record<string, SubscriptionInfo>
// }
```

`actions` and `dispatcher` are the same `EventBusDispatcher` instance; its fields (`publish`/`subscribe`/…)
are the dispatch functions. Everything below uses `eventBus.actions`.

## actions.publish() — Publishing an event

```typescript
const eventBus = await createEventBus({ name: 'pokemon-events' })

// Publishing an event
const result = await eventBus.actions.publish({
  event: 'POKEMON_SELECTED',            // event type (string)
  data: { id: 25, name: 'pikachu' },    // arbitrary data
  metadata: {                           // optional metadata
    priority: 'high',                   // 'low' | 'normal' | 'high'
    ttl: 60000,                         // event time-to-live (ms)
  },
})

// The result:
// {
//   eventId: string    — the unique event ID
//   event: string      — the event type
//   data: any          — the data
// }

// EventBusEvent (stored in storage):
// {
//   id: string
//   event: string
//   data: any
//   metadata: { ttl?: number | null, priority?: 'low' | 'normal' | 'high' }
//   timestamp: number
// }
```

## actions.subscribe() — Subscribing to events

```typescript
// Subscribing to a specific event
const { subscriptionId, unsubscribe } = await eventBus.actions.subscribe({
  eventPattern: 'POKEMON_SELECTED',  // exact match
  handler: (data, event) => {
    // data — event.data (the payload)
    // event — the full EventBusEvent object
    console.log(data)               // { id: 25, name: 'pikachu' }
    console.log(event.event)        // 'POKEMON_SELECTED'
    console.log(event.timestamp)    // 1716633600000
  },
})

// Wildcard patterns
await eventBus.actions.subscribe({
  eventPattern: 'POKEMON_*',       // all events starting with POKEMON_
  handler: (data, event) => {      // POKEMON_SELECTED, POKEMON_LOADED, ...
    console.log(event.event, data)
  },
})

await eventBus.actions.subscribe({
  eventPattern: '*',               // ALL events
  handler: (data, event) => {
    console.log('Any event:', event.event)
  },
})

// Filter by priority
await eventBus.actions.subscribe({
  eventPattern: 'FAVORITE_*',
  handler: (data, event) => { ... },
  options: { priority: 'high' },   // only high-priority events
})

// Unsubscribe
unsubscribe()
```

Internally `subscribe` listens to the `state.events` slice of storage: when a new event is published,
every subscriber whose pattern matches gets a `handler` call. An error in a handler does not bring the
bus down — it is logged through the internal `handleCallbackError`.

## actions.getEventHistory() — Event history

```typescript
// Get the history for an event type
const history = await eventBus.actions.getEventHistory({
  eventType: 'POKEMON_SELECTED',  // the event type
  limit: 10,                       // max records (default 100)
})

// Returns EventBusEvent[] — sorted by timestamp (newest first)
// [
//   { id: '...', event: 'POKEMON_SELECTED', data: {...}, timestamp: 1716633600000 },
//   { id: '...', event: 'POKEMON_SELECTED', data: {...}, timestamp: 1716633500000 },
// ]
```

## actions.getActiveSubscriptions() — Active subscriptions

```typescript
const subscriptions = await eventBus.actions.getActiveSubscriptions()

// Returns an array:
// [
//   {
//     id: string,          — the subscription ID
//     pattern: string,     — the pattern ('POKEMON_*', '*', etc.)
//     options: {...},       — options (priority etc.)
//     createdAt: number,   — creation time
//   }
// ]
```

## actions.clearEvents() — Clearing events

```typescript
// Clear old events
await eventBus.actions.clearEvents({
  olderThan: 60000,                // remove events older than 60 seconds
})

// Clear all events
await eventBus.actions.clearEvents({})
```

With `autoCleanup: true` old events are trimmed automatically on every publish: as soon as their
count exceeds `maxEvents`, only the `maxEvents` freshest ones (by `timestamp`) are kept.

## destroy()

```typescript
// Full cleanup: active subscriptions, storage, dispatcher
await eventBus.destroy()
```

`destroy()` first calls every accumulated `unsubscribe`, then tears the module down and resets the
handle's memoization (the next `await eventBusHandle` rebuilds the bus from scratch).

## Example: pokemon publishes, other modules listen

```typescript
// pokemon-events.ts — the shared domain bus
import { createEventBus } from 'synapse-storage/utils'

export const pokemonEventsHandle = createEventBus({ name: 'pokemon-events', autoCleanup: true })

// ─── pokemon-side: publish domain events ─────────────────────────────────────
// A handy place is a wrapper over dispatcher intents (see dispatcher-detailed)
// or an effect that already sees the module's action stream.
const bus = await pokemonEventsHandle

export async function selectAndAnnounce(store: PokemonSynapse, pokemon: PokemonBrief) {
  store.actions.selectPokemon(pokemon.id)
  await bus.actions.publish({
    event: 'POKEMON_SELECTED',
    data: { id: pokemon.id, name: pokemon.name },
    metadata: { priority: 'high' },
  })
}

// ─── analytics.ts — listens to all domain events ─────────────────────────────
const bus = await pokemonEventsHandle

bus.actions.subscribe({
  eventPattern: 'POKEMON_*',
  handler: (data, event) => {
    analytics.track(event.event, data)   // POKEMON_SELECTED, FAVORITE_TOGGLED, ...
  },
})

// ─── toaster.ts — reacts only to favorites ───────────────────────────────────
bus.actions.subscribe({
  eventPattern: 'FAVORITE_TOGGLED',
  handler: (data) => {
    showToast(`Pokemon ${data.name} ${data.added ? 'added to' : 'removed from'} favorites`)
  },
})
```

The `analytics` and `toaster` modules know nothing about the pokemon synapse and don't import it —
the only link is the event names. That decoupling is the whole point of the bus.

## Relation to createSynapse: the bus as an externalDispatcher

If you need not just to listen to events from outside, but to **feed** them into another synapse's
action stream (so its effects react to bus events like regular actions), pass the bus through
`externalDispatchers` — this is "communication variant 3" from [dependencies](./dependencies.md):

```typescript
const bus = await pokemonEventsHandle

const mySynapse = createSynapse(() => ({
  storage,
  dispatcher: new MyDispatcher(storage),
  effects: new MyEffects(),
  externalDispatchers: { eventBus: bus.dispatcher },  // bus actions land in action$
}))
```

## See also

- [dependencies](./dependencies.md) — patterns for module communication (the bus = mediator / externalDispatchers).
- [create-synapse-basic](./create-synapse-basic.md) — what the bus itself is built from (storage + dispatcher).
- [pokemon-advanced](./pokemon-advanced.md) — the reference module whose events the bus publishes.
```
