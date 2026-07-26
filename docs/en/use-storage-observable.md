# useStorageObservable / useObservable

> [Back to contents](./README.md)

**TL;DR.** The RxJS path for "store → reactive in a component". Two hooks:

- **`useStorageObservable(storage[, selector])`** — sugar: a store slice into render via RxJS, with no
  operators of your own. Equivalent to [`useStorageSubscribe`](./use-storage-subscribe.md), only inside
  RxJS.
- **`useObservable(source, initial[, deps])`** — subscribe to **any** `Observable` (your own `pipe(...)`
  or `selector.$`) and return its value to render. This is one level down: here you build the stream
  yourself.

Need operators (`debounceTime`, `scan`, `bufferTime`)? Reach for `toObservable` + `useObservable`. Both
are imported from `synapse-storage/react`. The examples use the end-to-end `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Why

`useStorageSubscribe` returns a slice as is. As soon as you need **stream processing** between the store
and render (smooth it with a debounce, accumulate with `scan`, collapse with `bufferTime`), you need
RxJS. `useObservable` subscribes to a ready `Observable` in `useEffect` and puts the latest value into
state; `useStorageObservable` is a thin wrapper over `toObservable` + `useObservable` for the common case
of "just a slice, no operators of your own".

## When to use / when you don't need it

**`useStorageObservable`** — you need a store slice into render, but for ideological/stylistic reasons
through RxJS, with no operators of your own. If there are no operators and RxJS isn't important —
[`useStorageSubscribe`](./use-storage-subscribe.md) is simpler.

**`useObservable`** — you have **your own `Observable`**: an assembled `toObservable(...).pipe(...)`,
`selector.$`, or an external RxJS source, and its value is needed **in render**.

**Neither is needed** if:

- reactive read without RxJS → [`useStorageSubscribe`](./use-storage-subscribe.md);
- the result is a **side-effect**, not a render value → [`useSubscription`](./use-subscription.md);
- the stream is needed **outside React** → [`toObservable`](./to-observable.md).

## Signatures

```typescript
// sugar: a store slice into render via RxJS
useStorageObservable<S>(storage: IStorageBase<S>): S
useStorageObservable<S, R>(storage: IStorageBase<S>, selector: (state: S) => R): R

// low level: any Observable → value into render
useObservable<T>(
  source: Observable<T> | (() => Observable<T>),
  initialValue: T,
  deps?: DependencyList,
): T
```

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

## All parameters (commented)

```tsx
import { useStorageObservable, useObservable } from 'synapse-storage/react'
import { toObservable } from 'synapse-storage/reactive'
import { map } from 'rxjs/operators'

// --- useStorageObservable: a store slice into render, no operators of your own ---
const total = useStorageObservable(
  // 1. storage — IStorageBase. The stream is memoized by [storage] (no re-subscribe on render).
  todoStorage,
  // 2. selector? — a slice (map + distinctUntilChanged). Without it — the whole state.
  //    Deliberately NOT in deps: re-subscription happens only by storage.
  (s) => s.todos.length,
)

// --- useObservable: any Observable → value into render ---
const label = useObservable(
  // 1. source — an Observable OR a factory () => Observable. A factory is needed for your own
  //    operators (pipe). The hook memoizes the factory itself (see deps below).
  () => toObservable(todoStorage, (s) => s.todos.length).pipe(map((n) => `${n} todos`)),
  // 2. initialValue — what to return before the first emit (the stream emits the initial value
  //    on subscribe, so flicker is usually zero, but the type is required).
  '0 todos',
  // 3. deps? — re-subscription (rebuilds the whole chain). Default: for a factory — []
  //    (built once), for a direct Observable — [source]. Put here everything the factory
  //    closes over that can change (a limit prop, a store from props, …).
  [],
)
```

## Parameters

`useStorageObservable`:

| Parameter | Type | Description |
|---|---|---|
| `storage` | `IStorageBase<S>` | Storage. The stream is memoized by `[storage]`. |
| `selector?` | `(state: S) => R` | A slice (`map` + `distinctUntilChanged`). Without it — the whole state. Not in deps. |

`useObservable`:

| Parameter | Type | Description |
|---|---|---|
| `source` | `Observable<T> \| (() => Observable<T>)` | A ready stream or a factory. A factory is for your own operators. |
| `initialValue` | `T` | Value before the first emit. |
| `deps?` | `DependencyList` | Re-subscription. Default `[]` for a factory, `[source]` for a direct Observable. |

## Notes

- A `toObservable` selector stream already runs through `distinctUntilChanged` — an extra
  `distinctUntilChanged` right after the selector is almost always redundant.
- `useObservable` also accepts `selector.$` directly (the Observable form of `SelectorAPI`) — you can do
  `useObservable(selectors.active.$.pipe(debounceTime(300)), initial)`, see [Selectors](./selector-system.md).

## See also

- [useStorageSubscribe](./use-storage-subscribe.md) — a simple reactive read without RxJS.
- [useSubscription](./use-subscription.md) — the same stream, but as a side-effect (no render).
- [toObservable](./to-observable.md) — a stream outside React (effects, non-React code).
- [Reactive reads](./reactive-reads.md) — overview and choosing a tool.
