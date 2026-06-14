import { useState, useEffect } from 'react'
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher } from 'synapse-storage/reactive'
import { useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface CartState {
  items: Array<{ id: number; name: string; price: number; qty: number }>
  discount: number
}

const initialState: CartState = {
  items: [
    { id: 1, name: 'T-shirt', price: 2000, qty: 1 },
    { id: 2, name: 'Sneakers', price: 8000, qty: 1 },
  ],
  discount: 0,
}

// ─── Селекторы (class-based) ─────────────────────────────────────────────────────

class CartSelectors extends Selectors<CartState> {
  readonly items = this.select((s) => s.items)
  readonly discount = this.select((s) => s.discount)
  readonly totalPrice = this.combine([this.items, this.discount], (items, discount) => {
    const sum = items.reduce((acc, i) => acc + i.price * i.qty, 0)
    return sum * (1 - discount / 100)
  })
}

// ─── Dispatcher (class-based) ────────────────────────────────────────────────────
// Экшены и watchers — поля класса. Имя экшена = имя поля.

class CartDispatcher extends Dispatcher<CartState> {
  // this.action((store, params) => result) — payload экшена = возвращённое значение
  readonly addItem = this.action((store, params: { name: string; price: number }) => {
    store.update((s) => {
      s.items.push({ id: Date.now(), ...params, qty: 1 })
    })
    return params
  })

  readonly removeItem = this.action((store, id: number) => {
    store.update((s) => {
      s.items = s.items.filter((i) => i.id !== id)
    })
    return id
  })

  readonly changeQty = this.action((store, params: { id: number; delta: number }) => {
    store.update((s) => {
      const item = s.items.find((i) => i.id === params.id)
      if (item) item.qty = Math.max(1, item.qty + params.delta)
    })
    return params
  })

  readonly setDiscount = this.action((store, percent: number) => {
    store.set('discount', percent)
    return percent
  })

  // this.watcher — реактивно следит за изменением значения в state
  readonly watchItemCount = this.watcher({
    selector: (state) => state.items.length,
    notifyAfterSubscribe: true, // вызвать сразу при подписке
  })

  readonly watchDiscount = this.watcher({
    selector: (state) => state.discount,
    shouldTrigger: (prev, current) => prev !== current, // фильтр срабатывания
  })
}

// ─── Создание synapse с dispatcher ─────────────────────────────────────────────

const cartSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<CartState>({ name: 'cart-dispatcher', initialState })
  return {
    storage,
    dispatcher: new CartDispatcher(storage),
    selectors: new CartSelectors(storage),
  }
})

type CartSynapse = Awaited<typeof cartSynapse>

// ─── Компонент-пример ──────────────────────────────────────────────────────────

export function CreateSynapseDispatcherExample() {
  const [store, setStore] = useState<CartSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    cartSynapse.then((s) => { if (!cancelled) setStore(s) })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>createSynapse (dispatcher)</h2>
      <p>Storage + selectors + dispatcher. Actions для изменения state, watchers для реактивного отслеживания.</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher } from 'synapse-storage/reactive'

// Selectors — поля класса
class CartSelectors extends Selectors<CartState> {
  readonly items = this.select((s) => s.items)
  readonly discount = this.select((s) => s.discount)
  readonly totalPrice = this.combine([this.items, this.discount], (items, discount) => { ... })
}

// Dispatcher — экшены и watchers как поля класса
class CartDispatcher extends Dispatcher<CartState> {
  readonly addItem = this.action((store, params: { name: string; price: number }) => { ... })
  readonly watchItemCount = this.watcher({ selector: (s) => s.items.length })
}

const cartSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<CartState>({ name: 'cart', initialState })
  return {
    storage,
    dispatcher: new CartDispatcher(storage),
    selectors: new CartSelectors(storage),
  }
})`}</pre>

      {/* ─── this.action ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>this.action</h3>
      <pre style={codeBlock}>{`// this.action((store, params) => result) — handler в «рецептной» сигнатуре
