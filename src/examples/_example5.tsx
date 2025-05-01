// import React, { useState } from 'react'
// import { MemoryStorage, StoragePluginModule, ILogger } from 'synapse'
// import { LoggingPlugin, ValidationPlugin } from './plugins'
//
// // Типы данных
// interface User {
//   name: string;
//   age: number;
// }
//
// // Создаем модуль плагинов
// const plugins = new StoragePluginModule(undefined, console, 'demoStorage')
//
// // Создаем стейт для ошибок, чтобы компоненты могли получить к нему доступ
// const validationErrors: { [key: string]: string } = {}
//
// // Добавляем логирующий плагин
// await plugins.add(new LoggingPlugin({ logLevel: 'debug' }))
//
// // Добавляем плагин валидации с обработчиком ошибок
// const validation = new ValidationPlugin({
//   throwOnInvalid: true, // Все равно генерировать ошибку
//   onValidationError: (key, value, message) => {
//     // Сохраняем ошибку в общем объекте
//     validationErrors[key] = message
//     console.error(`Validation error for ${key}: ${message}`, value)
//   },
// })
//
// // Настраиваем правила валидации
// validation.addValidator('user', (value) => {
//   // Сбрасываем ошибки при каждой валидации
//   validationErrors.user = ''
//
//   if (!value || typeof value !== 'object') {
//     return { valid: false, message: 'User must be an object' }
//   }
//
//   if (!value.name || value.name.trim() === '') {
//     return { valid: false, message: 'User must have a name' }
//   }
//
//   if (typeof value.age !== 'number' || value.age < 10) {
//     return { valid: false, message: 'Возраст должен быть больше 10' }
//   }
//
//   return { valid: true }
// })
//
// await plugins.add(validation)
//
//
// // Создаем хранилище с плагинами
// const storage = await new MemoryStorage<{user?: User}>({
//   name: 'demoStorage',
//   initialState: { version: '1.0.0' },
// }, plugins).initialize()
//
// // Компонент для демонстрации
// export function Example5() {
//   const [user, setUser] = useState<User | null>(null)
//   const [name, setName] = useState('')
//   const [age, setAge] = useState('')
//   const [error, setError] = useState<string | null>(null)
//   const [fieldErrors, setFieldErrors] = useState<{name?: string, age?: string}>({})
//
//   // Функция для сохранения пользователя
//   const saveUser = async () => {
//     try {
//       // Сбрасываем ошибки при каждой отправке
//       setError(null)
//       setFieldErrors({})
//
//       const userData: User = {
//         name,
//         age: parseInt(age, 10) || 0, // Преобразуем в число или 0, если невалидно
//       }
//
//       await storage.set('user', userData)
//       setUser(userData)
//       console.log('User saved successfully')
//     } catch (err) {
//       // Получаем сообщение ошибки
//       const errorMessage = err instanceof Error ? err.message : String(err)
//
//       // Устанавливаем общую ошибку
//       setError(errorMessage)
//
//       // Определяем, какое поле вызвало ошибку и устанавливаем ошибку для него
//       if (errorMessage.includes('name')) {
//         setFieldErrors((prev) => ({ ...prev, name: 'Имя обязательно' }))
//       }
//
//       if (errorMessage.includes('возраст') || errorMessage.includes('больше 10')) {
//         setFieldErrors((prev) => ({ ...prev, age: 'Возраст должен быть больше 10' }))
//       }
//
//       console.error('Error saving user:', errorMessage)
//     }
//   }
//
//   return (
//     <div style={{ fontFamily: 'Arial', padding: '20px' }}>
//       <h2>Пример с валидацией</h2>
//
//       {/* Если есть общая ошибка, показываем её */}
//       {error && (
//         <div style={{
//           padding: '10px',
//           backgroundColor: '#ffebee',
//           color: '#d32f2f',
//           borderRadius: '4px',
//           marginBottom: '15px',
//         }}
//         >
//           {error}
//         </div>
//       )}
//
//       <div style={{ marginBottom: '20px' }}>
//         <div style={{ marginBottom: '10px' }}>
//           <label style={{ display: 'block', marginBottom: '5px' }}>Имя:</label>
//           <input
//             type="text"
//             value={name}
//             onChange={(e) => setName(e.target.value)}
//             style={{
//               padding: '8px',
//               width: '250px',
//               border: fieldErrors.name ? '1px solid #d32f2f' : '1px solid #ccc',
//             }}
//           />
//           {fieldErrors.name && (
//             <div style={{ color: '#d32f2f', fontSize: '14px', marginTop: '5px' }}>
//               {fieldErrors.name}
//             </div>
//           )}
//         </div>
//
//         <div style={{ marginBottom: '15px' }}>
//           <label style={{ display: 'block', marginBottom: '5px' }}>Возраст:</label>
//           <input
//             type="number"
//             value={age}
//             onChange={(e) => setAge(e.target.value)}
//             style={{
//               padding: '8px',
//               width: '250px',
//               border: fieldErrors.age ? '1px solid #d32f2f' : '1px solid #ccc',
//             }}
//           />
//           {fieldErrors.age && (
//             <div style={{ color: '#d32f2f', fontSize: '14px', marginTop: '5px' }}>
//               {fieldErrors.age}
//             </div>
//           )}
//         </div>
//
//         <button
//           onClick={saveUser}
//           style={{
//             padding: '10px 15px',
//             backgroundColor: '#4CAF50',
//             color: 'white',
//             border: 'none',
//             borderRadius: '4px',
//             cursor: 'pointer',
//           }}
//         >
//           Сохранить
//         </button>
//       </div>
//
//       <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '4px' }}>
//         <h3>Текущие данные:</h3>
//         <pre style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
//           {user ? JSON.stringify(user, null, 2) : 'Нет данных'}
//         </pre>
//       </div>
//     </div>
//   )
// }
