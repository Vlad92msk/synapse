# Selectors

> [Back to contents](./README.md) · [Example: selectors](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SelectorSystemExample.tsx) · [Example: reactive selectors](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/ReactiveSelectorExample.tsx)

Selectors extract and compute data from a storage. They are **memoized** — recomputed only when their
dependencies change, so expensive computations (filtering, aggregation) aren't repeated on every read.
They can be **combined** with one another and with selectors of other stores. In the class form,
selectors are declared as **class fields** — the fields are real `SelectorAPI` right away (eager
materialization, no "recipes").

**When to use:** a derived/computed value (counters, filtered lists, flags) that you need repeatedly and
without redundant recomputes; a shared source for several components; cross-module relations. **When you
DON'T need it:** a one-off read of a field as-is — [`get`/`getState`](./reading-data.md) is enough; a
simple subscription to one field — [`subscribe`](./subscriptions.md).

Three factories (all `protected`, called in the class body via `this.`):

| Factory | What it creates | When |
|---|---|---|
| `this.select(fn, opts?)` | a simple selector over state | pull out a part/field of the state |
| `this.combine([deps], fn, opts?)` | a combined selector over other selectors | compute a value from dependencies |
| `this.keyed(key => fn, opts?)` | a factory of "one `SelectorAPI` per key" | parametric access (by id, etc.) |

The examples use the end-to-end `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`) from the
[MemoryStorage](./memory-storage.md) section and its canonical `TodoSelectors` set.

## 1. The Selectors class

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'

interface Todo { id: string; title: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'
interface TodoState { todos: Todo[]; filter: Filter }

const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
})
await todoStorage.initialize()

// The class is bound to the storage through the constructor.
class TodoSelectors extends Selectors<TodoState> {
  readonly todos = this.select((s) => s.todos)
}
const selectors = new TodoSelectors(todoStorage)
```

## 2. this.select — simple

```typescript
const filterTodos = (todos: Todo[], filter: Filter) =>
  filter === 'all' ? todos : todos.filter((t) => (filter === 'active' ? !t.done : t.done))

class TodoSelectors extends Selectors<TodoState> {
  readonly todos = this.select((s) => s.todos)
  readonly filter = this.select((s) => s.filter)

  // With a custom equals (for arrays/objects, to avoid extra notifications)
  readonly titles = this.select((s) => s.todos.map((t) => t.title), {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    name: 'titles',   // an optional name for debugging
  })
}
```

Intermediate slices can be declared `private` — they aren't visible from the outside, but work as dependencies in `this.combine`.

## 3. this.combine — combined

Combined selectors depend on other selectors. They are recomputed only when their dependencies change.

```typescript
class TodoSelectors extends Selectors<TodoState> {
  readonly todos = this.select((s) => s.todos)
  readonly filter = this.select((s) => s.filter)

  // Chain: todos + filter -> visible tasks
  readonly visibleTodos = this.combine([this.todos, this.filter], (todos, filter) =>
    filterTodos(todos, filter),
  )

  // Values computed from a dependency
  readonly activeCount = this.combine([this.todos], (todos) => todos.filter((t) => !t.done).length)
  readonly completedCount = this.combine([this.todos], (todos) => todos.filter((t) => t.done).length)
}
```

### this.keyed — a parametric selector

```typescript
class TodoSelectors extends Selectors<TodoState> {
  // One SelectorAPI per key (cache by key). Compares values structurally by default.
  readonly byId = this.keyed((id: string) => (s: TodoState) => s.todos.find((t) => t.id === id))
}

selectors.byId('t1').select()   // a SelectorAPI for a specific id
```

By default `keyed` compares values **structurally** (`deepEquals`), not by reference: adjacent keys live
under a shared parent, and on update the storage re-clones the whole branch — without structural
comparison, an update to key `A` would notify subscribers of key `B`.

### All options (commented)

The full surface of the factories and `SelectorOptions` — what you can pass and why:

```typescript
class TodoSelectors extends Selectors<TodoState> {
  // ── this.select(selector, options?) ──
  // selector: (state) => R — extracts a value from state.
  readonly titles = this.select(
    (s) => s.todos.map((t) => t.title),
    {
      // equals?: (a, b) => boolean — how to compare the NEW and OLD selector value.
      //   Defaults to reference comparison (===). For arrays/objects provide your own,
      //   otherwise every store change = "a new reference" = a redundant notification/re-render.
      equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
      // name?: string — an optional name for debugging (in errors/logs).
      name: 'titles',
    },
  )

  // ── this.combine([deps], fn, options?) ──
  // deps: SelectorAPI[] — dependencies (your own and/or cross-store).
  // fn: (...depValues) => R — combines their values. Recomputes only when deps change.
  // options — the same SelectorOptions (equals / name).
  readonly visibleTodos = this.combine(
    [this.select((s) => s.todos), this.select((s) => s.filter)],
    (todos, filter) => filterTodos(todos, filter),
    { name: 'visibleTodos' },
  )