class CartDispatcher extends Dispatcher<CartState> {
  readonly addItem = this.action((store, params: { name: string; price: number }) => {
    store.update((s) => {
      s.items.push({ id: Date.now(), ...params, qty: 1 })
    })
    return params           // return = payload в action stream
  })
}

// Вызов через store.actions (имя экшена = имя поля)
store.actions.addItem({ name: 'Hat', price: 1500 })

// actionType генерируется из имени поля при финализации
store.actions.addItem.actionType  // '[cart]addItem'`}</pre>

      {/* ─── this.watcher ─────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>this.watcher</h3>
      <pre style={codeBlock}>{`// this.watcher — реактивно отслеживает изменения в state
class CartDispatcher extends Dispatcher<CartState> {
  readonly watchItemCount = this.watcher({
    selector: (state) => state.items.length,        // что отслеживать
    notifyAfterSubscribe: true,                     // вызвать сразу при подписке
    shouldTrigger: (prev, curr) => prev !== curr,   // фильтр (опционально)
  })
}

// Подписка — возвращает RxJS Observable
const sub = store.dispatcher.watchers.watchItemCount().subscribe((action) => {
  console.log('items count:', action.payload)
})

// Отписка
sub.unsubscribe()`}</pre>

      {/* ─── Возвращаемое значение ───────────────────────────────────── */}
      <h3 style={sectionTitle}>Возвращаемое значение</h3>
      <pre style={codeBlock}>{`const store = await cartSynapse

store.storage     // IStorage<CartState>
store.selectors   // экземпляр CartSelectors
store.actions     // { addItem, removeItem, changeQty, setDiscount }
store.dispatcher  // экземпляр CartDispatcher (dispatch, watchers, action$)

// store.actions — shortcut для store.dispatcher.dispatch
// store.actions.addItem === store.dispatcher.dispatch.addItem

// Поток всех actions (RxJS Observable)
store.dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})`}</pre>

      {/* ─── Живая демо ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Demo</h3>
      <CartDemo store={store} />
    </div>
  )
}

function CartDemo({ store }: { store: CartSynapse }) {
  const items = useSelector(store.selectors.items)
  const totalPrice = useSelector(store.selectors.totalPrice)
  const discount = useSelector(store.selectors.discount)
  const [watcherLogs, setWatcherLogs] = useState<string[]>([])

  useEffect(() => {
    const sub1 = store.dispatcher.watchers.watchItemCount().subscribe((a: any) => {
      setWatcherLogs((prev) => [...prev.slice(-4), `[watchItemCount] count = ${a.payload}`])
    })
    const sub2 = store.dispatcher.watchers.watchDiscount().subscribe((a: any) => {
      setWatcherLogs((prev) => [...prev.slice(-4), `[watchDiscount] discount = ${a.payload}%`])
    })
    return () => { sub1.unsubscribe(); sub2.unsubscribe() }
  }, [store])

  return (
    <div>
      <p>Total: {totalPrice?.toFixed(0)} | Discount: {discount}%</p>

      <div style={buttonRow}>
        <button onClick={() => store.actions.addItem({ name: `Item ${Date.now() % 1000}`, price: 1000 + Math.floor(Math.random() * 4000) })}>
          Add item
        </button>
        <button onClick={() => store.actions.setDiscount(discount === 0 ? 15 : 0)}>
          {discount === 0 ? 'Apply 15% off' : 'Remove discount'}
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
            <th>Item</th><th>Price</th><th>Qty</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items?.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{item.name}</td>
              <td>{item.price}</td>
              <td>
                <button onClick={() => store.actions.changeQty({ id: item.id, delta: -1 })}>-</button>
                {' '}{item.qty}{' '}
                <button onClick={() => store.actions.changeQty({ id: item.id, delta: 1 })}>+</button>
              </td>
              <td><button onClick={() => store.actions.removeItem(item.id)}>x</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {watcherLogs.length > 0 && (
        <div style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>
          <strong>Watcher logs:</strong>
          {watcherLogs.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      )}
    </div>
  )
}
