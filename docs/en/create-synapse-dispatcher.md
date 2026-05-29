# createSynapse (dispatcher)

> [Back to Main](../../README.md)

Storage + selectors + dispatcher. Actions for changing state, watchers for reactive tracking.

## Creating

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'

const synapsePromise = createSynapse({
  storage: new MemoryStorage<CartState>({ name: 'cart', initialState }),

  createSelectorsFn: (selectorModule) => ({
    items: selectorModule.createSelector((s) => s.items),
    discount: selectorModule.createSelector((s) => s.discount),
    totalPrice: selectorModule.createSelector(
      [items, discount],
      (itemsVal, discountVal) => {
        const sum = itemsVal.reduce((acc, i) => acc + i.price * i.qty, 0)
        return sum * (1 - discountVal / 100)
      },
    ),
  }),

  // Dispatcher — defines actions and watchers
  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction, createWatcher }) => {
      // ... actions and watchers
      return { addItem, removeItem, setDiscount, watchItemCount }
    }),
})
```

## createAction

```typescript
// createAction — defines an action with type and logic
const addItem = createAction({
  type: 'addItem',                          // unique action type
  action: (params: { name: string }) => {   // logic (sync or async)
    storage.update((s) => {
      s.items.push({ id: Date.now(), ...params, qty: 1 })
    })
    return params                            // return = payload in action stream
  },
})

// Call via store.actions
store.actions.addItem({ name: 'Hat', price: 1500 })

// Each action has a meta-field actionType
store.actions.addItem.actionType  // '[cart]addItem'
```

## createWatcher

```typescript
// createWatcher — reactively tracks changes in state
const watchItemCount = createWatcher({
  type: 'watchItemCount',
  selector: (state) => state.items.length,   // what to track
  notifyAfterSubscribe: true,                // call immediately on subscribe
  shouldTrigger: (prev, curr) => prev !== curr, // filter (optional)
})

// Subscribe — returns RxJS Observable
const sub = store.dispatcher.watchers.watchItemCount().subscribe((action) => {
  console.log('items count:', action.payload)
})

// Unsubscribe
sub.unsubscribe()
```

## Return Value

```typescript
const store = await synapsePromise

store.storage     // IStorage<CartState>
store.selectors   // { items, discount, totalPrice }
store.actions     // { addItem, removeItem, changeQty, setDiscount }
store.dispatcher  // Dispatcher (dispatch, watchers, actions observable)
store.destroy()   // () => Promise<void>

// store.actions is a shortcut for store.dispatcher.dispatch
// store.actions.addItem === store.dispatcher.dispatch.addItem

// Stream of all actions (RxJS Observable)
store.dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})
```
