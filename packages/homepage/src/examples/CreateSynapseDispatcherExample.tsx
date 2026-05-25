import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'
import { useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример: createSynapse() с dispatcher (actions + watchers)
 */

interface CartState {
  items: Array<{ id: number; name: string; price: number; qty: number }>
  discount: number
  lastAction: string
}

const initialState: CartState = {
  items: [
    { id: 1, name: 'Футболка', price: 2000, qty: 1 },
    { id: 2, name: 'Кроссовки', price: 8000, qty: 1 },
  ],
  discount: 0,
  lastAction: 'init',
}

const synapsePromise = createSynapse({
  storage: new MemoryStorage<CartState>({ name: 'cart-dispatcher', initialState }),

  createSelectorsFn: (selectorModule) => {
    const items = selectorModule.createSelector((s) => s.items)
    const discount = selectorModule.createSelector((s) => s.discount)
    const lastAction = selectorModule.createSelector((s) => s.lastAction)

    const totalPrice = selectorModule.createSelector(
      [items, discount],
      (itemsVal, discountVal) => {
        const sum = itemsVal.reduce((acc, item) => acc + item.price * item.qty, 0)
        return sum * (1 - discountVal / 100)
      },
    )

    const itemCount = selectorModule.createSelector(
      [items],
      (itemsVal) => itemsVal.reduce((acc, item) => acc + item.qty, 0),
    )

    return { items, discount, lastAction, totalPrice, itemCount }
  },

  // Создаём dispatcher с actions и watchers
  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction, createWatcher }) => {
      // Actions — вызываются явно, выполняют операцию
      const addItem = createAction({
        type: 'addItem',
        action: (params: { name: string; price: number }) => {
          storage.update((s) => {
            s.items.push({ id: Date.now(), name: params.name, price: params.price, qty: 1 })
            s.lastAction = `Добавлен: ${params.name}`
          })
          return params
        },
      })

      const removeItem = createAction({
        type: 'removeItem',
        action: (id: number) => {
          storage.update((s) => {
            const idx = s.items.findIndex((i) => i.id === id)
            if (idx !== -1) {
              s.lastAction = `Удалён: ${s.items[idx].name}`
              s.items.splice(idx, 1)
            }
          })
          return id
        },
      })

      const changeQty = createAction({
        type: 'changeQty',
        action: (params: { id: number; delta: number }) => {
          storage.update((s) => {
            const item = s.items.find((i) => i.id === params.id)
            if (item) {
              item.qty = Math.max(1, item.qty + params.delta)
              s.lastAction = `${item.name}: qty=${item.qty}`
            }
          })
          return params
        },
      })

      const applyDiscount = createAction({
        type: 'applyDiscount',
        action: (percent: number) => {
          storage.set('discount', percent)
          storage.set('lastAction', `Скидка: ${percent}%`)
          return percent
        },
      })

      // Watcher — реактивно следит за изменением значения в storage
      const watchItemCount = createWatcher({
        type: 'watchItemCount',
        selector: (state) => state.items.length,
        notifyAfterSubscribe: true,
      })

      const watchDiscount = createWatcher({
        type: 'watchDiscount',
        selector: (state) => state.discount,
        shouldTrigger: (prev, current) => prev !== current,
      })

      return { addItem, removeItem, changeQty, applyDiscount, watchItemCount, watchDiscount }
    }),
})

type CartSynapse = Awaited<typeof synapsePromise>

export function CreateSynapseDispatcherExample() {
  const [store, setStore] = useState<CartSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    synapsePromise.then((s) => { if (!cancelled) setStore(s) })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing createSynapse (with dispatcher)...</div>

  return <CartUI store={store} />
}

function CartUI({ store }: { store: CartSynapse }) {
  const items = useSelector(store.selectors.items)
  const totalPrice = useSelector(store.selectors.totalPrice)
  const itemCount = useSelector(store.selectors.itemCount)
  const discount = useSelector(store.selectors.discount)
  const lastAction = useSelector(store.selectors.lastAction)

  // Watcher logs (для демонстрации)
  const [watcherLogs, setWatcherLogs] = useState<string[]>([])

  useEffect(() => {
    // Подписываемся на watcher через RxJS observable
    const sub1 = store.dispatcher.watchers.watchItemCount().subscribe((action: any) => {
      setWatcherLogs((prev) => [...prev.slice(-4), `[watchItemCount] items.length = ${action.payload}`])
    })
    const sub2 = store.dispatcher.watchers.watchDiscount().subscribe((action: any) => {
      setWatcherLogs((prev) => [...prev.slice(-4), `[watchDiscount] discount = ${action.payload}%`])
    })
    return () => { sub1.unsubscribe(); sub2.unsubscribe() }
  }, [store])

  return (
    <div style={cardStyle}>
      <h2>createSynapse() — с dispatcher (actions + watchers)</h2>
      <p>Товаров: {itemCount} | Итого: {totalPrice?.toFixed(0)} руб. | Скидка: {discount}%</p>
      <p style={{ fontSize: 12, color: '#888' }}>Последнее действие: {lastAction}</p>

      <div style={buttonRow}>
        <button onClick={() => store.actions.addItem({ name: `Товар ${Date.now() % 1000}`, price: Math.floor(Math.random() * 5000) + 500 })}>
          + Добавить товар
        </button>
        <button onClick={() => store.actions.applyDiscount(discount === 0 ? 15 : 0)}>
          {discount === 0 ? 'Применить скидку 15%' : 'Убрать скидку'}
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
            <th>Товар</th><th>Цена</th><th>Кол-во</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items?.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{item.name}</td>
              <td>{item.price} руб.</td>
              <td>
                <button onClick={() => store.actions.changeQty({ id: item.id, delta: -1 })}>-</button>
                {' '}{item.qty}{' '}
                <button onClick={() => store.actions.changeQty({ id: item.id, delta: 1 })}>+</button>
              </td>
              <td><button onClick={() => store.actions.removeItem(item.id)}>X</button></td>
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

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>createDispatcher({'{'} storage {'}'}, (storage, {'{'} createAction, createWatcher {'}'}) =&gt; ...)</code></li>
        <li><code>store.actions.addItem(params)</code> — вызов action, возвращает Promise</li>
        <li><code>store.dispatcher.watchers.watchX().subscribe()</code> — RxJS Observable от watcher</li>
        <li>Actions автоматически получают тип <code>[storageName]actionType</code></li>
      </ul>
    </div>
  )
}
