import { handleCallbackError, handleOperationError } from '../../_utils/error-handling.util'
import type { Selectors } from '../../core'
import { ISelectorModule, IStorage, SelectorModule } from '../../core'
import type { Dispatcher, Effects } from '../../reactive'
import { EffectsModule } from '../../reactive'
import { createSynapseModule } from './factory'
import type { SynapseConfig, SynapseModule } from './synapse.types'
import type {
  CreateSynapseConfigBasic,
  CreateSynapseConfigWithDispatcher,
  CreateSynapseConfigWithEffects,
  ExtractDispatchType,
  SynapseStoreBasic,
  SynapseStoreWithDispatcher,
  SynapseStoreWithEffects,
} from './types'
import { validateSynapseConfig } from './validate'
import { waitForDependencies } from './waitForDependencies'

// Старый пайплайн (объект-конфиг) — без изменений поведения.
async function createSynapseFromConfig<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
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

  // 2. Выполняем setup (например, инициализация API-клиентов)
  if (config.setup) {
    try {
      await config.setup()
    } catch (error) {
      handleOperationError('createSynapse: setup failed', error)
    }
  }

  // 3. Создаем и инициализируем хранилище
  const storageInstance = (config.createStorageFn ? await config.createStorageFn() : config.storage!) as TStorage
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

  // 4. Создаем модуль селекторов
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

  // 5. Создаем диспетчер
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

  // 6. Создаем и настраиваем модуль эффектов
  if (config.createEffectConfig && dispatcher) {
    try {
      const { services, config: effectConfig, externalDispatchers, externalStates } = config.createEffectConfig()

      effectsModule = new EffectsModule(storageInstance, dispatcher as any, externalDispatchers || {}, services, effectConfig, externalStates || {})

      if (Array.isArray(config.effects)) {
        // @ts-ignore
        config.effects.forEach((effect) => {
          if (effectsModule) effectsModule.add(effect)
        })
      }

      await effectsModule.start()
      result.state$ = effectsModule.state$

      cleanupCallbacks.push(() => {
        if (effectsModule) effectsModule.stop()
      })
    } catch (error) {
      handleCallbackError('createSynapse: error creating effects module', error)
    }
  }

  return result
}

/**
 * Перегрузки функции createSynapse
 */

// Случай 0 (новая форма): фабрика-функция → ленивый class-based SynapseModule.
export function createSynapse<
  TState extends Record<string, any>,
  TDispatcher extends Dispatcher<TState> | undefined = undefined,
  TSelectors extends Selectors<TState> | undefined = undefined,
  TEffects extends Effects<TState, NonNullable<TDispatcher>, any> | undefined = undefined,
>(
  factory: () => SynapseConfig<TState, TDispatcher, TSelectors, TEffects> | Promise<SynapseConfig<TState, TDispatcher, TSelectors, TEffects>>,
): SynapseModule<TState, TDispatcher, TSelectors>

// Случай 1: С dispatcher и effects
export function createSynapse<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
  TServices extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
  TExternalSelectors extends Record<string, any> = Record<string, any>,
  TStorage extends IStorage<TStore> = IStorage<TStore>,
>(
  config: CreateSynapseConfigWithEffects<TStore, TSelectors, TDispatcher, TServices, TConfig, TExternalSelectors>,
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

// Основная реализация: фабрика-функция → новый ленивый handle, объект → старый пайплайн.
export function createSynapse(arg: any): any {
  if (typeof arg === 'function') {
    return createSynapseModule(arg)
  }
  return createSynapseFromConfig(arg)
}
