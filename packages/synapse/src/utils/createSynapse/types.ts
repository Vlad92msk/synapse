import { Observable } from 'rxjs'

import { ISelectorModule, IStorage, IStorageBase } from '../../core'
import { Effect, ExternalStates } from '../../reactive'

// Вспомогательные типы для извлечения типов из других типов
export type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T
export type ExtractStorageType<T> = T extends IStorageBase<infer U> ? U : never
export type ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : never

export type StorageCreatorFunction<T extends Record<string, any>> = () => Promise<IStorage<T>>

export type SynapseDependency = {
  storage: IStorageBase<any>
}

/** Всё что можно передать в dependencies[]: raw storage, обёртка { storage }, или Promise от другого synapse */
export type DependencyInput = IStorageBase<any> | SynapseDependency | Promise<AnySynapseStore>

/**
 * Базовая конфигурация хранилища
 */
export type BaseSynapseConfig<TStore extends Record<string, any>, TSelectors = any, TExternalSelectors extends Record<string, any> = Record<string, any>> = (
  | { storage: IStorage<TStore>; createStorageFn?: undefined }
  | { storage?: undefined; createStorageFn: StorageCreatorFunction<TStore> }
) & {
  // Асинхронная функция инициализации, вызывается после готовности зависимостей, до инициализации хранилища
  setup?: () => Promise<void> | void
  // Зависимости от других synapse
  dependencies?: DependencyInput[]
  // Таймаут ожидания готовности зависимостей (мс, по умолчанию 30000)
  dependencyTimeout?: number
  // Внешние селекторы
  externalSelectors?: TExternalSelectors
  // Функция создания селекторов
  createSelectorsFn?: (selectorModule: ISelectorModule<TStore>, externalSelectors: TExternalSelectors) => TSelectors
}

/**
 * Конфигурация с dispatcher и effects
 */
export type CreateSynapseConfigWithEffects<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
> = BaseSynapseConfig<TStore, TSelectors, TExternalSelectors> & {
  // Функция создания диспетчера (обязательная)
  createDispatcherFn: (storage: IStorage<TStore>) => TDispatcher
  // Функция создания конфигурации для эффектов (dispatcher передаётся автоматически)
  createEffectConfig: () => {
    services?: TServices
    config?: TConfig
    externalDispatchers?: Record<string, any>
    externalStates?: ExternalStates
  }
  // Эффекты
  effects?: Effect<TStore, any, TServices, TConfig, any, any>[]
}

/**
 * Конфигурация только с dispatcher
 */
export type CreateSynapseConfigWithDispatcher<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
> = BaseSynapseConfig<TStore, TSelectors, TExternalSelectors> & {
  // Функция создания диспетчера (обязательная)
  createDispatcherFn: (storage: IStorage<TStore>) => TDispatcher
  // Эффекты отсутствуют
  createEffectConfig?: never
  effects?: never
}

/**
 * Конфигурация без dispatcher
 */
export type CreateSynapseConfigBasic<
  TStore extends Record<string, any>,
  TSelectors = any,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
> = BaseSynapseConfig<TStore, TSelectors, TExternalSelectors> & {
  // Dispatcher отсутствует
  createDispatcherFn?: never
  createEffectConfig?: never
  effects?: never
}

/**
 * Результат с dispatcher и effects
 */
export interface SynapseStoreWithEffects<TStore extends Record<string, any>, TStorage extends IStorageBase<TStore>, TSelectors, TActions> {
  storage: TStorage
  selectors: TSelectors
  actions: TActions
  state$: Observable<TStore>
  dispatcher: any
  destroy: () => Promise<void>
}

/**
 * Результат только с dispatcher
 */
export interface SynapseStoreWithDispatcher<TStore extends Record<string, any>, TStorage extends IStorageBase<TStore>, TSelectors, TActions> {
  storage: TStorage
  selectors: TSelectors
  actions: TActions
  dispatcher: any
  destroy: () => Promise<void>
}

/**
 * Результат без dispatcher
 */
export interface SynapseStoreBasic<TStore extends Record<string, any>, TStorage extends IStorageBase<TStore>, TSelectors> {
  storage: TStorage
  selectors: TSelectors
  destroy: () => Promise<void>
}

/**
 * Union-тип для всех возможных результатов createSynapse
 */
export type AnySynapseStore<TStore extends Record<string, any> = any, TStorage extends IStorageBase<TStore> = IStorage<any>, TSelectors = any, TActions = any> =
  | SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>
  | SynapseStoreWithDispatcher<TStore, TStorage, TSelectors, TActions>
  | SynapseStoreBasic<TStore, TStorage, TSelectors>
