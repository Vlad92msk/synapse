# createEventBus — Event Bus

> [Back to Main](../../README.md)

A pub/sub bus for communication between modules. Built on createSynapse + MemoryStorage + Dispatcher. Supports wildcard patterns, priorities, TTL, and event history.

## Imports

```typescript
import { createEventBus } from 'synapse-storage/utils'
```

## Creating

```typescript
const eventBusHandle = createEventBus({
  name: 'app-events',        // name (for singleton/debugging)
  autoCleanup: true,          // auto-cleanup of old events
  maxEvents: 1000,            // max stored events (default 1000)
})

// createEventBus returns a SynapseModule handle (lazy, PromiseLike) —
// the factory runs on the first await/ready()
const eventBus = await eventBusHandle

// The result:
// {
//   storage: ISyncStorage<EventBusState>   — the state storage
//   actions: EventBusActions               — typed actions
//   dispatcher: Dispatcher                 — the raw dispatcher
//   selectors: {}
//   destroy: () => Promise<void>           — cleanup
// }

// EventBusState:
// {
//   events: Record<string, EventBusEvent>
//   subscriptions: Record<string, SubscriptionInfo>
// }
```

## actions.publish() — Publishing an event

```typescript
const eventBus = await createEventBus({ name: 'my-bus' })

// Publishing an event
const result = await eventBus.actions.publish({
  event: 'USER_UPDATED',           // event type (string)
  data: { userId: 123, name: 'John' },  // arbitrary data
  metadata: {                       // optional metadata
    priority: 'high',               // 'low' | 'normal' | 'high'
    ttl: 60000,                     // event time-to-live (ms)
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
  eventPattern: 'USER_UPDATED',    // exact match
  handler: (data, event) => {
    // data — event.data (the payload)
    // event — the full EventBusEvent object
    console.log(data)               // { userId: 123, name: 'John' }
    console.log(event.event)        // 'USER_UPDATED'
    console.log(event.timestamp)    // 1716633600000
  },
})

// Wildcard patterns
await eventBus.actions.subscribe({
  eventPattern: 'USER_*',          // all events starting with USER_
  handler: (data, event) => {      // USER_UPDATED, USER_DELETED, USER_CREATED...
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
  eventPattern: 'NOTIFICATION_*',
  handler: (data, event) => { ... },
  options: { priority: 'high' },   // only high-priority events
})

// Unsubscribe
unsubscribe()
```

## actions.getEventHistory() — Event history

```typescript
// Get the history for an event type
const history = await eventBus.actions.getEventHistory({
  eventType: 'USER_UPDATED',      // the event type
  limit: 10,                       // max records (default 100)
})

// Returns EventBusEvent[] — sorted by timestamp (newest first)
// [
//   { id: '...', event: 'USER_UPDATED', data: {...}, timestamp: 1716633600000 },
//   { id: '...', event: 'USER_UPDATED', data: {...}, timestamp: 1716633500000 },
// ]
```

## actions.getActiveSubscriptions() — Active subscriptions

```typescript
const subscriptions = await eventBus.actions.getActiveSubscriptions()

// Returns an array:
// [
//   {
//     id: string,          — the subscription ID
//     pattern: string,     — the pattern ('USER_*', '*', etc.)
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

## destroy()

```typescript
// Full cleanup: subscriptions, storage, dispatcher
await eventBus.destroy()
```

## Example: Communication between modules

```typescript
// module-a.ts — publishes events
const bus = await eventBusHandle

export async function saveUser(user: User) {
  await api.saveUser(user)
  await bus.actions.publish({
    event: 'USER_SAVED',
    data: { userId: user.id },
    metadata: { priority: 'high' },
  })
}

// module-b.ts — listens for events
const bus = await eventBusHandle

bus.actions.subscribe({
  eventPattern: 'USER_SAVED',
  handler: (data) => {
    // Update the cache, send a notification, etc.
    console.log('User saved:', data.userId)
  },
})

// module-c.ts — listens for all USER_* events
bus.actions.subscribe({
  eventPattern: 'USER_*',
  handler: (data, event) => {
    analytics.track(event.event, data)
  },
})
```
