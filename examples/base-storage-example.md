## Пример базовых возможностей управления состоянием

```tsx
import { CSSProperties } from 'react'
import { broadcastMiddleware, IndexedDBStorage, LocalStorage, MemoryStorage, SelectorModule } from 'synapse-storage/core'
import { useSelector } from 'synapse-storage/react'

interface Counter {
  value: number
}

// Создаем хранилища разных типов (MemoryStorage / LocalStorage / IndexedDBStorage)

const counter1 = await new MemoryStorage<Counter>({
  name: 'counter1',
  initialState: { value: 1 },
  middlewares: () => [
    // Будет обновляться во всех вкладках
    broadcastMiddleware({
      storageName: 'counter1',
      storageType: 'memory',
    }),
  ],
}).initialize()

const counter2 = await new LocalStorage<Counter>({
  name: 'counter2',
  initialState: { value: 2 },
  middlewares: (getDefaultMiddleware) => {
    const { shallowCompare } = getDefaultMiddleware()
    return [
      shallowCompare(),
    ]
  },
}).initialize()


export const { counter3 } = await IndexedDBStorage.createStorages<{
  counter3: Counter
}>(
  'IndexedDBStorage-test-counter3', // Название базы данных в indexDB
  // Таблицы:
  {
    counter3: {
      name: 'counter3',
      initialState: { value: 3 },
      middlewares: (getDefaultMiddleware) => {
        const { batching } = getDefaultMiddleware()
        return [
          batching({
            batchSize: 20,
            batchDelay: 200,
          }),
        ]
      },
      // eventEmitter: ,
      // pluginExecutor: ,
    },
    // Другие объекты (хранилища)
  },
  console, // logger (может быть любой, который имплементируют интерфейс ILogger)
)

// Создаем экземпляры модуля селекторов
const counter1Selector = new SelectorModule(counter1)
const counter2Selector = new SelectorModule(counter2)
const counter3Selector = new SelectorModule(counter3)

// Создаем сами селекторы в стиле Redux
const val1Selector = counter1Selector.createSelector((s) => s.value)
const val2Selector = counter2Selector.createSelector((s) => s.value)
const val3Selector = counter3Selector.createSelector((s) => s.value)

const sumSelector = counter3Selector.createSelector(
  [val1Selector, val2Selector, val3Selector],
  (a, b, c) => a + b + c,
)

// Альтернативный сопособ подписки (Здесь подписка на само значение в хранище)
// counter1.subscribe((s) => s.value, (value) => {
//   console.log(value)
// })

const root: CSSProperties = { display: 'flex', width: '400px', alignItems: 'center', gap: '20px' }
const mainContainer: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'space-between' }
const btnContainer: CSSProperties = { display: 'flex', justifyContent: 'space-between', border: '1px solid #ccc', padding: '15px', borderRadius: '5px', alignItems: 'center', gap: '20px' }
const btn: CSSProperties = { background: '#c7c6c6', color: 'black', padding: '5px', borderRadius: '5px' }
const sumStyle: CSSProperties = { width: '100px', height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '70px' }

export function SimplePokemonViewer() {
  const counter1Value = useSelector(val1Selector)
  const counter2Value = useSelector(val2Selector)
  const counter3Value = useSelector(val3Selector)
  const sum = useSelector(sumSelector)

  // Альтернативные способы подписки (Здесь подписка на само значение в хранище)
  // const counter1Value1 = useStorageSubscribe(counter1, (s) => s.value)
  // const counter1Value2 = useStorageSubscribe(counter2, (s) => s.value)
  // const counter1Value3 = useStorageSubscribe(counter3, (s) => s.value)
  // console.log('counter1Value1', counter1Value1)

  const updateCounter1 = async () => {
    await counter1.update((state) => {
      state.value++
    })
  }

  // Демонстрация shallowCompare
  const updateCounter2 = async () => {
    await counter2.set('value', counter3Value! + 1) // Эта операция выполнит обновления состояния
    // Остальные нет (следовательно подписчики не будут оповещены)
    await counter2.set('value', counter3Value! + 1)
    await counter2.set('value', counter3Value! + 1)
    await counter2.set('value', counter3Value! + 1)
    await counter2.set('value', counter3Value! + 1)

    // await counter2.update((state) => {
    //   state.value++
    // })
  }

  // Демонстрация batching
  const updateCounter3 = async () => {
    await counter3.set('value', counter3Value! + 1)
    await counter3.set('value', counter3Value! + 2)
    await counter3.set('value', counter3Value! + 3)
    await counter3.set('value', counter3Value! + 4)
    await counter3.set('value', counter3Value! + 5) // Применится только последнее

    // await counter3.update((state) => {
    //   state.value++
    // })
  }

  return (
    <div style={root}>
      <div style={mainContainer}>
        <div style={btnContainer}>
          <p>{`counter1: ${counter1Value}`}</p>
          <button style={btn} onClick={updateCounter1}>Increment 1</button>
        </div>

        <div style={btnContainer}>
          <p>{`counter2: ${counter2Value}`}</p>
          <button style={btn} onClick={updateCounter2}>Increment 2</button>
        </div>

        <div style={btnContainer}>
          <p>{`counter3: ${counter3Value}`}</p>
          <button style={btn} onClick={updateCounter3}>Increment 3</button>
        </div>
      </div>

      <div style={sumStyle}>
        <span>{sum}</span>
      </div>
    </div>
  )
}
```
