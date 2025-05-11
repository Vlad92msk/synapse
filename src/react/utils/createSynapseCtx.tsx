import { ComponentType, createContext, useContext, useEffect, useRef, useState, PropsWithChildren } from 'react';
import { IStorage } from '../../core';
import { Effect, EffectsModule } from '../../reactive'
import { Observable } from 'rxjs';

// Обобщенный интерфейс для конфигурации
interface CreateSynapseContextConfig<
  TStore extends Record<string, any>,
  TStorage,
  TSelectors,
  TDispatcher,
  TActions
> {
  // Функция создания хранилища
  createStorageFn: () => Promise<TStorage>;

  // Функция создания селекторов
  createSelectorsFn: (storage: TStorage) => TSelectors;

  // Функция создания диспетчера
  createDispatcherFn: (storage: TStorage) => TDispatcher;

  // Эффекты
  effects?: Effect<TStore, any, any, any> | Effect<TStore, any, any, any>[];

  // Функция создания конфигурации для эффектов
  createEffectConfig: (dispatcher: TDispatcher) => {
    dispatchers: Record<string, any>;
    api: Record<string, any>;
    config?: any;
  };
}

// Тип для локального хранилища
interface SynapseStore<TStore, TStorage, TSelectors, TActions> {
  storage: TStorage;
  actions: TActions;
  selectors: TSelectors;
  state$: Observable<TStore>;
}

// Определяем тип, позволяющий выводить типы из функций
type ExtractPromiseType<T> = T extends Promise<infer U> ? U : T;
type ExtractDispatchType<T> = T extends { dispatch: infer D } ? D : any;

/**
 * Создает контекст для работы с хранилищем Synapse с правильной типизацией
 */
export function createSynapseCtx<
  TConfig extends CreateSynapseContextConfig<any, any, any, any, any>
