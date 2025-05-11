import { Observable } from 'rxjs'

import { IStorage, MemoryStorage, SelectorModule, StorageConfig, StorageType } from '../../core'
import { ActionsSetupWithUtils, Dispatcher, Effect, EffectsModule } from '../../reactive'

// Вспомогательные типы для извлечения типов из других типов
export type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T
export type ExtractStorageType<T> = T extends IStorage<infer U> ? U : never
export type ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : never

// Тип параметра хранилища
export type StorageParam = (StorageConfig & { type: StorageType }) | (() => Promise<any>)

// Интерфейс конфигурации с обобщенными типами
export interface CreateSynapseConfig<
  TStore extends Record<string, any>,
  TStorage = IStorage<TStore>,
  TSelectors = any,
  TDispatcher = unknown,
  TApi extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
> {
  // Параметр хранилища
  storage: StorageParam

  // Внешние селекторы (опционально)
  externalSelectors?: any

  // Функция создания селекторов (опционально)
  createSelectorsFn?: (selectorModule: any, externalSelectors?: any) => TSelectors

  // Функция создания диспетчера (опционально)
  createDispatcherFn?: (storage: TStorage) => TDispatcher

  // Функция создания конфигурации для эффектов (опционально)
  createEffectConfig?: (dispatcher: TDispatcher) => {
    dispatchers: Record<string, Dispatcher<TStore, ActionsSetupWithUtils<TStore>>>
    api?: TApi
    config?: TConfig
  }

  // Модули эффектов (опционально)
  effectsModules?: Effect[]
}

// Интерфейс результата с обобщенными типами
export interface SynapseStore<TStore extends Record<string, any>, TStorage = IStorage<TStore>, TSelectors = any, TActions = any> {
  storage: TStorage
  selectors: TSelectors
  actions: TActions
  state$: Observable<ExtractStorageType<TStorage>>
  destroy: () => Promise<void>
}

/**
 * Создает хранилище Synapse с селекторами, действиями и эффектами
 *
 * @param config Конфигурация для создания хранилища
 * @returns Promise, который разрешается в SynapseStore
 */
export function createSynapse<
  TStore extends Record<string, any>,
  TStorage extends IStorage<TStore>,
  TSelectors = any,
  TDispatcher = any,
  TApi extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TActions = ExtractDispatchType<TDispatcher>,
>(config: CreateSynapseConfig<TStore, TStorage, TSelectors, TDispatcher, TApi, TConfig>): Promise<SynapseStore<TStore, TStorage, TSelectors, TActions>> {
  return (async function initializeStore() {
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
        throw new Error(`Storage type ${(storageConfig as any).type} not supported`)
      }

      await storageInstance.initialize()
    }

    // Создаем сборщики для последующей очистки
    const cleanupCallbacks: Array<() => Promise<void> | void> = []

    // 2. Подготавливаем возвращаемый объект с базовыми настройками
    const result: SynapseStore<TStore, TStorage, TSelectors, TActions> = {
      storage: storageInstance as TStorage,
      selectors: {} as TSelectors,
      actions: {} as TActions,
      state$: new Observable<ExtractStorageType<TStorage>>(),
      destroy: async () => {
        for (const callback of cleanupCallbacks) {
          await callback()
        }
      },
    }

    // Добавляем колбэк для уничтожения хранилища
    cleanupCallbacks.push(() => storageInstance.destroy())

    let dispatcher: TDispatcher | undefined
    let selectorModule: any
    let effectsModule: any

    // 3. Создаем модуль селекторов, если нужно
    if (config.createSelectorsFn) {
      selectorModule = new SelectorModule(storageInstance)
      const externalSelectors = config.externalSelectors || {}
      result.selectors = config.createSelectorsFn(selectorModule, externalSelectors)

      // Добавляем очистку селекторов, если есть метод destroy
      if (typeof (result.selectors as any).selectorsDestroy === 'function') {
        cleanupCallbacks.push(() => (result.selectors as any).selectorsDestroy())
      }
    }

    // 4. Создаем диспетчер, если нужно
    if (config.createDispatcherFn) {
      dispatcher = config.createDispatcherFn(storageInstance)
      // @ts-ignore
      if (dispatcher && 'dispatch' in dispatcher) {
        result.actions = dispatcher.dispatch as TActions

        // Добавляем очистку диспетчера, если есть метод destroy
        if (typeof (dispatcher as any).destroy === 'function') {
          cleanupCallbacks.push(() => (dispatcher as any).destroy())
        }
      }
    }

    // 5. Создаем и настраиваем модуль эффектов, если нужно
    if (config.createEffectConfig && dispatcher) {
      const { dispatchers, api, config: effectConfig } = config.createEffectConfig(dispatcher)
      effectsModule = new EffectsModule(storageInstance, dispatchers, api, effectConfig)

      // Добавляем эффекты, если они предоставлены
      if (Array.isArray(config.effectsModules)) {
        config.effectsModules.forEach((effect) => {
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
    }

    return result
  })()
}
