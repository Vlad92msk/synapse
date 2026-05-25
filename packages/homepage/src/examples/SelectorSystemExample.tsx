import { useState, useEffect } from 'react'
import { MemoryStorage, SelectorModule } from 'synapse-storage/core'
import type { SelectorAPI } from 'synapse-storage/core'
import { useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ───────────────────────────────────────────────────────────────────

interface ProductState {
  products: Array<{ id: number; name: string; price: number; category: 'food' | 'tech' }>
  filterCategory: 'all' | 'food' | 'tech'
  sortBy: 'name' | 'price'
}

// ─── Создание хранилища и SelectorModule ────────────────────────────────────

const storage = new MemoryStorage<ProductState>({
  name: 'selector-demo',
  initialState: {
    products: [
      { id: 1, name: 'Apple', price: 2, category: 'food' },
      { id: 2, name: 'Laptop', price: 1200, category: 'tech' },
      { id: 3, name: 'Bread', price: 3, category: 'food' },
      { id: 4, name: 'Phone', price: 800, category: 'tech' },
      { id: 5, name: 'Milk', price: 4, category: 'food' },
    ],
    filterCategory: 'all',
    sortBy: 'name',
  },
})

let selectorModule: SelectorModule<ProductState>
let selectors: ReturnType<typeof createSelectors>

function createSelectors(sm: SelectorModule<ProductState>) {
  // ─── Простые селекторы ──────────────────────────────────────────────
  const products = sm.createSelector((s) => s.products)
  const filterCategory = sm.createSelector((s) => s.filterCategory)
  const sortBy = sm.createSelector((s) => s.sortBy)

  // ─── Комбинированный селектор ───────────────────────────────────────
  const filtered = sm.createSelector(
    [products, filterCategory],
    (items, cat) => cat === 'all' ? items : items.filter((p) => p.category === cat),
  )

  // ─── Цепочка: filtered → sorted ────────────────────────────────────
  const sorted = sm.createSelector(
    [filtered, sortBy],
    (items, sort) => [...items].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : a.price - b.price,
    ),
  )

  // ─── Вычисляемое значение ───────────────────────────────────────────
  const totalPrice = sm.createSelector(
    [filtered],
    (items) => items.reduce((sum, p) => sum + p.price, 0),
  )

  const count = sm.createSelector(
    [filtered],
    (items) => items.length,
  )

  // ─── С кастомным equals ─────────────────────────────────────────────
  const foodNames = sm.createSelector(
    (s) => s.products.filter((p) => p.category === 'food').map((p) => p.name),
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b), name: 'foodNames' },
  )

  return { products, filterCategory, sortBy, filtered, sorted, totalPrice, count, foodNames }
}

const readyPromise = storage.initialize().then(() => {
  selectorModule = new SelectorModule(storage)
  selectors = createSelectors(selectorModule)
})

// ─── Компонент ──────────────────────────────────────────────────────────────

