import { Observable } from 'rxjs'

import { handleCallbackError, handleOperationError, logError } from '../_utils/error-handling.util'
import { IAsyncStorage, ISelectorModule, IStorage, IStorageBase, ISyncStorage, SelectorModule } from '../core'
import { Effect, EffectsModule, ExternalStates } from '../reactive'

// Вспомогательные типы для извлечения типов из других типов
export type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T
export type ExtractStorageType<T> = T extends IStorageBase<infer U> ? U : never
export type ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : never

export type StorageCreatorFunction<T extends Record<string, any>> = () => Promise<IStorage<T>>

export type SynapseDependency = {
  storage: IStorageBase<any>
  [key: string]: any // Для других свойств synapse (dispatcher, selectors, etc.)
}

/**
 * Базовая конфигурация хранилища
 */
type BaseSynapseConfig<TStore extends Record<string, any>, TSelectors = any, TExternalSelectors extends Record<string, any> = Record<string, any>> = (
  | { storage: IStorage<TStore>; createStorageFn?: undefined }
  | { storage?: undefined; createStorageFn: StorageCreatorFunction<TStore> }
) & {
  // Асинхронная функция инициализации, вызывается после готовности зависимостей, до инициализации хранилища
  setup?: () => Promise<void> | void
  // Зависимости от других synapse
  dependencies?: SynapseDependency[]
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
  TApi extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
> = BaseSynapseConfig<TStore, TSelectors, TExternalSelectors> & {
  // Функция создания диспетчера (обязательная)
  createDispatcherFn: (storage: IStorage<TStore>) => TDispatcher
  // Функция создания конфигурации для эффектов (обязательная)
  createEffectConfig: (dispatcher: TDispatcher) => {
    dispatchers: Record<string, any>
    api?: TApi
    config?: TConfig
    externalStates?: ExternalStates
  }
  // Эффекты
  effects?: Effect<TStore, any, TApi, TConfig, any>[]
}

// Валидация конфигурации Synapse
function validateSynapseConfig(config: any): void {
  // Проверяем базовые требования к хранилищу
  if (!config.storage && !config.createStorageFn) {
    throw new Error('Synapse config must have either "storage" or "createStorageFn"')
  }

  if (config.storage && config.createStorageFn) {
    throw new Error('Synapse config cannot have both "storage" and "createStorageFn". Choose one.')
  }

  // Проверяем зависимости эффектов от диспетчера
  if (config.effects && !config.createDispatcherFn) {
    throw new Error('Effects require dispatcher. Add "createDispatcherFn" to config.')
  }

  if (config.createEffectConfig && !config.createDispatcherFn) {
    throw new Error('Effect config requires dispatcher. Add "createDispatcherFn" to config.')
  }

  // Проверяем зависимости
  if (config.dependencies) {
    if (!Array.isArray(config.dependencies)) {
      throw new Error('Dependencies must be an array')
    }

    config.dependencies.forEach((dependency: any, index: number) => {
      if (!dependency || typeof dependency !== 'object') {
        throw new Error(`Dependency at index ${index} must be an object`)
      }

      if (!dependency.storage || typeof dependency.storage.waitForReady !== 'function') {
        throw new Error(`Dependency at index ${index} must have a storage with waitForReady method`)
      }
    })
  }

  // Проверяем функции создания
  if (config.createStorageFn && typeof config.createStorageFn !== 'function') {
    throw new Error('"createStorageFn" must be a function')
  }

  if (config.createDispatcherFn && typeof config.createDispatcherFn !== 'function') {
    throw new Error('"createDispatcherFn" must be a function')
  }

  if (config.createSelectorsFn && typeof config.createSelectorsFn !== 'function') {
    throw new Error('"createSelectorsFn" must be a function')
  }

  if (config.createEffectConfig && typeof config.createEffectConfig !== 'function') {
    throw new Error('"createEffectConfig" must be a function')
  }

  // Проверяем эффекты
  if (config.effects) {
    if (!Array.isArray(config.effects)) {
      throw new Error('Effects must be an array')
    }

    config.effects.forEach((effect: any, index: number) => {
      if (typeof effect !== 'function') {
        throw new Error(`Effect at index ${index} must be a function`)
      }
    })
  }

  // Проверяем setup
  if (config.setup && typeof config.setup !== 'function') {
    throw new Error('"setup" must be a function')
  }

  // Проверяем внешние селекторы
  if (config.externalSelectors && typeof config.externalSelectors !== 'object') {
    throw new Error('External selectors must be an object')
  }
}

const DEFAULT_DEPENDENCY_TIMEOUT = 30_000

// Функция для ожидания готовности зависимостей
async function waitForDependencies(dependencies: SynapseDependency[] = [], timeoutMs: number = DEFAULT_DEPENDENCY_TIMEOUT): Promise<void> {
  if (dependencies.length === 0) {
    return
  }

  logError(`Waiting for ${dependencies.length} dependencies to be ready...`, '', null, 'warn')

  await Promise.all(
    dependencies.map(async (dependency, index) => {
      const name = dependency.storage.name || 'unnamed'

      try {
        await Promise.race([
          dependency.storage.waitForReady(),
          new Promise<never>((_, reject) =>
            globalThis.setTimeout(
              () => reject(new Error(`Dependency ${index} ("${name}") timed out after ${timeoutMs}ms. Check that it initializes correctly.`)),
              timeoutMs,
            ),
          ),
        ])
      } catch (error) {
        handleOperationError(`createSynapse: dependency ${index} ("${name}") failed to initialize`, error)
      }
    }),
  )
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
export type AnySynapseStore<
  TStore extends Record<string, any> = any,
  TStorage extends IStorageBase<TStore> = IStorage<any>,
  TSelectors = any,
  TActions = any,
> =
  | SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>
  | SynapseStoreWithDispatcher<TStore, TStorage, TSelectors, TActions>
  | SynapseStoreBasic<TStore, TStorage, TSelectors>

/**
 * Перегрузки функции createSynapse
 */

// Случай 1: С dispatcher и effects
export function createSynapse<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
  TApi extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
  TStorage extends IStorage<TStore> = IStorage<TStore>,
>(
  config: CreateSynapseConfigWithEffects<TStore, TSelectors, TDispatcher, TApi, TConfig, TExternalSelectors>,
): Promise<SynapseStoreWithEffects<TStore, TStorage, TSelectors, ExtractDispatchType<TDispatcher>>>

// Случай 2: Только с dispatcher
export function createSynapse<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
  TStorage extends IStorage<TStore> = IStorage<TStore>,
>(
  config: CreateSynapseConfigWithDispatcher<TStore, TSelectors, TDispatcher, TExternalSelectors>,
): Promise<SynapseStoreWithDispatcher<TStore, TStorage, TSelectors, ExtractDispatchType<TDispatcher>>>

// Случай 3: Без dispatcher
export function createSynapse<
  TStore extends Record<string, any>,
  TSelectors = any,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
  TStorage extends IStorage<TStore> = IStorage<TStore>,
>(config: CreateSynapseConfigBasic<TStore, TSelectors, TExternalSelectors>): Promise<SynapseStoreBasic<TStore, TStorage, TSelectors>>

// Основная реализация
export async function createSynapse<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
  TApi extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
  TStorage extends IStorage<TStore> = IStorage<TStore>,
>(config: any): Promise<any> {
  // 0. Валидируем конфигурацию
  try {
    validateSynapseConfig(config)
  } catch (error) {
    handleOperationError('createSynapse: configuration validation failed', error)
  }

  // 1. Сначала ждем готовности всех зависимостей
  await waitForDependencies(config.dependencies, config.dependencyTimeout)

  // 1.5. Выполняем setup (например, инициализация API-клиентов)
  if (config.setup) {
    try {
      await config.setup()
    } catch (error) {
      handleOperationError('createSynapse: setup failed', error)
    }
  }

  // 2. Создаем и инициализируем хранилище
  const storageInstance = (config.createStorageFn ? await config.createStorageFn() : config.storage!) as TStorage

  // 3. Инициализируем и ждём готовности нашего хранилища
  await storageInstance.initialize()

  // Создаем сборщики для последующей очистки
  const cleanupCallbacks: Array<() => Promise<void> | void> = []

  const result: any = {
    storage: storageInstance,
    selectors: {} as TSelectors,
    destroy: async () => {
      for (const callback of cleanupCallbacks) {
        await callback()
      }
    },
  }

  cleanupCallbacks.push(() => storageInstance.destroy())

  let dispatcher: TDispatcher | undefined
  let selectorModule: ISelectorModule<TStore>
  let effectsModule: any

  // Создаем модуль селекторов
  if (config.createSelectorsFn) {
    try {
      selectorModule = new SelectorModule(storageInstance)

      const externalSelectors = config.externalSelectors || ({} as TExternalSelectors)

      result.selectors = config.createSelectorsFn(selectorModule, externalSelectors)

      if (typeof (selectorModule as any).destroy === 'function') {
        cleanupCallbacks.push(() => selectorModule.destroy())
      }
    } catch (error) {
      handleCallbackError('createSynapse: error creating selectors', error)
    }
  }

  // Создаем диспетчер
  if (config.createDispatcherFn) {
    dispatcher = config.createDispatcherFn(storageInstance)
    result.dispatcher = dispatcher

    // @ts-ignore
    if (dispatcher && 'dispatch' in dispatcher) {
      result.actions = (dispatcher as any).dispatch

      if (typeof (dispatcher as any).destroy === 'function') {
        cleanupCallbacks.push(() => (dispatcher as any).destroy())
      }
    }
  }

  // Создаем и настраиваем модуль эффектов
  if (config.createEffectConfig && dispatcher) {
    try {
      const { dispatchers, api, config: effectConfig, externalStates } = config.createEffectConfig(dispatcher)

      // Получаем внешние состояния из конфигурации эффектов
      const effectExternalStates = externalStates || {}

      // Создаем модуль эффектов с внешними состояниями
      effectsModule = new EffectsModule(storageInstance, effectExternalStates, dispatchers, api, effectConfig)

      // Добавляем эффекты
      if (Array.isArray(config.effects)) {
        // @ts-ignore
        config.effects.forEach((effect) => {
          if (effectsModule) effectsModule.add(effect)
        })
      }

      // Запускаем модуль эффектов
      await effectsModule.start()
      result.state$ = effectsModule.state$

      // Добавляем очистку эффектов
      cleanupCallbacks.push(() => {
        if (effectsModule) effectsModule.stop()
      })
    } catch (error) {
      handleCallbackError('createSynapse: error creating effects module', error)
    }
  }

  return result
}