>(config: TConfig) {
  // Выводим типы на основе функций в конфигурации
  type TStorage = ExtractPromiseType<ReturnType<TConfig['createStorageFn']>>;
  type TStore = TStorage extends IStorage<infer T> ? T : any;
  type TSelectors = ReturnType<TConfig['createSelectorsFn']>;
  type TDispatcher = ReturnType<TConfig['createDispatcherFn']>;
  type TActions = ExtractDispatchType<TDispatcher>;

  // Создаем контекст
  const SynapseContext = createContext<SynapseStore<TStore, TStorage, TSelectors, TActions> | null>(null);

  // Хуки для доступа к объектам из контекста
  const useSynapseStorage = (): TStorage => {
    const context = useContext(SynapseContext);
    if (!context) {
      throw new Error('useSynapseStorage must be used within a contextSynapse component');
    }
    return context.storage;
  };

  const useSynapseActions = (): TActions => {
    const context = useContext(SynapseContext);
    if (!context) {
      throw new Error('useSynapseActions must be used within a contextSynapse component');
    }
    return context.actions;
  };

  const useSynapseSelectors = (): TSelectors => {
    const context = useContext(SynapseContext);
    if (!context) {
      throw new Error('useSynapseSelectors must be used within a contextSynapse component');
    }
    return context.selectors;
  };

  const useSynapseState$ = (): Observable<TStore> => {
    const context = useContext(SynapseContext);
    if (!context) {
      throw new Error('useSynapseState$ must be used within a contextSynapse component');
    }
    return context.state$;
  };

  // Функция HOC для обертывания компонентов с двумя параметрами типа
// Функция HOC для обертывания компонентов с двумя параметрами типа
  function contextSynapse<SelfComponentProps, PublicContextProps extends Partial<TStore> = Partial<TStore>>(
    Component: ComponentType<SelfComponentProps>
  ) {
    return function WrappedComponent({ contextProps, ...props }: SelfComponentProps & { contextProps?: PublicContextProps }) {
      const storeRef = useRef<SynapseStore<TStore, TStorage, TSelectors, TActions> | null>(null);
      const [isInitialized, setIsInitialized] = useState(false);
      const effectsModuleRef = useRef<any>(null);
      const debugIdRef = useRef(`synapse-${Math.random().toString(36).substring(2, 9)}`);

      useEffect(() => {
        let mounted = true;
        console.log(`[${debugIdRef.current}] Component mounted`);

        const initialize = async () => {
          try {
            console.log(`[${debugIdRef.current}] Initializing context`);

            // 1. Создаем хранилище
            const storage = await config.createStorageFn();
            console.log(`[${debugIdRef.current}] Storage created`);

            // Применяем contextProps, если они есть
            if (contextProps && Object.keys(contextProps).length > 0) {
              await storage.update((state: any) => {
                Object.assign(state, contextProps);
              });
              console.log(`[${debugIdRef.current}] Applied context props`);
            }

            // 2. Создаем селекторы
            const selectors = config.createSelectorsFn(storage);
            console.log(`[${debugIdRef.current}] Selectors created`);

            // Проверяем наличие метода destroy
            const hasDestroyMethod = (selectors as any).selectorsDestroy &&
              typeof (selectors as any).selectorsDestroy === 'function';

            if (hasDestroyMethod) {
              console.log(`[${debugIdRef.current}] Found selectorsDestroy method`);
            } else {
              console.log(`[${debugIdRef.current}] No selectorsDestroy method found`);
            }

            // 3. Создаем диспетчер
            const dispatcher = config.createDispatcherFn(storage);
            console.log(`[${debugIdRef.current}] Dispatcher created`);

            if (config.createEffectConfig) {
              // 4. Создаем конфигурацию для модуля эффектов
              const effectConfig = config.createEffectConfig(dispatcher);
              console.log(`[${debugIdRef.current}] Effect config created`);

              // 5. Создаем модуль эффектов
              try {
                const effectsModule = new EffectsModule(
                  storage,
                  effectConfig.dispatchers,
                  effectConfig.api,
                  effectConfig.config,
                );
                console.log(`[${debugIdRef.current}] Effects module created`);

                // 6. Добавляем эффекты, если они есть
                if (config.effects) {
                  if (Array.isArray(config.effects)) {
                    effectsModule.addEffects(config.effects);
                  } else {
                    effectsModule.add(config.effects);
                  }
                  console.log(`[${debugIdRef.current}] Effects added`);
                }

                // 7. Запускаем эффекты
                effectsModule.start();
                console.log(`[${debugIdRef.current}] Effects started`);

                effectsModuleRef.current = effectsModule;
              } catch (err) {
                console.error(`[${debugIdRef.current}] Error initializing EffectsModule:`, err);
                console.debug(`[${debugIdRef.current}] Effect config:`, effectConfig);
                // Продолжаем работу без эффектов
              }
            }

            if (mounted) {
              // Сохраняем объекты в ref
              storeRef.current = {
                storage,
                selectors,
                actions: dispatcher.dispatch,
                state$: effectsModuleRef.current?.state$ || (storage.state$ as Observable<TStore>) || new Observable()
              };

              console.log(`[${debugIdRef.current}] Context initialized successfully`);
              setIsInitialized(true);
            }
          } catch (error) {
            console.error(`[${debugIdRef.current}] Failed to initialize Synapse context:`, error);
          }
        };

        // Запускаем инициализацию
        initialize();

        // Функция очистки
        return () => {
          console.log(`[${debugIdRef.current}] Component unmounting, cleanup started`);
          mounted = false;

          // Очистка селекторов при размонтировании
          if (storeRef.current?.selectors && (storeRef.current.selectors as any).selectorsDestroy) {
            try {
              console.log(`[${debugIdRef.current}] Calling selectorsDestroy method`);
              (storeRef.current.selectors as any).selectorsDestroy();
              console.log(`[${debugIdRef.current}] Selectors destroyed successfully`);
            } catch (e) {
              console.error(`[${debugIdRef.current}] Error destroying selectors:`, e);
            }
          }

          // Очистка при размонтировании
          if (effectsModuleRef.current) {
            try {
              effectsModuleRef.current.stop();
              console.log(`[${debugIdRef.current}] Effects module stopped`);
            } catch (e) {
              console.error(`[${debugIdRef.current}] Error stopping effects module:`, e);
            }
            effectsModuleRef.current = null;
          }

          storeRef.current = null;
          console.log(`[${debugIdRef.current}] Cleanup completed`);
        };
      }, []);

      if (!isInitialized || !storeRef.current) {
        console.log(`[${debugIdRef.current}] Not yet initialized, returning null`);
        return null;
      }

      console.log(`[${debugIdRef.current}] Rendering component with context`);
      return (
        <SynapseContext.Provider value={storeRef.current}>
          <Component {...(props as PropsWithChildren<SelfComponentProps>)} />
        </SynapseContext.Provider>
      );
    };
  }

  // Возвращаем функции и хуки с правильными типами
  return {
    contextSynapse,
    useSynapseStorage,
    useSynapseActions,
    useSynapseSelectors,
    useSynapseState$,
  };
}
