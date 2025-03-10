// 'use client'
//
// import { useEffect, useState } from 'react'
// import { broadcastMiddleware, IndexedDBStorage, LocalStorage, MemoryStorage } from 'synapse'
//
// interface Counter {
//   value: number
// }
//
// const counter1 = await new MemoryStorage<Counter>({
//   name: 'counter1',
//   initialState: { value: 1 },
//   middlewares: (getDefaultMiddleware) => {
//     const { shallowCompare, batching } = getDefaultMiddleware()
//     return [
//       broadcastMiddleware({
//         storageName: 'counter1',
//         storageType: 'memory',
//       }),
//       shallowCompare(),
//       batching(),
//     ]
//   },
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
// // Подписка на все изменения в данном хранилище
// // counter1.subscribeToAll((event) => {
// //   const { key, type, value } = event
// //   console.log('counter1.subscribeToAll', type, key, value)
// // })
// // // Подписка на конкретное значение (первый параметр - колбэк)
// // counter1.subscribe((s) => s.value, (event) => {
// //   console.log('counter1.subscribe--1', event)
// // })
// // // Подписка на конкретное значение (первый параметр - путь до свойства)
// // counter1.subscribe('value', (event) => {
// //   console.log('counter1.subscribe--2', event)
// // })
//
// // React компонент
// export function TestCounter2() {
//   const [counterValue1, setCounterValue1] = useState(0)
//   const [counterValue2, setCounterValue2] = useState(0)
//   const [counterValue3, setCounterValue3] = useState(0)
//
//   useEffect(() => {
//     const d = counter1.subscribe('value', (v) => {
//       console.log('ppppp')
//       setCounterValue1(v)
//     })
//
//     return () => {
//       d()
//     }
//   }, [])
//   useEffect(() => {
//     counter2.subscribe((s) => s.value, setCounterValue2)
//   }, [])
//   useEffect(() => {
//     counter3.subscribe((s) => s.value, setCounterValue3)
//   }, [])
//
//   const updateCounter1 = async () => {
//     await counter1.update((state) => {
//       state.value++
//     })
//   }
//   const updateCounter2 = async () => {
//     await counter2.set('value', counterValue2 + 1)
//   }
//   const updateCounter3 = async () => {
//     await counter3.update((state) => state.value++)
//   }
//
//   return (
//     <div style={{ display: 'flex', gap: '50px' }}>
//       <button onClick={updateCounter1}>{counterValue1}</button>
//       <button onClick={updateCounter2}>{counterValue2}</button>
//       <button onClick={updateCounter3}>{counterValue3}</button>
//     </div>
//   )
// }
