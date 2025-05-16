import { Observable } from 'rxjs'

import { ISelectorModule, IStorage, SelectorAPI, SelectorModule, StorageCreatorFunction } from '../../core'
import { Effect, EffectsModule } from '../../reactive'

// Вспомогательные типы для извлечения типов из других типов
export type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T
export type ExtractStorageType<T> = T extends IStorage<infer U> ? U : never
export type ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : never

/**
 * Конфигурация хранилища
 */
export interface CreateSynapseConfig<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
  TApi extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
> {
  // Функция создания хранилища
  createStorageFn: StorageCreatorFunction<TStore>

  // Внешние селекторы
  externalSelectors?: TExternalSelectors

  // Функция создания селекторов
  createSelectorsFn?: (selectorModule: ISelectorModule<TStore>, externalSelectors: TExternalSelectors) => TSelectors

  // Функция создания диспетчера
  createDispatcherFn?: (storage: IStorage<TStore>) => TDispatcher

  // Функция создания конфигурации для эффектов
  createEffectConfig?: (dispatcher: TDispatcher) => {
    dispatchers: Record<string, any>
    api?: TApi
    config?: TConfig
  }

  // Эффекты
  effects?: Effect<TStore, any, TApi, TConfig>[]
}

/**
 * Возвращаемый результат
 */
export interface SynapseStore<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors = any, TActions = any> {
  storage: TStorage
  selectors: TSelectors
  actions: TActions
  state$: Observable<TStore>
  destroy: () => Promise<void>
}

/**
 * Создает хранилище Synapse
 *
 * @param config Конфигурация для создания хранилища
 * @returns Promise, который разрешается в SynapseStore
 */
export async function createSynapse<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
  TApi extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
  TStorage extends IStorage<TStore> = IStorage<TStore>,
  TActions = ExtractDispatchType<TDispatcher>,
>(config: CreateSynapseConfig<TStore, TSelectors, TDispatcher, TApi, TConfig, TExternalSelectors>): Promise<SynapseStore<TStore, TStorage, TSelectors, TActions>> {
  // Создаем и инициализируем хранилище
  const storageInstance = (await config.createStorageFn()) as TStorage

  // Создаем сборщики для последующей очистки
  const cleanupCallbacks: Array<() => Promise<void> | void> = []

  const result: SynapseStore<TStore, TStorage, TSelectors, TActions> = {
    storage: storageInstance,
    selectors: {} as TSelectors,
    actions: {} as TActions,
    state$: new Observable<TStore>(),
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

    // @ts-ignore
    if (dispatcher && 'dispatch' in dispatcher) {
      result.actions = (dispatcher as any).dispatch as TActions

      if (typeof (dispatcher as any).destroy === 'function') {
        cleanupCallbacks.push(() => (dispatcher as any).destroy())
      }
    }
  }

  // Создаем и настраиваем модуль эффектов
  if (config.createEffectConfig && dispatcher) {
    try {
      const { dispatchers, api, config: effectConfig } = config.createEffectConfig(dispatcher)

      // Создаем модуль эффектов
      effectsModule = new EffectsModule(storageInstance, dispatchers, api, effectConfig)

      // Добавляем эффекты
      if (Array.isArray(config.effects)) {
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
