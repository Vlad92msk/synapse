# createSynapse (диспетчер)

> [Назад к оглавлению](./README.md)

Хранилище + селекторы + диспетчер. Действия для изменения состояния, наблюдатели для реактивного отслеживания.

## Создание

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

  // Диспетчер — определяет действия и наблюдатели
  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction, createWatcher }) => {
      // ... действия и наблюдатели
      return { addItem, removeItem, setDiscount, watchItemCount }
    }),
})
```

## createAction

```typescript
// createAction — определяет действие с типом и логикой
const addItem = createAction({
  type: 'addItem',                          // уникальный тип действия
  action: (params: { name: string }) => {   // логика (синхронная или асинхронная)
    storage.update((s) => {
      s.items.push({ id: Date.now(), ...params, qty: 1 })
    })
    return params                            // return = payload в потоке действий
  },
})

// Вызов через store.actions
store.actions.addItem({ name: 'Hat', price: 1500 })

// Каждое действие имеет мета-поле actionType
store.actions.addItem.actionType  // '[cart]addItem'
```

## createWatcher

```typescript
// createWatcher — реактивно отслеживает изменения состояния
const watchItemCount = createWatcher({
  type: 'watchItemCount',
  selector: (state) => state.items.length,   // что отслеживать
  notifyAfterSubscribe: true,                // вызвать сразу при подписке
  shouldTrigger: (prev, curr) => prev !== curr, // фильтр (опционально)
})

// Подписка — возвращает RxJS Observable
const sub = store.dispatcher.watchers.watchItemCount().subscribe((action) => {
  console.log('количество товаров:', action.payload)
})

// Отписка
sub.unsubscribe()
```

## Возвращаемое значение

```typescript
const store = await synapsePromise

store.storage     // IStorage<CartState>
store.selectors   // { items, discount, totalPrice }
store.actions     // { addItem, removeItem, changeQty, setDiscount }
store.dispatcher  // Dispatcher (dispatch, watchers, actions observable)
store.destroy()   // () => Promise<void>

// store.actions — это сокращение для store.dispatcher.dispatch
// store.actions.addItem === store.dispatcher.dispatch.addItem

// Поток всех действий (RxJS Observable)
store.dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})
```
