// import React, { useEffect, useState } from 'react'
// import { IndexedDBStorage, LocalStorage, MemoryStorage, SelectorModule } from 'synapse'
//
// interface Counter {
//   value: number;
//   lastUpdated?: Date;
// }
//
// // Создаем хранилища
// const counter1 = await new MemoryStorage<Counter>({
//   name: 'counter1',
//   initialState: { value: 1 },
// }).initialize()
//
// const counter2 = await new IndexedDBStorage<Counter>({
//   name: 'counter2',
//   options: {
//     dbVersion: 2,
//     storeName: 'counter23',
//     dbName: 'counter23',
//   },
//   initialState: { value: 2 },
// }).initialize()
//
// const counter3 = await new LocalStorage<Counter>({
//   name: 'counter3',
//   initialState: { value: 3 },
// }).initialize()
//
// const counter1Selector = new SelectorModule<Counter>(counter1, console)
// const counter2Selector = new SelectorModule(counter2)
// const counter3Selector = new SelectorModule(counter3)
//
// const counter1ValueSelector = counter1Selector.createSelector((s) => s.value)
// const counter2ValueSelector = counter2Selector.createSelector((s) => s.value)
// const counter3ValueSelector = counter3Selector.createSelector((s) => s.value)
//
// const sum = counter3Selector.createSelector(
//   [counter1ValueSelector, counter2ValueSelector, counter3ValueSelector],
//   (a, b, c) => a + b + c,
// )
//
// sum.subscribe({
//   notify: (value) => {
//     console.log('sum-notify', value)
//   },
// })
//
// counter1ValueSelector.subscribe({
//   notify: (value) => {
//     console.log('counter1ValueUnsubscribe', value)
//   },
// })
//
// counter2ValueSelector.subscribe({
//   notify: async (value) => {
//     console.log('counter2ValueUnsubscribe', value)
//   },
// })
//
// // Компонент для демонстрации работы middleware
//
// export const Example6 = React.memo(() => {
//   const [counter1Value, setCounter1Value] = useState(0)
//   const [counter2Value, setCounter2Value] = useState(0)
//   const [counter3Value, setCounter3Value] = useState(0)
//
//   useEffect(() => {
//     sum.select().then((r) => {
//       console.log('result', r)
//     })
//     const a = sum.select().then((r) => r)
//     console.log('a', a)
//   }, [])
//
//   useEffect(() => {
//     // Подписываемся на изменения counter1
//     const unsubscribe1 = counter1.subscribe((s) => s.value, setCounter1Value)
//     return () => {
//       unsubscribe1()
//     }
//   }, [])
//
//   useEffect(() => {
//     // Подписываемся на изменения counter1
//     const unsubscribe2 = counter2.subscribe((s) => s.value, setCounter2Value)
//     return () => {
//       unsubscribe2()
//     }
//   }, [])
//   useEffect(() => {
//     // Подписываемся на изменения counter1
//     const unsubscribe3 = counter3.subscribe((s) => s.value, setCounter3Value)
//     return () => {
//       unsubscribe3()
//     }
//   }, [])
//
//   // Функции для обновления счетчиков
//   const updateCounter1 = async () => {
//     await counter1.update((state) => {
//       state.value++
//     })
//   }
//
//   const updateCounter2 = async () => {
//     await counter2.update((state) => {
//       state.value++
//     })
//   }
//
//   const updateCounter3 = async () => {
//     await counter3.set('value', counter3Value + 1)
//   }
//
//   return (
//     <div style={{ fontFamily: 'Arial', padding: '20px' }}>
//       <h2>Middleware Testing</h2>
//
//       <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
//         <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
//           <h3>Counter 1 (Both Middlewares)</h3>
//           <p>
//             Value:
//             {counter1Value}
//           </p>
//           <button
//             onClick={updateCounter1}
//             style={{ padding: '8px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
//           >
//             Increment
//           </button>
//         </div>
//
//         <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
//           <h3>Counter 2 (ShallowCompare)</h3>
//           <p>
//             Value:
//             {counter2Value}
//           </p>
//           <button
//             onClick={updateCounter2}
//             style={{ padding: '8px 15px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px' }}
//           >
//             Update
//           </button>
//           <p><small>Every 3rd click tries to set the same value</small></p>
//         </div>
//
//         <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
//           <h3>Counter 3 (Batching)</h3>
//           <p>
//             Value:
//             {counter3Value}
//           </p>
//           <button
//             onClick={updateCounter3}
//             style={{ padding: '8px 15px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '4px' }}
//           >
//             Batch Update
//           </button>
//         </div>
//       </div>
//     </div>
//   )
// })
