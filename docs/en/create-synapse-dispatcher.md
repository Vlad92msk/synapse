# createSynapse (dispatcher)

> [Back to Main](../../README.md)

Storage + selectors + dispatcher. Actions for changing the state, watchers for reactive tracking.

## Creating

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher } from 'synapse-storage/reactive'

// Selectors — class fields
class CartSelectors extends Selectors<CartState> {
  readonly items = this.select((s) => s.items)
  readonly discount = this.select((s) => s.discount)
  readonly totalPrice = this.combine([this.items, this.discount], (items, discount) => {
    const sum = items.reduce((acc, i) => acc + i.price * i.qty, 0)
    return sum * (1 - discount / 100)
  })
}

// Dispatcher — actions and watchers as class fields. Action name = field name.
class CartDispatcher extends Dispatcher<CartState> {
  readonly addItem = this.action((store, params: { name: string; price: number }) => {
    store.update((s) => { s.items.push({ id: Date.now(), ...params, qty: 1 }) })
    return params
  })
  readonly setDiscount = this.action((store, percent: number) => {
    store.set('discount', percent)
    return percent
  })
  readonly watchItemCount = this.watcher({ selector: (s) => s.items.length })
}

const cartSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<CartState>({ name: 'cart', initialState })
  return {
    storage,
    dispatcher: new CartDispatcher(storage),
    selectors: new CartSelectors(storage),
  }
})
```

## this.action

```typescript
// this.action((store, params) => result) — a handler in the "recipe" signature.
// The action's payload = the value returned by the handler.
class CartDispatcher extends Dispatcher<CartState> {
  readonly addItem = this.action((store, params: { name: string; price: number }) => {
    store.update((s) => {
      s.items.push({ id: Date.now(), ...params, qty: 1 })
    })
    return params                            // return = payload in the action stream
  })
}

// Calling via store.actions (action name = field name)
store.actions.addItem({ name: 'Hat', price: 1500 })

// actionType is generated from the field name at finalization
store.actions.addItem.actionType  // '[cart]addItem'
```

## this.watcher

```typescript
// this.watcher — reactively tracks state changes
class CartDispatcher extends Dispatcher<CartState> {
  readonly watchItemCount = this.watcher({
    selector: (state) => state.items.length,        // what to track
    notifyAfterSubscribe: true,                     // call immediately on subscribe
    shouldTrigger: (prev, curr) => prev !== curr,   // filter (optional)
  })
}

// Subscribing — returns an RxJS Observable
const sub = store.dispatcher.watchers.watchItemCount().subscribe((action) => {
  console.log('item count:', action.payload)
})

// Unsubscribe
sub.unsubscribe()
```

The full dispatcher surface (`signal`, `apiActions`, and the `ofType` rule) — see
[Dispatcher (in detail)](./dispatcher-detailed.md).

## Return value

```typescript
const store = await cartSynapse

store.storage     // IStorage<CartState>
store.selectors   // a CartSelectors instance
store.actions     // { addItem, removeItem, changeQty, setDiscount }
store.dispatcher  // a CartDispatcher instance (dispatch, watchers, action$)

// store.actions — shorthand for store.dispatcher.dispatch
// store.actions.addItem === store.dispatcher.dispatch.addItem

// The stream of all actions (RxJS Observable)
store.dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})
```

## React (createSynapseCtx)

```typescript
import { createSynapseCtx } from 'synapse-storage/react'

// Pass the handle ITSELF (not a call) — the factory starts lazily on the first Provider mount
export const { contextSynapse, useSynapseSelectors, useSynapseActions } =
  createSynapseCtx(cartSynapse, { loadingComponent: <div>Loading...</div> })
```

More details — [createSynapseCtx](./synapse-ctx.md).