export function SelectorSystemExample() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    readyPromise.then(() => setReady(true))
  }, [])

  if (!ready) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>Селекторы (Selector System)</h2>
      <p>
        Селекторы извлекают и вычисляют данные из хранилища. Мемоизируются — пересчитываются только
        при изменении зависимостей. Можно комбинировать.
      </p>

      {/* ─── Создание SelectorModule ──────────────────────────────────── */}
      <h3 style={sectionTitle}>1. Создание SelectorModule</h3>
      <pre style={codeBlock}>{`import { MemoryStorage, SelectorModule } from 'synapse-storage/core'

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

// SelectorModule привязывается к конкретному хранилищу
const sm = new SelectorModule(storage)`}</pre>

      {/* ─── Простые селекторы ────────────────────────────────────────── */}
      <h3 style={sectionTitle}>2. createSelector — простой</h3>
      <pre style={codeBlock}>{`// Простой селектор — извлекает часть состояния
const products = sm.createSelector((state) => state.products)
const filterCategory = sm.createSelector((state) => state.filterCategory)
const sortBy = sm.createSelector((state) => state.sortBy)

// С кастомным equals (для массивов/объектов, чтобы избежать лишних уведомлений)
const foodNames = sm.createSelector(
  (state) => state.products
    .filter((p) => p.category === 'food')
    .map((p) => p.name),
  {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    name: 'foodNames',   // опциональное имя для отладки
  }
)`}</pre>

      {/* ─── Комбинированные селекторы ────────────────────────────────── */}
      <h3 style={sectionTitle}>3. createSelector — комбинированный</h3>
      <pre style={codeBlock}>{`// Комбинированный селектор зависит от других селекторов.
// Пересчитывается только когда зависимости изменились.

const filtered = sm.createSelector(
  [products, filterCategory],           // зависимости — другие селекторы
  (productsVal, categoryVal) => {       // функция вычисления
    if (categoryVal === 'all') return productsVal
    return productsVal.filter((p) => p.category === categoryVal)
  }
)

// Цепочка: filtered → sorted
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
)`}</pre>

      {/* ─── useSelector (React hook) ─────────────────────────────────── */}
      <h3 style={sectionTitle}>4. useSelector — React hook</h3>
      <pre style={codeBlock}>{`import { useSelector } from 'synapse-storage/react'

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
}`}</pre>

      {/* ─── Программный доступ ───────────────────────────────────────── */}
      <h3 style={sectionTitle}>5. Программный доступ к селектору</h3>
      <pre style={codeBlock}>{`// select() — получить текущее значение
const value = selectors.totalPrice.select()

// selectSync() — синхронное получение из кеша
const value = selectors.totalPrice.selectSync()

// subscribe() — ручная подписка на изменения
const unsub = selectors.totalPrice.subscribe({
  notify: (value) => console.log('total:', value)
})
unsub()

// Метаданные
selectors.totalPrice.getId()            // уникальный ID селектора
selectors.totalPrice.isSourceReady()    // готово ли хранилище`}</pre>

      {/* ─── Демо ─────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Демо</h3>
      <SelectorDemo />
    </div>
  )
}

// ─── Демо-компонент ─────────────────────────────────────────────────────────

function SelectorDemo() {
  const sorted = useSelector(selectors.sorted)
  const totalPrice = useSelector(selectors.totalPrice)
  const count = useSelector(selectors.count)
  const filterCategory = useSelector(selectors.filterCategory)
  const sortBy = useSelector(selectors.sortBy)
  const foodNames = useSelector(selectors.foodNames)
  const { data: allProducts, isLoading } = useSelector(selectors.products, { withLoading: true })

  const [manualLog, setManualLog] = useState<string[]>([])

  // Ручная подписка на селектор
  useEffect(() => {
    const unsub = selectors.totalPrice.subscribe({
      notify: (value) => setManualLog((prev) => [...prev.slice(-3), `totalPrice → ${value}`]),
    })
    return unsub
  }, [])

  return (
    <div>
      <div style={{ fontSize: 13, background: '#f9f9f9', padding: 8, borderRadius: 4, marginBottom: 8 }}>
        <div>Показано: <strong>{count}</strong> товаров | Сумма: <strong>{totalPrice}</strong></div>
        <div>Фильтр: <strong>{filterCategory}</strong> | Сортировка: <strong>{sortBy}</strong></div>
        <div>Food names: <strong>{foodNames?.join(', ')}</strong></div>
        {isLoading && <div style={{ color: '#888' }}>Loading...</div>}
      </div>

      <div style={buttonRow}>
        <button onClick={() => storage.set('filterCategory', filterCategory === 'all' ? 'food' : filterCategory === 'food' ? 'tech' : 'all')}>
          filter: {filterCategory === 'all' ? '→ food' : filterCategory === 'food' ? '→ tech' : '→ all'}
        </button>
        <button onClick={() => storage.set('sortBy', sortBy === 'name' ? 'price' : 'name')}>
          sort: {sortBy === 'name' ? '→ price' : '→ name'}
        </button>
        <button onClick={() => storage.update((s) => {
          s.products.push({
            id: Date.now(),
            name: `Item${Math.floor(Math.random() * 100)}`,
            price: Math.floor(Math.random() * 500),
            category: Math.random() > 0.5 ? 'food' : 'tech',
          })
        })}>+ товар</button>
        <button onClick={() => storage.reset()}>reset</button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, margin: '8px 0' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
            <th>Name</th><th>Price</th><th>Category</th>
          </tr>
        </thead>
        <tbody>
          {sorted?.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{p.name}</td><td>{p.price}</td><td>{p.category}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={buttonRow}>
        <button onClick={() => {
          const val = selectors.totalPrice.select()
          alert(`select() = ${val}`)
        }}>selector.select()</button>
        <button onClick={() => {
          const val = selectors.totalPrice.selectSync()
          alert(`selectSync() = ${val}`)
        }}>selector.selectSync()</button>
      </div>

      <p style={{ fontSize: 12 }}>subscribe notify log:</p>
      <pre style={{ ...codeBlock, minHeight: 30 }}>
        {manualLog.join('\n') || '(измените данные чтобы увидеть)'}
      </pre>
    </div>
  )
}
