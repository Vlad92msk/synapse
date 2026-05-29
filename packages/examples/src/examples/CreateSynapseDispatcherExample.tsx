import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'
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

// ─── Создание synapse с dispatcher ─────────────────────────────────────────────

const synapsePromise = createSynapse({
  storage: new MemoryStorage<CartState>({ name: 'cart-dispatcher', initialState }),

  createSelectorsFn: (selectorModule) => {
    const items = selectorModule.createSelector((s) => s.items)
    const discount = selectorModule.createSelector((s) => s.discount)
    const totalPrice = selectorModule.createSelector(
      [items, discount],
      (itemsVal, discountVal) => {
        const sum = itemsVal.reduce((acc, i) => acc + i.price * i.qty, 0)
        return sum * (1 - discountVal / 100)
      },
    )
    return { items, discount, totalPrice }
  },

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction, createWatcher }) => {
      // createAction — определяет действие с типизированными параметрами
      const addItem = createAction({
        type: 'addItem',
        action: (params: { name: string; price: number }) => {
          storage.update((s) => {
            s.items.push({ id: Date.now(), ...params, qty: 1 })
          })
          return params
        },
      })

      const removeItem = createAction({
        type: 'removeItem',
        action: (id: number) => {
          storage.update((s) => {
            s.items = s.items.filter((i) => i.id !== id)
          })
          return id
        },
      })

      const changeQty = createAction({
        type: 'changeQty',
        action: (params: { id: number; delta: number }) => {
          storage.update((s) => {
            const item = s.items.find((i) => i.id === params.id)
            if (item) item.qty = Math.max(1, item.qty + params.delta)
          })
          return params
        },
      })

      const setDiscount = createAction({
        type: 'setDiscount',
        action: (percent: number) => {
          storage.set('discount', percent)
          return percent
        },
      })

      // createWatcher — реактивно следит за изменением значения в state
      const watchItemCount = createWatcher({
        type: 'watchItemCount',
        selector: (state) => state.items.length,
        notifyAfterSubscribe: true, // вызвать сразу при подписке
      })

      const watchDiscount = createWatcher({
        type: 'watchDiscount',
        selector: (state) => state.discount,
        shouldTrigger: (prev, current) => prev !== current, // фильтр срабатывания
      })

      return { addItem, removeItem, changeQty, setDiscount, watchItemCount, watchDiscount }
    }),
})

type CartSynapse = Awaited<typeof synapsePromise>

// ─── Компонент-пример ──────────────────────────────────────────────────────────

export function CreateSynapseDispatcherExample() {
  const [store, setStore] = useState<CartSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    synapsePromise.then((s) => { if (!cancelled) setStore(s) })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>createSynapse (dispatcher)</h2>
      <p>Storage + selectors + dispatcher. Actions для изменения state, watchers для реактивного отслеживания.</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'

const synapsePromise = createSynapse({
  storage: new MemoryStorage<CartState>({ name: 'cart', initialState }),

  createSelectorsFn: (selectorModule) => ({
    items: selectorModule.createSelector((s) => s.items),
    discount: selectorModule.createSelector((s) => s.discount),
    totalPrice: selectorModule.createSelector(
      [items, discount],
      (itemsVal, discountVal) => { ... },
    ),
  }),

  // Dispatcher — определяет actions и watchers
  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction, createWatcher }) => {
      // ... actions и watchers
      return { addItem, removeItem, setDiscount, watchItemCount }
    }),
})`}</pre>

      {/* ─── createAction ─────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>createAction</h3>
      <pre style={codeBlock}>{`// createAction — определяет действие с типом и логикой
const addItem = createAction({
  type: 'addItem',                          // уникальный тип действия
  action: (params: { name: string }) => {   // логика (sync или async)
    storage.update((s) => {
      s.items.push({ id: Date.now(), ...params, qty: 1 })
    })
    return params                            // return = payload в action stream
  },
})

// Вызов через store.actions
store.actions.addItem({ name: 'Hat', price: 1500 })

// Каждый action имеет мета-поле actionType
store.actions.addItem.actionType  // '[cart]addItem'`}</pre>

      {/* ─── createWatcher ────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>createWatcher</h3>
      <pre style={codeBlock}>{`// createWatcher — реактивно отслеживает изменения в state
const watchItemCount = createWatcher({
  type: 'watchItemCount',
  selector: (state) => state.items.length,   // что отслеживать
  notifyAfterSubscribe: true,                // вызвать сразу при подписке
  shouldTrigger: (prev, curr) => prev !== curr, // фильтр (опционально)
})

// Подписка — возвращает RxJS Observable
const sub = store.dispatcher.watchers.watchItemCount().subscribe((action) => {
  console.log('items count:', action.payload)
})

// Отписка
sub.unsubscribe()`}</pre>

      {/* ─── Возвращаемое значение ───────────────────────────────────── */}
      <h3 style={sectionTitle}>Возвращаемое значение</h3>
      <pre style={codeBlock}>{`const store = await synapsePromise

store.storage     // IStorage<CartState>
store.selectors   // { items, discount, totalPrice }
store.actions     // { addItem, removeItem, changeQty, setDiscount }
store.dispatcher  // Dispatcher (dispatch, watchers, actions observable)
store.destroy()   // () => Promise<void>

// store.actions — это shortcut для store.dispatcher.dispatch
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
