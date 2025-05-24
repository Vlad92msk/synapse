import { Observable } from 'rxjs'

import { ISelectorModule, IStorage, SelectorModule } from '../core'
import { Effect, EffectsModule, ExternalStates } from '../reactive'

// Вспомогательные типы для извлечения типов из других типов
export type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T
export type ExtractStorageType<T> = T extends IStorage<infer U> ? U : never
export type ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : never

export type StorageCreatorFunction<T extends Record<string, any>> = () => Promise<IStorage<T>>

/**
 * Базовая конфигурация хранилища
 */
type BaseSynapseConfig<TStore extends Record<string, any>, TSelectors = any, TExternalSelectors extends Record<string, any> = Record<string, any>> = (
  | { storage: IStorage<TStore>; createStorageFn?: undefined }
  | { storage?: undefined; createStorageFn: StorageCreatorFunction<TStore> }
) & {
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
  // Создаем и инициализируем хранилище
  const storageInstance = (config.createStorageFn ? await config.createStorageFn() : config.storage!) as TStorage

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
      effectsModule.start()
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
