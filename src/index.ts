/**
 * Synapse - Библиотека управления состоянием и API-клиент
 * @author Vlad Firsov
 */

// Основные модули
export * from './api'
export * from './core'
export * from './reactive'
export * from './utils'

// React-интеграция экспортируется только если установлен React
// Оставляем этот экспорт, он будет работать для пользователей,
// которые импортируют React напрямую
export * from './react'

// Информационное сообщение для дебаггинга
if (process.env.NODE_ENV !== 'production') {
  console.log('Synapse state management library loaded ✨')
}
