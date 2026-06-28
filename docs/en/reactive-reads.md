# Reactive reads & controlled re-renders

> [Back to Main](../../README.md)

The everyday pattern: you mutate a storage with ordinary methods (`set`/`update`) and read it
**reactively** inside a component. Synapse gives you several hooks for this — the difference between
them is **how much control you get over re-renders**. The examples use the end-to-end `todoStorage`
(`TodoState = { todos: Todo[]; filter: Filter }`).

| Hook | Re-renders | RxJS | Use when |
|------|-----------|------|----------|
| `useStorageSubscribe` | on every change of the selected slice | no | default reactive read |
| `useSelector` | on every change of the selected slice | no | reading a `SelectorAPI` |
| `useStorageObservable` | on every change of the selected slice | yes | you need RxJS operators |
| `useStorageRef` | **only when you decide** | no | you control re-renders yourself |

## useStorageSubscribe — the default

`useSyncExternalStore` under the hood (Concurrent-safe), no RxJS. Re-renders when the selected slice
changes. For primitive selectors it already de-dupes via `Object.is`; for object/array slices pass
`equals` so an unrelated store change doesn't re-render the component.

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// primitive slice — de-duped automatically
const filter = useStorageSubscribe(todoStorage, (s) => s.filter)

// object/array slice — `equals` keeps a stable snapshot and skips needless re-renders
const todos = useStorageSubscribe(todoStorage, (s) => s.todos, {
  equals: (a, b) => a === b,
})
```

## useStorageObservable — the RxJS path

A memoizing wrapper over `toObservable` + `useObservable`. Equivalent to `useStorageSubscribe`, but
you can pipe RxJS operators on top of the state stream. It memoizes the observable by `[storage]`, so
it does **not** re-subscribe on every render (the footgun of inlining `toObservable(storage)` in
render).

```typescript
import { useStorageObservable } from 'synapse-storage/react'

// whole state
const state = useStorageObservable(todoStorage)

// a slice — emits only when the slice changes (distinctUntilChanged)
const total = useStorageObservable(todoStorage, (s) => s.todos.length)
```

## useStorageRef — you control the re-renders

Holds the **fresh** value in a `ref` (updated on every store change) but does **not** re-render the
component automatically. It returns `{ ref, get, rerender }` and hands control to you:

```typescript
import { useStorageRef } from 'synapse-storage/react'

function TodoCounter() {
  const { ref, get, rerender } = useStorageRef(todoStorage, (s) => s.todos.length)

  // "no re-render at all" — read the latest value on demand inside a handler
  const logCount = () => console.log('current count:', get())

  // "re-render when I decide" — UI reads ref.current, you re-render manually
  return (
    <div>
      <span>{ref.current}</span>
      <button onClick={logCount}>log</button>
      <button onClick={rerender}>refresh</button>
    </div>
  )
}
```

**"Re-render conditionally"** — pass `shouldRerender(prev, next)`; the component re-renders only when
it returns `true` (the value in `ref` is already fresh at that point):

```typescript
// re-render only when crossing the empty/non-empty boundary
const { ref } = useStorageRef(todoStorage, (s) => s.todos.length, {
  shouldRerender: (prev, next) => (prev === 0) !== (next === 0),
})
```

Notes:

- `useStorageRef` does **not** use `useSyncExternalStore` (it can't skip a re-render on the
  component's decision), so it intentionally drops the Concurrent-Mode tearing guarantee — acceptable
  for the "I control re-renders" scenario.
- The returned `{ ref, get, rerender }` handle is stable across renders.
- The default selector returns the whole state. Pass `null` as the storage (before init) and `get()`
  returns `undefined`.

## toObservable — outside React

For effects and non-React code, `toObservable(storage)` turns a storage into an `Observable` of the
whole state. With a selector it emits only the slice, de-duped via `distinctUntilChanged` (default
`Object.is`, or a custom `equals`):

```typescript
import { toObservable } from 'synapse-storage/reactive'

const state$ = toObservable(todoStorage)                       // Observable<TodoState>
const count$ = toObservable(todoStorage, (s) => s.todos.length) // Observable<number>, distinct
```
