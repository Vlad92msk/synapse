# Selectors (createSelector)

> [Back to Main](../../README.md)

Selectors extract and compute data from storage. Memoized — recalculate only when dependencies change. Can be combined.

## 1. Creating SelectorModule

```typescript
import { MemoryStorage, SelectorModule } from 'synapse-storage/core'

interface ProductState {
  products: Array<{ id: number; name: string; price: number; category: string }>
  filterCategory: 'all' | 'food' | 'tech'
  sortBy: 'name' | 'price'
}

const storage = new MemoryStorage<ProductState>({
  name: 'products',
  initialState: { products: [...], filterCategory: 'all', sortBy: 'name' },
})
await storage.initialize()

// SelectorModule is bound to a specific storage
const sm = new SelectorModule(storage)
```

## 2. createSelector — Simple

```typescript
// Simple selector — extracts a part of the state
const products = sm.createSelector((state) => state.products)
const filterCategory = sm.createSelector((state) => state.filterCategory)
const sortBy = sm.createSelector((state) => state.sortBy)

// With custom equals (for arrays/objects, to avoid unnecessary notifications)
const foodNames = sm.createSelector(
  (state) => state.products
    .filter((p) => p.category === 'food')
    .map((p) => p.name),
  {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    name: 'foodNames',   // optional name for debugging
  }
)
```

## 3. createSelector — Combined

Combined selectors depend on other selectors. Recalculate only when dependencies change.

```typescript
const filtered = sm.createSelector(
  [products, filterCategory],           // dependencies — other selectors
  (productsVal, categoryVal) => {       // compute function
    if (categoryVal === 'all') return productsVal
    return productsVal.filter((p) => p.category === categoryVal)
  }
)

// Chain: filtered -> sorted
const sorted = sm.createSelector(
  [filtered, sortBy],
  (items, sort) => [...items].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : a.price - b.price
  )
)

// Computed value from dependency
const totalPrice = sm.createSelector(
  [filtered],
  (items) => items.reduce((sum, p) => sum + p.price, 0)
)
```

## 4. useSelector — React Hook

```typescript
import { useSelector } from 'synapse-storage/react'

function ProductList() {
  // Basic usage — returns T | undefined
  const sorted = useSelector(selectors.sorted)
  const total = useSelector(selectors.totalPrice)
  const category = useSelector(selectors.filterCategory)

  // With withLoading — returns { data: T, isLoading: boolean }
  const { data: products, isLoading } = useSelector(
    selectors.products,
    { withLoading: true }
  )

  if (isLoading) return <div>Loading...</div>

  return <div>{sorted?.map(p => <div key={p.id}>{p.name}: {p.price}</div>)}</div>
}
```

## 5. Programmatic Access to Selector

```typescript
// select() — get current value
const value = selectors.totalPrice.select()

// selectSync() — sync read from cache
const value = selectors.totalPrice.selectSync()

// subscribe() — manual subscription to changes
const unsub = selectors.totalPrice.subscribe({
  notify: (value) => console.log('total:', value)
})
unsub()

// Metadata
selectors.totalPrice.getId()            // unique selector ID
selectors.totalPrice.isSourceReady()    // is the storage ready?
```
