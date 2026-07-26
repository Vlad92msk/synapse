# Reactive reads & controlled re-renders

> [Back to contents](./README.md)

**TL;DR.** You mutate a storage with ordinary methods (`set`/`update`) and read it **reactively** inside a
component. There are five tools, and they are easy to confuse — this page is about **which one to pick**.
Quick answer: by default `useStorageSubscribe` (no RxJS); if you need operators — `useStorageObservable`
or `toObservable` + `useObservable`; if you need a side effect (toast/log) — `useSubscription`; if you read
a `SelectorAPI` — `useSelector`. The examples use the end-to-end `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

## Why

The difference between the tools is along two axes: **whether you need RxJS** (operators
`debounceTime`/`scan`/…) and **what you do with the stream** (render a value or run a side effect). Below
is the choice along these axes.

## What to pick

| Tool | Where | RxJS | Yields | Use when | Page |
|------|-------|------|--------|----------|------|
| `useStorageSubscribe` | React | no | a slice value into render | **default reactive read** | [→](./use-storage-subscribe.md) |
| `useSelector` | React | no | a `SelectorAPI` value into render | you read a memoized selector | [→](./selector-system.md) |
| `useStorageObservable` | React | yes | a slice value into render | you just need a slice via RxJS | [→](./use-storage-observable.md) |
| `useObservable` | React | yes | any `Observable`'s value into render | your own `pipe(...)` over a stream/`selector.$` | [→](./use-storage-observable.md) |
| `useSubscription` | React | yes | **nothing** (side effect) | toast/log/dispatch on each emit | [→](./use-subscription.md) |
| `toObservable` | outside React | yes | an `Observable` | effects, non-React code | [→](./to-observable.md) |
| `getStateSync()` | anywhere | no | a value **once**, no re-render | read the latest in a handler | see below |

How it all fits together:

- **You don't need RxJS and want a value in render** → `useStorageSubscribe` (from a store) or
  `useSelector` (from a `SelectorAPI`). 90% of cases.
- **You need RxJS operators** → first `toObservable(storage, selector)` builds the stream; then in React it
  is subscribed by `useObservable` (a value into render) or `useSubscription` (a side effect).
  `useStorageObservable` is sugar over `toObservable` + `useObservable` for the "just a slice without your
  own operators" case.
- **Outside React** (effects, watchers, non-React modules) → only `toObservable`.

## Reading without a re-render is not a hook

A common case is "read the current value at the moment of a click/submit without re-rendering the
component on every store change". You **don't need a dedicated hook** for that: a storage is read
synchronously on demand via `getStateSync()`.

```typescript
// zero subscriptions, zero re-renders — the fresh value at call time
const onSave = () => {
  const { todos } = todoStorage.getStateSync()
  api.save(todos)
}
```

If you want a re-render only when a specific slice changes, that's `useStorageSubscribe` with `equals`
(Concurrent-safe), not a manual force. If you need operators (`debounceTime`, `scan`, …), that's
`useStorageObservable` / `toObservable`. There is deliberately no "ref hook with a manual re-render" in
the API: all three scenarios are covered by the tools above.

## When you don't need it

- **You need the value once, no reaction to changes** → `getStateSync()` / `get()`, see
  [Reading data](./reading-data.md). Reactive hooks here only spawn extra subscriptions.
- **Logic outside React and without streams** (a plain handler, not an effect) → the low-level
  `storage.subscribe(selector, cb)`, see [Subscriptions](./subscriptions.md).

## See also

- [useStorageSubscribe](./use-storage-subscribe.md) — the default reactive read.
- [useStorageObservable / useObservable](./use-storage-observable.md) — the same, but with RxJS operators.
- [useSubscription](./use-subscription.md) — a side effect on each emit (without render).
- [toObservable](./to-observable.md) — a state stream outside React (effects, non-React code).
- [Selectors](./selector-system.md) — `createSelector` + `useSelector`.
- [Subscriptions](./subscriptions.md) — the low-level `storage.subscribe`.
