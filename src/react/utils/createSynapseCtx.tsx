import { ComponentType, createContext, useContext, useEffect, useRef, useState, PropsWithChildren } from 'react';
import { Observable } from 'rxjs';
import { IStorage } from '../../core';
import { SynapseStore } from './createSynapse'

/**
 * Создает React-контекст и хуки для удобного использования хранилища Synapse в React-компонентах
 * Аналогично createZustandContext, но с поддержкой Synapse
 *
 * @param synapseStore - Хранилище, созданное функцией createSynapse
 * @returns Объект с функцией HOC и хуками для доступа к хранилищу
 */
export function createSynapseCtx<
  TStore extends Record<string, any>,
  TStorage extends IStorage<TStore>,
  TSelectors = any,
  TActions = any
>(
  synapseStore: SynapseStore<TStore, TStorage, TSelectors, TActions>
) {
  // Создаем контекст
  const SynapseContext = createContext<SynapseStore<TStore, TStorage, TSelectors, TActions> | null>(null);

  // Хук для доступа к хранилищу
  const useSynapseStorage = (): TStorage => {
    const context = useContext(SynapseContext);
    if (!context) {
      throw new Error('useSynapseStorage must be used within a contextSynapse component');
    }
    return context.storage;
  };

  // Хук для доступа к селекторам (аналог useZustandSelector)
  const useSynapseSelectors = (): TSelectors => {
    const context = useContext(SynapseContext);
    if (!context) {
      throw new Error('useSynapseSelectors must be used within a contextSynapse component');
    }
    return context.selectors;
  };

  // Хук для доступа к действиям (аналог useZustandDispatch)
  const useSynapseActions = (): TActions => {
    const context = useContext(SynapseContext);
    if (!context) {
      throw new Error('useSynapseActions must be used within a contextSynapse component');
    }
    return context.actions;
  };

  // Хук для доступа к потоку изменений состояния
  const useSynapseState$ = (): Observable<TStore> => {
    const context = useContext(SynapseContext);
    if (!context) {
      throw new Error('useSynapseState$ must be used within a contextSynapse component');
    }
    return context.state$;
  };

  /**
   * HOC для обертывания компонентов контекстом Synapse
   * Аналогичен contextZustand из вашего примера
   */
  function contextSynapse<
    SelfComponentProps,
    PublicContextProps = Record<string, any>
  >(
    Component: ComponentType<SelfComponentProps>
  ) {
    type WrappedComponentProps = SelfComponentProps & { contextProps?: PublicContextProps };

    function WrappedComponent({ contextProps, ...props }: WrappedComponentProps) {
      const [initialized, setInitialized] = useState(false);
      const debugIdRef = useRef(`synapse-${Math.random().toString(36).substring(2, 9)}`);

      // Инициализируем контекст при монтировании компонента
      useEffect(() => {
        let mounted = true;

        const initializeContext = async () => {
          try {
            // Если переданы contextProps, обновляем состояние
            if (contextProps && Object.keys(contextProps).length > 0) {
              await synapseStore.storage.update((state) => {
                // Для каждого ключа в contextProps
                Object.entries(contextProps).forEach(([key, value]) => {
                  if (key in state) {
                    (state as any)[key] = value;
                  }
                });
              });
            }

            if (mounted) {
              setInitialized(true);
            }
          } catch (error) {
            console.error(`[${debugIdRef.current}] Error initializing context:`, error);
          }
        };

        initializeContext();

        return () => {
          mounted = false;
        };
      }, [contextProps]);

      if (!initialized) {
        return null; // или можно вернуть индикатор загрузки
      }

      return (
        <SynapseContext.Provider value={synapseStore}>
          <Component {...(props as PropsWithChildren<SelfComponentProps>)} />
        </SynapseContext.Provider>
      );
    }

    // Устанавливаем отображаемое имя для отладки
    const componentName = Component.displayName || Component.name || 'Component';
    WrappedComponent.displayName = `SynapseContext(${componentName})`;

    return WrappedComponent;
  }

  // Возвращаем объект с функциями и хуками, аналогично createZustandContext
  return {
    contextSynapse,
    useSynapseStorage,
    useSynapseSelectors,
    useSynapseActions,
    useSynapseState$,
  };
}
