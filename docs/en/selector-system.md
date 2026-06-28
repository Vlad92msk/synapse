# Selectors

> [Back to Main](../../README.md)

Selectors extract and compute data from a storage. They are memoized — recomputed only when their
dependencies change. They can be combined. In the class form, selectors are declared as **class fields** —
the fields are real `SelectorAPI` right away (eager materialization).

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

### Cross-store: external selectors through the constructor

A selector can depend on a selector of **another store**. External selectors come in as a constructor parameter —
parameter properties are assigned BEFORE the field initializers, so `this.core` is available in the fields.

```typescript
import type { IStorage, SelectorAPI } from 'synapse-storage/core'

class PostsSelectors extends Selectors<PostsState> {
  readonly list = this.select((s) => s.list)

  // cross-store: recomputed reactively when the other store changes
  readonly currentUserId: SelectorAPI<number | null>

  constructor(storage: IStorage<PostsState>, private core: CoreSelectors) {
    super(storage)
    this.currentUserId = this.combine([this.core.profile], (p) => p?.id ?? null)
  }
}
```

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
