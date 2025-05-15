import { Observable } from 'rxjs'

import { IStorage, SelectorModule, StorageCreatorFunction } from '../../core'
import { Effect, EffectsModule } from '../../reactive'

// Вспомогательные типы для извлечения типов из других типов
export type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T
export type ExtractStorageType<T> = T extends IStorage<infer U> ? U : never
export type ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : never

/**
 * Интерфейс конфигурации с обобщенными типами
 * Используем более гибкие типы для параметров, чтобы избежать проблем с совместимостью
 */
export interface CreateSynapseConfig<
  TStore extends Record<string, any>,
  TSelectors = any,
  TDispatcher = any,
  TApi extends Record<string, any> = Record<string, never>,
  TConfig extends Record<string, any> = Record<string, never>,
> {
  // Функция создания хранилища
  createStorageFn: StorageCreatorFunction<TStore>

  // Внешние селекторы
  externalSelectors?: Record<string, any>

  // Функция создания селекторов
  // Используем any для selectorModule, чтобы избежать проблем с совместимостью
  createSelectorsFn?: (selectorModule: SelectorModule<TStore>, externalSelectors?: Record<string, any>) => TSelectors

  // Функция создания диспетчера
  createDispatcherFn?: (storage: IStorage<TStore>) => TDispatcher

  // Функция создания конфигурации для эффектов
  createEffectConfig?: (dispatcher: TDispatcher) => {
    dispatchers: Record<string, any>
    api?: TApi
    config?: TConfig
  }

  // Модули эффектов
  effectsModules?: Effect[]
}

/**
 * Интерфейс результата с обобщенными типами
 */
export interface SynapseStore<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors = any, TActions = any> {
  storage: TStorage
  selectors: TSelectors
  actions: TActions
  state$: Observable<TStore>
  destroy: () => Promise<void>
}

/**
 * Создает хранилище Synapse с селекторами, действиями и эффектами
 *
 * @example
 * const {
 *   storage,
 *   selectors,
 *   actions,
 *   state$
 * } = await createSynapse({
 *   createStorageFn: createUserPageStorage,
 *   createSelectorsFn: createUserInfoSelectors,
 *   createDispatcherFn: createUserInfoDispatcher,
 *   externalSelectors: {},
 *   createEffectConfig: (dispatcher) => ({
 *     dispatchers: {
 *       userInfoDispatcher: dispatcher,
 *     },
 *     api: {
 *       userInfoApi: userInfoEndpoints,
 *     },
 *   }),
 * });
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
  TStorage extends IStorage<TStore> = IStorage<TStore>,
  TActions = ExtractDispatchType<TDispatcher>,
>(config: CreateSynapseConfig<TStore, TSelectors, TDispatcher, TApi, TConfig>): Promise<SynapseStore<TStore, TStorage, TSelectors, TActions>> {
  // Создаем и инициализируем хранилище
  const storageInstance = (await config.createStorageFn()) as TStorage

  // Создаем сборщики для последующей очистки
  const cleanupCallbacks: Array<() => Promise<void> | void> = []

  // Подготавливаем возвращаемый объект с базовыми настройками
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

  // Добавляем колбэк для уничтожения хранилища
  cleanupCallbacks.push(() => storageInstance.destroy())

  let dispatcher: TDispatcher | undefined
  let selectorModule: any
  let effectsModule: any

  // Создаем модуль селекторов, если нужно
  if (config.createSelectorsFn) {
    try {
      // Импортируем SelectorModule динамически

      selectorModule = new SelectorModule(storageInstance)

      const externalSelectors = config.externalSelectors || {}
      result.selectors = config.createSelectorsFn(selectorModule, externalSelectors)

      // Добавляем очистку селекторов, если есть метод destroy
      if (typeof (result.selectors as any).selectorsDestroy === 'function') {
        cleanupCallbacks.push(() => (result.selectors as any).selectorsDestroy())
      }
    } catch (error) {
      console.error('Error creating selectors:', error)
      // В случае ошибки оставляем пустой объект селекторов
    }
  }

  // Создаем диспетчер, если нужно
  if (config.createDispatcherFn) {
    dispatcher = config.createDispatcherFn(storageInstance)
    // Проверяем наличие dispatch в диспетчере
    // @ts-ignore
    if (dispatcher && 'dispatch' in dispatcher) {
      result.actions = (dispatcher as any).dispatch as TActions

      // Добавляем очистку диспетчера, если есть метод destroy
      if (typeof (dispatcher as any).destroy === 'function') {
        cleanupCallbacks.push(() => (dispatcher as any).destroy())
      }
    }
  }

  // Создаем и настраиваем модуль эффектов, если нужно
  if (config.createEffectConfig && dispatcher) {
    try {
      const { dispatchers, api, config: effectConfig } = config.createEffectConfig(dispatcher)

      // Импортируем EffectsModule динамически

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
    } catch (error) {
      console.error('Error creating effects module:', error)
      // В случае ошибки оставляем Observable по умолчанию
    }
  }

  return result
}
