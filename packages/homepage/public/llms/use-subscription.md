<!-- source: docs/en/use-subscription.md · canonical: https://synapse-homepage.web.app/docs/use-subscription · part of https://synapse-homepage.web.app/llms-full.txt -->

# useSubscription


**TL;DR.** `useSubscription(factory, deps)` is an imperative **side-effect** subscription from a component:
subscribe to an `Observable` and do something on each emit (show a toast, log, dispatch), **without
returning anything to render**. It's the counterpart to [`useObservable`](./use-storage-observable.md):
that one returns a value for JSX, while `useSubscription` is for effects. Unsubscription is automatic.

## Why

Sometimes reacting to a store change isn't "show a value" but "do something outward": a toast, a log, an
imperative call, a dispatch. Putting that into `useObservable` is wrong (there's no value to render), and
hand-writing `useEffect` + `subscribe` + cleanup is noisy and easy to forget the `unsubscribe`.
`useSubscription` encapsulates the creation of the subscription and its **guaranteed teardown** on unmount
/ `deps` change.

## When to use / when you don't need it

**Use it:** when the subscription result goes **outward** (toast, log, analytics, an imperative call)
rather than into JSX. Especially when you need RxJS operators for aggregation (`bufferTime`, `pairwise`, …).

**Don't need it:**

- the result is needed **in render** → [`useObservable`](./use-storage-observable.md) (a value) or
  [`useStorageSubscribe`](./use-storage-subscribe.md) (a slice without RxJS);
- a side effect **without a stream/RxJS** — a plain reaction to a prop/value → a regular `useEffect`.

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

## All parameters (commented)

```tsx
useSubscription(
  // 1. factory — creates the subscription and returns it (Unsubscribable). The side effects
  //    live inside .subscribe(...). It is recreated on a deps change: the whole chain
  //    (including stateful operators like bufferTime) is rebuilt from scratch.
  () =>
    toObservable(authStorage, (s) => s.error)
      .pipe(filter(Boolean))
      .subscribe((msg) => toast.error(msg as string)),

  // 2. deps — like in useEffect: everything the factory closes over and that can change.
  //    [] for a singleton store; [storage] for a store from props/context.
  [],
)
```

## Options

| Parameter | Type | Description |
|---|---|---|
| `factory` | `() => Unsubscribable` | Creates the subscription; returns it for auto-unsubscribe. Side effect inside `.subscribe`. |
| `deps` | `DependencyList` | Like in `useEffect`. On change the old subscription is torn down and `factory` is called again. |

## About `deps`

Same rules as [useObservable](./use-storage-observable.md#about-deps--what-goes-in): `deps` holds
everything the factory closes over that can change. For a singleton store `[]` is enough; for a store from
props/context use `[storage]`, otherwise the subscription stays on the old instance.

## Teardown and memory

`useSubscription` tears the subscription down automatically (a `useEffect` cleanup), and `toObservable`
uses `shareReplay({ refCount: true })` under the hood — when the subscriber count drops to zero it
unsubscribes from the store. So sprinkling `useSubscription`/`useObservable` across the project does
**not** accumulate listeners on the storage: everything is released on unmount.

## See also

- [useObservable / useStorageObservable](./use-storage-observable.md) — a stream's value into render.
- [toObservable](./to-observable.md) — the stream itself (usually the source for `factory`).
- [useStorageSubscribe](./use-storage-subscribe.md) — reactive reading of a slice without RxJS.
- [Reactive reads](./reactive-reads.md) — overview and choosing a tool.
