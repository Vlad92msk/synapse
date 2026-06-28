# useStorageObservable

> [Back to Main](../../README.md)

The RxJS path for "store → reactive in a component". Equivalent to
[useStorageSubscribe](./use-storage-subscribe.md), but you can pipe RxJS operators (`debounceTime`,
`scan`, `bufferTime`, …) on top of the state stream. See the [Reactive reads](./reactive-reads.md)
overview. The examples use the end-to-end `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`).

## Basic usage

```typescript
import { useStorageObservable } from 'synapse-storage/react'

// whole state
const state = useStorageObservable(todoStorage)

// a slice — emits only when the slice changes (distinctUntilChanged)
const total = useStorageObservable(todoStorage, (s) => s.todos.length)
```

Internally it's a memoizing wrapper over [`toObservable`](./to-observable.md) + `useObservable`. The
observable is memoized by `[storage]`, so the hook does **not** re-subscribe on every render. That's
enough when you just need a slice. But you **can't** attach your own operators through
`useStorageObservable` — for that drop one level down: `toObservable` (builds the stream) + `useObservable`
(subscribes and returns the value to render).

## Operators on top of the stream

`toObservable(storage, selector)` gives an `Observable<slice>` you can pipe any RxJS operators onto. To
keep the subscription stable (instead of recreating it every render), wrap building the stream in a
**factory** and pass it to `useObservable` — it subscribes in `useEffect` and returns the latest value.

```tsx
import { useObservable } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { debounceTime, map } from 'rxjs/operators'

function TodoBadge() {
  // todoStorage is a module-level singleton, stable ref → deps can be omitted
  const label = useObservable(
    () =>
      toObservable(todoStorage, (s) => s.todos.length).pipe(
        debounceTime(200),
        map((count) => `${count} todos`),
      ),
    '0 todos',
  )

  // label is a plain string, render it as is
  return <div className="badge">{label}</div>
}
```

`useObservable` returns a **ready value** (a string here) you can drop straight into JSX. Until the first
emit it shows `initialValue` (`'0 todos'`). The stream emits the initial value on subscribe, so the badge
doesn't flash empty.

## Why `debounce` here

Without operators the badge would recompute on **every** `todos` change. With `debounceTime(200)` — if a
burst of changes arrives within 200 ms (bulk add, import), the component updates **once** with the final
value instead of 10 times in a row. That's the point of the RxJS path: smooth the stream before it reaches
render.

## About `deps` — what goes in

The third argument of `useObservable` is the dependency array for re-subscription. Rule of thumb:
**everything the factory closes over that can change goes into `deps`**.

- **Singleton store** (module constant) — stable ref, nothing to re-subscribe to. `deps` can be
  **omitted** (the factory default is `[]`, the subscription is built once on mount). `[todoStorage]` is
  also correct here, just redundant.
- **Store from props / context / `useCreateStorage`** — the ref can change. Then `[storage]` is
  **required**, otherwise the stream stays subscribed to the old instance (stale).
- **The factory closes over external values** (a `limit` prop, a selected `userId`, etc.) — put them in
  `deps`, otherwise the chain won't rebuild when they change and will run with the stale closure.

```tsx
// store from props + external limit prop used inside pipe → both in deps
const recent = useObservable(
  () =>
    toObservable(store, (s) => s.items).pipe(
      map((items) => items.slice(0, limit)),
    ),
  [],
  [store, limit],
)
```

## Example: debounced search

The live input value and the "heavy" search result are **two different** reactive reads. The input value
must update instantly (a plain subscription), while filtering should only run once the user stops typing
(a debounced stream):

```tsx
import { useStorageSubscribe, useObservable } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'

function SearchBox() {
  // 1) live input value — updates on every keystroke
  const query = useStorageSubscribe(searchStorage, (s) => s.query)

  // 2) results — recomputed only after the user idles for 300 ms
  const matches = useObservable<Product[]>(
    () =>
      toObservable(searchStorage, (s) => s.query).pipe(
        map((q) => q.trim().toLowerCase()),
        debounceTime(300),
        distinctUntilChanged(),
        map((q) => (q ? filterProducts(q) : [])),
      ),
    [],
  )

  return (
    <div>
      <input
        value={query}
        placeholder="Search…"
        onChange={(e) =>
          searchStorage.update((s) => {
            s.query = e.target.value
          })
        }
      />
      <ul>
        {matches.map((p) => (
          <li key={p.id}>{p.title}</li>
        ))}
      </ul>
    </div>
  )
}
```

The input doesn't lag (the value from `useStorageSubscribe` is immediate), and `filterProducts` runs once
every 300 ms after a pause instead of on every keystroke.

## Example: a notification aggregator

The classic case: 10 messages arrive within a couple of seconds — you want to show **one** notification
"10 new messages", not 10 toasts. That's a side-effect (call `toast.show`), not a render value, so we use
`useSubscription` instead of `useObservable` — it subscribes and renders **nothing**.

Model: `messagesStorage` holds `{ inbox: Message[] }`, each new message is pushed into `inbox`.

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
          filter((added) => added > 0),                      // arrivals only (not removals)
          bufferTime(2000),                                  // collect events for 2 seconds
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

How it reads:

- `pairwise` + `map` turn "inbox length" into "how many were added this tick";
- `bufferTime(2000)` collects those arrivals in 2-second windows;
- per window — one `toast.show` with the total.

So a burst of 10 messages within 2 seconds yields **one** toast "10 new messages". That's the answer to
"can the hook do this": once you're inside an `Observable`, the whole RxJS toolbox is available — you just
pick the right entry point (`useObservable` to render a value, `useSubscription` to run a side-effect).

## Notes

- A `toObservable` selector stream already runs through `distinctUntilChanged` — an extra
  `distinctUntilChanged` right after the selector is almost always redundant.
- Need a simple reactive read without RxJS? Use [useStorageSubscribe](./use-storage-subscribe.md).
- A stream outside React (effects, non-React code) — [toObservable](./to-observable.md).
