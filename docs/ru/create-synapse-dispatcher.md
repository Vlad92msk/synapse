# createSynapse (диспетчер)

> [Назад к оглавлению](./README.md)

Хранилище + селекторы + диспетчер. Действия для изменения состояния, наблюдатели для реактивного отслеживания.

## Создание

```typescript
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher } from 'synapse-storage/reactive'

// Селекторы — поля класса
class CartSelectors extends Selectors<CartState> {
  readonly items = this.select((s) => s.items)
  readonly discount = this.select((s) => s.discount)
  readonly totalPrice = this.combine([this.items, this.discount], (items, discount) => {
    const sum = items.reduce((acc, i) => acc + i.price * i.qty, 0)
    return sum * (1 - discount / 100)
  })
}

// Диспетчер — действия и наблюдатели как поля класса. Имя экшена = имя поля.
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
// this.action((store, params) => result) — handler в «рецептной» сигнатуре.
// payload экшена = возвращённое значение handler'а.
class CartDispatcher extends Dispatcher<CartState> {
  readonly addItem = this.action((store, params: { name: string; price: number }) => {
    store.update((s) => {
      s.items.push({ id: Date.now(), ...params, qty: 1 })
    })
    return params                            // return = payload в потоке действий
  })
}

// Вызов через store.actions (имя экшена = имя поля)
store.actions.addItem({ name: 'Hat', price: 1500 })

// actionType генерируется из имени поля при финализации
store.actions.addItem.actionType  // '[cart]addItem'
```

## this.watcher

```typescript
// this.watcher — реактивно отслеживает изменения состояния
class CartDispatcher extends Dispatcher<CartState> {
  readonly watchItemCount = this.watcher({
    selector: (state) => state.items.length,        // что отслеживать
    notifyAfterSubscribe: true,                     // вызвать сразу при подписке
    shouldTrigger: (prev, curr) => prev !== curr,   // фильтр (опционально)
  })
}

// Подписка — возвращает RxJS Observable
const sub = store.dispatcher.watchers.watchItemCount().subscribe((action) => {
  console.log('количество товаров:', action.payload)
})

// Отписка
sub.unsubscribe()
```

Полная поверхность диспетчера (`signal`, `apiActions` и правило `ofType`) — см.
[Dispatcher (подробно)](./dispatcher-detailed.md).

## Возвращаемое значение

```typescript
const store = await cartSynapse

store.storage     // IStorage<CartState>
store.selectors   // экземпляр CartSelectors
store.actions     // { addItem, removeItem, changeQty, setDiscount }
store.dispatcher  // экземпляр CartDispatcher (dispatch, watchers, action$)

// store.actions — это сокращение для store.dispatcher.dispatch
// store.actions.addItem === store.dispatcher.dispatch.addItem

// Поток всех действий (RxJS Observable)
store.dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})
```

## React (createSynapseCtx)

```typescript
import { createSynapseCtx } from 'synapse-storage/react'

// Передаём САМ handle (не вызов) — фабрика стартует лениво при первом mount Provider'а
export const { contextSynapse, useSynapseSelectors, useSynapseActions } =
  createSynapseCtx(cartSynapse, { loadingComponent: <div>Загрузка...</div> })
```

Подробнее — [createSynapseCtx](./synapse-ctx.md).
