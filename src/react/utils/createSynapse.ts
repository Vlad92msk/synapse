// createSynapse.ts

import { Observable } from 'rxjs'

import { IStorage, MemoryStorage, SelectorModule, StorageConfig, StorageType } from '../../core'
import { createDispatcher, EffectsModule, loggerDispatcherMiddleware } from '../../reactive'

type StorageParam<T> = (StorageConfig & { type: StorageType }) | (() => Promise<T>)

// Обобщенный интерфейс для конфигурации
interface CreateSynapseConfig<TStore extends Record<string, any>, TSelectors, TExternalSelectors, TDispatchers, TApi, TConfig> {
  // Конфигурация хранилища
  storage: StorageParam<TStore>

  // Внешние селекторы
  externalSelectors?: TExternalSelectors

  // Функция создания селекторов - принимает SelectorModule и внешние селекторы
  createSelectorsFn: (selectorModule: any, externalSelectors: TExternalSelectors) => TSelectors

  // Функция создания диспетчера - принимает хранилище
  createDispatcherFn: (storage: any) => any

  // Функция создания конфигурации для эффектов
  createEffectConfig: (dispatcher: any) => {
    dispatchers: TDispatchers
    api: TApi
    config?: TConfig
  }

  // Модули эффектов
  effectsModules?: any[]
}

// Тип для результата createSynapse
interface SynapseStore<TStore, TSelectors, TActions> {
  storage: any
  selectors: TSelectors
  actions: TActions
  state$: Observable<TStore>
}

// Определяем тип, позволяющий выводить типы из функций
type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T
type ExtractStorageType<T> = T extends IStorage<infer U> ? U : any
type ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : any

/**
 * Factory function to create a Synapse store with selectors, actions, and effects
 */
export function createSynapse<TConfig extends CreateSynapseConfig<any, any, any, any, any, any>>(config: TConfig) {
  // Выводим типы на основе функций в конфигурации
  type TStore = any // Тип хранилища из конфигурации
  type TSelectors = ReturnType<TConfig['createSelectorsFn']>
  type TDispatcher = ReturnType<TConfig['createDispatcherFn']>
  type TActions = ExtractDispatchType<TDispatcher>

  return (async function initializeStore(): Promise<SynapseStore<TStore, TSelectors, TActions>> {
    // 1. Create storage based on config
    let storageInstance: any

    // Создаем хранилище на основе конфига
    if (typeof config.storage === 'function') {
      // Используем функцию для создания хранилища
      storageInstance = await config.storage()
      // Инициализируем, если не инициализировано
      if (typeof storageInstance.initialize === 'function' && !storageInstance.initialized) {
        await storageInstance.initialize()
      }
    } else {
      // Используем конфигурацию для создания хранилища
      const storageConfig = config.storage
      if (storageConfig.type === 'memory') {
        storageInstance = new MemoryStorage(storageConfig)
      } else if (storageConfig.type === 'localStorage') {
        // Add localStorage implementation
        throw new Error(`localStorage storage type not implemented yet`)
      } else if (storageConfig.type === 'indexedDB') {
        // Add indexedDB implementation
        throw new Error(`indexedDB storage type not implemented yet`)
      } else {
        throw new Error(`Storage type ${storageConfig.type} not supported`)
      }

      await storageInstance.initialize()
    }

    await storageInstance.initialize()

    console.log('storageInstance', storageInstance)
    // 2. Create selector module
    const selectorModule = new SelectorModule(storageInstance)
    console.log('selectorModule', selectorModule)
    // 3. Create selectors using the provided function
    const selectors = config.createSelectorsFn(selectorModule, config.externalSelectors || {})

    // 4. Create dispatcher
    const dispatcher = config.createDispatcherFn(storageInstance)

    // 5. Create effects module
    const { dispatchers, api, config: effectConfig } = config.createEffectConfig(dispatcher)

    const effectsModule = new EffectsModule(storageInstance, dispatchers, api, effectConfig)

    // 6. Add effects modules
    const effectsModulesToAdd = config.effectsModules || []
    effectsModulesToAdd.forEach((effect) => effectsModule.add(effect))

    // 7. Start effects module
    effectsModule.start()

    // 8. Return everything needed to work with the store
    return {
      storage: storageInstance,
      selectors,
      actions: dispatcher.dispatch,
      state$: effectsModule.state$,
    }
  })()
}
