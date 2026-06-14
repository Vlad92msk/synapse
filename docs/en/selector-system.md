# Selectors

> [Back to Main](../../README.md)

Selectors extract and compute data from a storage. They are memoized — recomputed only when their
dependencies change. They can be combined. In the class form, selectors are declared as **class fields** —
the fields are real `SelectorAPI` right away (eager materialization).

## 1. The Selectors class

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'

interface ProductState {
  products: Array<{ id: number; name: string; price: number; category: string }>
  filterCategory: 'all' | 'food' | 'tech'
  sortBy: 'name' | 'price'
}

const storage = new MemoryStorage<ProductState>({
  name: 'products',
  initialState: { products: [], filterCategory: 'all', sortBy: 'name' },
})
await storage.initialize()

// The class is bound to the storage through the constructor.
class ProductSelectors extends Selectors<ProductState> {
  readonly products = this.select((s) => s.products)
}
const selectors = new ProductSelectors(storage)
```

## 2. this.select — simple

```typescript
class ProductSelectors extends Selectors<ProductState> {
  readonly products = this.select((s) => s.products)
  readonly filterCategory = this.select((s) => s.filterCategory)
  readonly sortBy = this.select((s) => s.sortBy)

  // With a custom equals (for arrays/objects, to avoid extra notifications)
  readonly foodNames = this.select(
    (s) => s.products.filter((p) => p.category === 'food').map((p) => p.name),
    {
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      name: 'foodNames',   // an optional name for debugging
    },
  )
}
```

Intermediate slices can be declared `private` — they aren't visible from the outside, but work as dependencies in `this.combine`.

## 3. this.combine — combined

Combined selectors depend on other selectors. They are recomputed only when their dependencies change.

```typescript
class ProductSelectors extends Selectors<ProductState> {
  readonly products = this.select((s) => s.products)
  readonly filterCategory = this.select((s) => s.filterCategory)
  readonly sortBy = this.select((s) => s.sortBy)

  readonly filtered = this.combine([this.products, this.filterCategory], (items, cat) =>
    cat === 'all' ? items : items.filter((p) => p.category === cat),
  )

  // Chain: filtered -> sorted
  readonly sorted = this.combine([this.filtered, this.sortBy], (items, sort) =>
    [...items].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : a.price - b.price)),
  )

  // A value computed from a dependency
  readonly totalPrice = this.combine([this.filtered], (items) => items.reduce((sum, p) => sum + p.price, 0))
}
```

### this.keyed — a parametric selector

```typescript
class ProductSelectors extends Selectors<ProductState> {
  // One SelectorAPI per key (cache by key). Compares values structurally by default.
  readonly byId = this.keyed((id: number) => (s: ProductState) => s.products.find((p) => p.id === id))
}

selectors.byId(5).select()   // a SelectorAPI for a specific id
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
const sub = selectors.totalPrice.$.subscribe((total) => console.log('total:', total))
sub.unsubscribe()

// Transformation straight in the stream
selectors.searchQuery.$
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((query) => runSearch(query))
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

function SearchBox() {
  const selectors = useSynapseSelectors()

  // useObservable — renders a derived value from the selector's stream.
  // deps recreate the chain (important for stateful operators like debounceTime/scan).
  const debounced = useObservable(
    () => selectors.searchQuery.$.pipe(debounceTime(300), distinctUntilChanged()),
    '',
    [selectors],
  )

  // useSubscription — an imperative side-effect with no value returned to render.
  useSubscription(
    () => selectors.lastId.$.pipe(skip(1), tap(scrollToEnd)).subscribe(),
    [selectors],
  )

  return <div>{debounced}</div>
}
```

## 5. useSelector — React hook (current value)

```typescript
import { useSelector } from 'synapse-storage/react'

function ProductList() {
  // Basic usage — returns T | undefined
  const sorted = useSelector(selectors.sorted)
  const total = useSelector(selectors.totalPrice)

  // With withLoading — returns { data: T, isLoading: boolean }
  const { data: products, isLoading } = useSelector(selectors.products, { withLoading: true })

  if (isLoading) return <div>Loading...</div>

  return <div>{sorted?.map((p) => <div key={p.id}>{p.name}: {p.price}</div>)}</div>
}
```

## 6. Programmatic access to a selector

```typescript
// select() — get the current value
const value = selectors.totalPrice.select()

// selectSync() — synchronous read from the cache
const value = selectors.totalPrice.selectSync()

// subscribe() — manual subscription to changes
const unsub = selectors.totalPrice.subscribe({
  notify: (value) => console.log('total:', value),
})
unsub()

// Metadata
selectors.totalPrice.getId()            // the selector's unique ID
selectors.totalPrice.isSourceReady()    // are ALL of the selector's sources ready?

// For a combined selector, isSourceReady() aggregates the readiness of all dependency
// sources (important for cross-store). onSourceStatusChange — subscribe to this readiness:
const unsub = selectors.totalPrice.onSourceStatusChange((isReady) => {
  console.log('sources ready:', isReady)
})
unsub()
```
