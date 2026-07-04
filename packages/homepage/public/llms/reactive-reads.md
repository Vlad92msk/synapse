<!-- source: docs/en/reactive-reads.md · canonical: https://synapse-homepage.web.app/docs#reactive-reads · part of https://synapse-homepage.web.app/llms-full.txt -->

# Reactive reads & controlled re-renders


The everyday pattern: you mutate a storage with ordinary methods (`set`/`update`) and read it
**reactively** inside a component. Synapse gives you several hooks for this — the difference between them
is **how much control you get over re-renders** and whether you need RxJS. This is an overview page: pick
the right tool from the table, the details live on dedicated pages. The examples use the end-to-end
`todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`).

## Which tool when

| Tool | Re-renders | RxJS | Use when | Page |
|------|-----------|------|----------|------|
| `useStorageSubscribe` | on every slice change | no | default reactive read | [useStorageSubscribe](./use-storage-subscribe.md) |
| `useSelector` | on every slice change | no | reading a `SelectorAPI` | [Selectors](./selector-system.md) |
| `useStorageObservable` | on every slice change | yes | you need RxJS operators | [useStorageObservable](./use-storage-observable.md) |
| `toObservable` | — (outside React) | yes | effects and non-React code | [toObservable](./to-observable.md) |
| `getStateSync()` | **none** | no | read the latest on demand in a handler | see below |

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
