/**
 * Synapse - Библиотека управления состоянием и API-клиент
 * @author Vlad Firsov
 */

// Корень — framework-agnostic и БЕЗ rxjs/react: ядро (хранилища, селекторы), Dispatcher, API, утилиты.
// Бандлер резолвит все импорты модулей точки входа ДО tree-shaking, поэтому опциональные peer-зависимости
// живут только в своих подпутях:
//   - React-хуки и createSynapseCtx — 'synapse-storage/react' (нужен react);
//   - эффекты и rxjs-операторы (Effects, ofType, validateMap, toObservable, …) — 'synapse-storage/reactive' (нужен rxjs).
export * from './api'
export * from './core'
export * from './reactive/dispatcher'
export * from './utils'
