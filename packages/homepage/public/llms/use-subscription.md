<!-- source: docs/en/use-subscription.md · canonical: https://synapse-homepage.web.app/docs#use-subscription · part of https://synapse-homepage.web.app/llms-full.txt -->

# useSubscription


An imperative **side-effect** subscription from a component: subscribe to an `Observable` and do something
on each emit (show a toast, log, dispatch) **without returning anything to render**. It's the counterpart
to [useObservable](./use-storage-observable.md): that one returns a value for JSX, while `useSubscription`
is for effects. See the [Reactive reads](./reactive-reads.md) overview.

## Signature

```typescript
useSubscription(factory: () => Unsubscribable, deps: DependencyList): void
```

- `factory` — creates the subscription (`source$.subscribe(...)`); its side-effects live inside the
  `subscribe` callback.
- The returned `Unsubscribable` is **torn down automatically** on unmount and on `deps` change (before
  creating a new subscription) — no manual unsubscribe needed.
- Renders nothing and returns nothing.

## Basic usage

```tsx
import { useSubscription } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { filter } from 'rxjs/operators'

function ErrorToaster() {
  useSubscription(
    () =>
      toObservable(authStorage, (s) => s.error)
        .pipe(filter((err): err is string => Boolean(err)))
        .subscribe((message) => {
          toast.error(message)
        }),
    [],
  )

  return null
}
```

The subscription lives exactly as long as the component is mounted: on unmount `useSubscription` calls
`unsubscribe()` for you.

## When `useSubscription` vs `useObservable`

| You need | Hook |
|----------|------|
| A **value** to render (a slice, a debounced result) | [`useObservable`](./use-storage-observable.md) |
| A **side-effect** on each emit (toast, log, imperative call) | `useSubscription` |

Simple rule: if the result goes into JSX — `useObservable`; if it's "do something outward" —
`useSubscription`. Don't hand-roll the same thing in `useEffect` — `useSubscription` already encapsulates
creation and guaranteed teardown.

## Example: a notification aggregator

The classic case — collapse a burst of events into one notification (10 messages in a couple of seconds →
one toast "10 new messages"). That's a side-effect, hence `useSubscription`:

```tsx
import { useSubscription } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { bufferTime, filter, map, pairwise } from 'rxjs/operators'

function MessageNotifier() {
  useSubscription(
    () =>
      toObservable(messagesStorage, (s) => s.inbox.length)
        .pipe(
          pairwise(),                                        // [was, now]
          map(([prev, next]) => next - prev),                // how many were added
          filter((added) => added > 0),                      // arrivals only
          bufferTime(2000),                                  // collect for 2 seconds
          filter((batch) => batch.length > 0),               // skip empty windows
          map((batch) => batch.reduce((sum, n) => sum + n, 0)), // total per window
        )
        .subscribe((count) => {
          toast.show(count === 1 ? 'New message' : `${count} new messages`)
        }),
    [],
  )

  return null
}
```

A detailed walkthrough of the operators lives on the
[useStorageObservable](./use-storage-observable.md#example-a-notification-aggregator) page.

## About `deps`

Same rules as [useObservable](./use-storage-observable.md#about-deps--what-goes-in): `deps` holds
everything the factory closes over that can change. For a singleton store `[]` is enough; for a store from
props/context use `[storage]`, otherwise the subscription stays on the old instance.

## Teardown and memory

`useSubscription` tears the subscription down automatically (a `useEffect` cleanup), and `toObservable`
uses `shareReplay({ refCount: true })` under the hood — when the subscriber count drops to zero it
unsubscribes from the store. So sprinkling `useSubscription`/`useObservable` across the project does
**not** accumulate listeners on the storage: everything is released on unmount.
