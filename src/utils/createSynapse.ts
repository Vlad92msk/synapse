import { Observable } from 'rxjs'

import { ISelectorModule, IStorage, SelectorModule } from '../core'
import { Effect, EffectsModule, ExternalStates } from '../reactive'

// Вспомогательные типы для извлечения типов из других типов
export type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T
export type ExtractStorageType<T> = T extends IStorage<infer U> ? U : never
export type ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : never

export type StorageCreatorFunction<T extends Record<string, any>> = () => Promise<IStorage<T>>

export type SynapseDependency = {
  storage: IStorage<any>
  [key: string]: any // Для других свойств synapse (dispatcher, selectors, etc.)
}

/**
 * Базовая конфигурация хранилища
 */
type BaseSynapseConfig<TStore extends Record<string, any>, TSelectors = any, TExternalSelectors extends Record<string, any> = Record<string, any>> = (
  | { storage: IStorage<TStore>; createStorageFn?: undefined }
  | { storage?: undefined; createStorageFn: StorageCreatorFunction<TStore> }
) & {
  // Зависимости от других synapse
  dependencies?: SynapseDependency[]
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

  // Проверяем внешние селекторы
  if (config.externalSelectors && typeof config.externalSelectors !== 'object') {
    throw new Error('External selectors must be an object')
  }
}

// Функция для ожидания готовности зависимостей
async function waitForDependencies(dependencies: SynapseDependency[] = []): Promise<void> {
  if (dependencies.length === 0) {
    return
  }

  console.log(`Waiting for ${dependencies.length} dependencies to be ready...`)

  await Promise.all(
    dependencies.map(async (dependency, index) => {
      try {
        await dependency.storage.waitForReady()
        console.log(`Dependency ${index} (${dependency.storage.name || 'unnamed'}) is ready`)
      } catch (error) {
        console.error(`Dependency ${index} failed to initialize:`, error)
        throw new Error(`Dependency ${index} initialization failed: ${error}`)
      }
    }),
  )

  console.log('All dependencies are ready!')
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
export interface SynapseStoreWithEffects<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors, TActions> {
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
export interface SynapseStoreWithDispatcher<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors, TActions> {
  storage: TStorage
  selectors: TSelectors
  actions: TActions
  dispatcher: any
  destroy: () => Promise<void>
}

/**
 * Результат без dispatcher
 */
export interface SynapseStoreBasic<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors> {
  storage: TStorage
  selectors: TSelectors
  destroy: () => Promise<void>
}

/**
 * Union-тип для всех возможных результатов createSynapse
 */
export type AnySynapseStore<TStore extends Record<string, any> = any, TStorage extends IStorage<TStore> = IStorage<any>, TSelectors = any, TActions = any> =
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
    console.error('Synapse configuration validation failed:', error)
    throw error
  }

  // 1. Сначала ждем готовности всех зависимостей
  await waitForDependencies(config.dependencies)

  // 2. Создаем и инициализируем хранилище
  const storageInstance = (config.createStorageFn ? await config.createStorageFn() : config.storage!) as TStorage

  // 3. Ждем готовности нашего хранилища
  await storageInstance.waitForReady()
  console.log(`Storage "${storageInstance.name}" is ready`)

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
      console.error('Ошибка создания selectors:', error)
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
      console.error('Ошибка создания модуля эффектов:', error)
    }
  }

  return result
}