  // ── this.keyed(key => selector, options?) ──
  // key => (state) => R — the key function returns a selector for that key.
  // options — SelectorOptions; equals DEFAULTS to deepEquals (structural comparison),
  //   overridden via options.equals.
  readonly byId = this.keyed(
    (id: string) => (s: TodoState) => s.todos.find((t) => t.id === id),
    { name: 'todoById' },
  )
}
```

`SelectorOptions` in full: `{ equals?: (a, b) => boolean; name?: string }`. There are no other fields.

### Cross-store: external selectors through the constructor

A selector can depend on a selector of **another store**. External selectors come in as a **constructor
parameter** and take part in `this.combine` on equal footing with your own — the combined selector
recomputes when any of the stores change. (In v6 there's no separate `combineAcross` — cross-store is
done with this constructor-based DI.)

```typescript
import type { IStorage, SelectorAPI } from 'synapse-storage/core'

class PostsSelectors extends Selectors<PostsState> {
  readonly list = this.select((s) => s.list)

  // cross-store: recomputed reactively when the other store changes.
  // Declare the field, but create the combine ITSELF in the constructor body — see the pitfall below.
  readonly currentUserId: SelectorAPI<number | null>

  constructor(storage: IStorage<PostsState>, private core: CoreSelectors) {
    super(storage)
    this.currentUserId = this.combine([this.core.profile], (p) => p?.id ?? null)
  }
}
```

> **The `useDefineForClassFields` pitfall.** With `useDefineForClassFields: true` (the default for
> target ES2022+) field initializers run BEFORE the parameter properties are assigned — that is, at the
> moment of `readonly x = this.combine([this.core.foo], …)` the value of `this.core` is still
> `undefined`, and the dependency silently ends up empty. That's why you create a cross-store `combine`
> **in the constructor body after `super()`** (as above), or set
> `"useDefineForClassFields": false` in tsconfig. There's a dev check: `combine()` throws a clear error
> if a dependency isn't a `SelectorAPI`.

More details on cross-module relations — [Cross-module dependencies](./dependencies.md).

> **Aggregated source readiness.** A combined selector (`this.combine`) is considered
> ready only when its local source is ready **and all sources of its dependencies** are. For the
> cross-store case above, `currentUserId.isSourceReady()` returns `true` only after both
> the `PostsState` store and the `core` store are ready. The same aggregation applies to
> `onSourceStatusChange`. A simple selector (`this.select`) is bound to its single
> source.

## 4. Reactive selector (selector.$)

Every selector has a `.$` field — an `Observable<T>`. It emits the current value on subscription and on every
**real** change (the same semantics as `subscribe`). This lets you transform reads reactively —
not only in React.

### Outside React

```typescript
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

// A regular subscription
const sub = selectors.activeCount.$.subscribe((count) => console.log('active:', count))
sub.unsubscribe()

// Transformation straight in the stream
selectors.activeCount.$
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((count) => console.log('debounced:', count))
```

### In effects

`selector.$` is convenient as an effect's source — for example, debouncing a search query:

```typescript
class SearchEffects extends Effects<SearchState, SearchDispatcher> {
  constructor(private readonly selectors: SearchSelectors) { super() }

  readonly autoSearch = this.effect((_action$, _state$, { dispatcher: d }) =>
    this.selectors.searchQuery.$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap((query) => d.search(query)),
    ),
  )
}
```

### In React — useObservable / useSubscription

```typescript
import { useObservable, useSubscription } from 'synapse-storage/react'
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'

function TodoStats() {
  // useObservable — renders a derived value from the selector's stream.
  // deps recreate the chain (important for stateful operators like debounceTime/scan).
  const debouncedActive = useObservable(
    () => selectors.activeCount.$.pipe(debounceTime(300), distinctUntilChanged(), map((n) => `${n}`)),
    '0',
    [],
  )

  // useSubscription — an imperative side-effect with no value returned to render.
  useSubscription(
    () => selectors.activeCount.$.pipe(distinctUntilChanged()).subscribe((n) => console.log('changed:', n)),
    [],
  )

  return <div>active (debounced): {debouncedActive}</div>
}
```

## 5. useSelector — React hook (current value)

```typescript
import { useSelector } from 'synapse-storage/react'

function TodoList() {
  // Basic usage — returns T | undefined
  const visible = useSelector(selectors.visibleTodos)
  const active = useSelector(selectors.activeCount)

  // With withLoading — returns { data: T, isLoading: boolean }
  const { data: todos, isLoading } = useSelector(selectors.todos, { withLoading: true })

  if (isLoading) return <div>Loading...</div>

  return <div>{visible?.map((t) => <div key={t.id}>{t.title}</div>)}</div>
}
```

## 6. Programmatic access to a selector

```typescript
// select() — get the current value
const value = selectors.activeCount.select()

// selectSync() — synchronous read from the cache
const value = selectors.activeCount.selectSync()

// subscribe() — manual subscription to changes
const unsub = selectors.activeCount.subscribe({
  notify: (value) => console.log('active:', value),
})
unsub()

// Metadata
selectors.activeCount.getId()            // the selector's unique ID
selectors.activeCount.isSourceReady()    // are ALL of the selector's sources ready?

// For a combined selector, isSourceReady() aggregates the readiness of all dependency
// sources (important for cross-store). onSourceStatusChange — subscribe to this readiness:
const unsub2 = selectors.activeCount.onSourceStatusChange((isReady) => {
  console.log('sources ready:', isReady)
})
unsub2()
```
