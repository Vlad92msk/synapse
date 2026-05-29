# Селекторы (createSelector)

> [Назад к оглавлению](./README.md)

Селекторы извлекают и вычисляют данные из хранилища. Мемоизированы — пересчитываются только при изменении зависимостей. Могут комбинироваться.

## 1. Создание SelectorModule

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

// SelectorModule привязан к конкретному хранилищу
const sm = new SelectorModule(storage)
```

## 2. createSelector — Простой

```typescript
// Простой селектор — извлекает часть состояния
const products = sm.createSelector((state) => state.products)
const filterCategory = sm.createSelector((state) => state.filterCategory)
const sortBy = sm.createSelector((state) => state.sortBy)

// С пользовательским equals (для массивов/объектов, чтобы избежать лишних уведомлений)
const foodNames = sm.createSelector(
  (state) => state.products
    .filter((p) => p.category === 'food')
    .map((p) => p.name),
  {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    name: 'foodNames',   // необязательное имя для отладки
  }
)
```

## 3. createSelector — Комбинированный

Комбинированные селекторы зависят от других селекторов. Пересчитываются только при изменении зависимостей.

```typescript
const filtered = sm.createSelector(
  [products, filterCategory],           // зависимости — другие селекторы
  (productsVal, categoryVal) => {       // функция вычисления
    if (categoryVal === 'all') return productsVal
    return productsVal.filter((p) => p.category === categoryVal)
  }
)

// Цепочка: filtered -> sorted
const sorted = sm.createSelector(
  [filtered, sortBy],
  (items, sort) => [...items].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : a.price - b.price
  )
)

// Вычисляемое значение из зависимости
const totalPrice = sm.createSelector(
  [filtered],
  (items) => items.reduce((sum, p) => sum + p.price, 0)
)
```

## 4. useSelector — React-хук

```typescript
import { useSelector } from 'synapse-storage/react'

function ProductList() {
  // Базовое использование — возвращает T | undefined
  const sorted = useSelector(selectors.sorted)
  const total = useSelector(selectors.totalPrice)
  const category = useSelector(selectors.filterCategory)

  // С withLoading — возвращает { data: T, isLoading: boolean }
  const { data: products, isLoading } = useSelector(
    selectors.products,
    { withLoading: true }
  )

  if (isLoading) return <div>Loading...</div>

  return <div>{sorted?.map(p => <div key={p.id}>{p.name}: {p.price}</div>)}</div>
}
```

## 5. Программный доступ к селектору

```typescript
// select() — получить текущее значение
const value = selectors.totalPrice.select()

// selectSync() — синхронное чтение из кеша
const value = selectors.totalPrice.selectSync()

// subscribe() — ручная подписка на изменения
const unsub = selectors.totalPrice.subscribe({
  notify: (value) => console.log('итого:', value)
})
unsub()

// Метаданные
selectors.totalPrice.getId()            // уникальный ID селектора
selectors.totalPrice.isSourceReady()    // готово ли хранилище?
```
