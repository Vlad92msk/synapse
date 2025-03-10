# Селекторы

Селекторы предоставляют удобный способ доступа к данным в хранилище, позволяя создавать вычисляемые значения и комбинировать данные.

## Создание модуля селекторов

```typescript
import { IndexedDBStorage, LocalStorage, MemoryStorage, SelectorModule } from 'synapse'

interface Counter {
  value: number;
  lastUpdated?: Date;
}

// Создаем хранилища (любого типа)
const counter1 = await new MemoryStorage<Counter>({
  name: 'counter1',
  initialState: { value: 1 },
}).initialize()

const counter2 = await new IndexedDBStorage<Counter>({
  name: 'counter2',
  options: {
    dbVersion: 2,
    storeName: 'counter23',
    dbName: 'counter23',
  },
  initialState: { value: 2 },
}).initialize()

const counter3 = await new LocalStorage<Counter>({
  name: 'counter3',
  initialState: { value: 3 },
}).initialize()

// Создаем экземпляры модулей селекторов
const counter1Selector = new SelectorModule<Counter>(counter1, console)
const counter2Selector = new SelectorModule<Counter>(counter2)
const counter3Selector = new SelectorModule<Counter>(counter3)

// Создание простых селекторов
const counter1ValueSelector = counter1Selector.createSelector((s) => s.value)
const counter2ValueSelector = counter2Selector.createSelector((s) => s.value)
const counter3ValueSelector = counter3Selector.createSelector((s) => s.value)

// Создание комбинированных селекторов
const sum = counter3Selector.createSelector(
  [counter1ValueSelector, counter2ValueSelector, counter3ValueSelector],
  (a, b, c) => a + b + c,
)

// Подписки на изменения значений
sum.subscribe({
  notify: async (value) => {
    console.log('sum-notify', value)
  },
})

counter1ValueSelector.subscribe({
  notify: async (value) => {
    console.log('counter1ValueUnsubscribe', value)
  },
})

counter2ValueSelector.subscribe({
  notify: async (value) => {
    console.log('counter2ValueUnsubscribe', value)
  },
})

// Получение значения 1 раз (Например для первоначального значения)
sum.select().then(result => {
  console.log('result', result)
})
```
