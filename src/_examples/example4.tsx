// import React, { useEffect, useState } from 'react'
// import { broadcastMiddleware, MemoryStorage } from 'synapse'
//
// // Типы данных
// interface Counter {
//   value: number;
//   lastUpdated?: Date;
// }
//
// // Создаем хранилища
// const counter1 = await new MemoryStorage<Counter>({
//   name: 'counter1',
//   initialState: { value: 0 },
//   middlewares: () => [
//     broadcastMiddleware({
//       storageName: 'counter1',
//       storageType: 'memory',
//     }),
//   ],
// }).initialize()
//
// const counter2 = await new MemoryStorage<Counter>({
//   name: 'counter2',
//   initialState: { value: 0 },
//   middlewares: (getDefaultMiddleware) => {
//     const { shallowCompare } = getDefaultMiddleware()
//     return [
//       shallowCompare(),
//     ]
//   },
// }).initialize()
//
// counter1.subscribe((s) => s.value, (v) => {
//   console.log('1_1_1', v)
// })
//
// const counter3 = await new MemoryStorage<Counter>({
//   name: 'counter3',
//   initialState: { value: 10 },
//   middlewares: (getDefaultMiddleware) => {
//     const { batching } = getDefaultMiddleware()
//     return [
//       batching({
//         batchSize: 4,
//         batchDelay: 200,
//       }),
//     ]
//   },
// }).initialize()
//
// // Компонент для демонстрации работы middleware
//
// export const Example4 = React.memo(() => {
//   const [counter1Value, setCounter1Value] = useState(0)
//   const [counter2Value, setCounter2Value] = useState(0)
//   const [counter3Value, setCounter3Value] = useState(0)
//
//   useEffect(() => {
//     // Подписываемся на изменения counter1
//     const unsubscribe1 = counter1.subscribe((s) => s.value, (v) => {
//       console.log('1')
//       setCounter1Value(v)
//     })
//
//     // Отписываемся при размонтировании
//     return () => {
//       unsubscribe1()
//     }
//   }, [])
//
//   useEffect(() => {
//     // Подписываемся на изменения counter1
//     const unsubscribe2 = counter2.subscribe((s) => s.value, (v) => {
//       console.log('2')
//       setCounter2Value(v)
//     })
//
//     // Отписываемся при размонтировании
//     return () => {
//       unsubscribe2()
//     }
//   }, [])
//   useEffect(() => {
//     // Подписываемся на изменения counter1
//     const unsubscribe3 = counter3.subscribe((s) => s.value, (v) => {
//       console.log('3', v)
//       setCounter3Value(v)
//     })
//
//     // Отписываемся при размонтировании
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
//       state.value = 100
//     })
//     await counter2.update((state) => {
//       state.value = 100
//     })
//     await counter2.update((state) => {
//       state.value = 100
//     })
//   }
//
//   const updateCounter3 = async () => {
//     // Отправка нескольких обновлений подряд - должны быть объединены batching
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
