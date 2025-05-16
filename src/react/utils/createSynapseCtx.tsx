import { ComponentType, createContext, useContext, useEffect, useRef, useState, PropsWithChildren } from 'react';
import { Observable } from 'rxjs';
import { IStorage } from '../../core';
import { SynapseStore } from './createSynapse'

const ERROR_HOOK_MESSAGE = 'useSynapseActions необходимо использовать внутри компонента contextSynapse'
const ERROR_CONTEXT_INIT = 'Ошибка при инициализации контекста:'

/**
 * Создает React-контекст и хуки для удобного использования хранилища Synapse в React-компонентах
 *
 * @param synapseStore - Хранилище, созданное функцией createSynapse
 * @param loadingComponent - компонент который будет отображет пока идет загрузка
 * @returns Объект с функцией HOC и хуками для доступа к хранилищу
 */
export function createSynapseCtx<
  TStore extends Record<string, any>,
  TStorage extends IStorage<TStore>,
  TSelectors = any,
  TActions = any
>(
  synapseStore: SynapseStore<TStore, TStorage, TSelectors, TActions>,
  loadingComponent?: any
) {
  // Создаем контекст
  const SynapseContext = createContext<SynapseStore<TStore, TStorage, TSelectors, TActions> | null>(null)

  // Хук для доступа к хранилищу
  const useSynapseStorage = (): TStorage => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    return context.storage
  };

  // Хук для доступа к селекторам (аналог useZustandSelector)
  const useSynapseSelectors = (): TSelectors => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    return context.selectors
  };

  // Хук для доступа к действиям (аналог useZustandDispatch)
  const useSynapseActions = (): TActions => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    return context.actions
  };

  // Хук для доступа к потоку изменений состояния
  const useSynapseState$ = (): Observable<TStore> => {
    const context = useContext(SynapseContext);
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    return context.state$
  };

  /**
   * Декоратор для обертывания компонентов в контекст Synapse
   */
  function contextSynapse<
    SelfComponentProps,
    PublicContextProps = Record<string, any>
  >(
    Component: ComponentType<SelfComponentProps>
  ) {
    type WrappedComponentProps = SelfComponentProps & { contextProps?: PublicContextProps }

    function WrappedComponent({ contextProps, ...props }: WrappedComponentProps) {
      const [initialized, setInitialized] = useState(false)
      const debugIdRef = useRef(`synapse-${synapseStore.storage.name}`)

      // Инициализируем контекст при монтировании компонента
      useEffect(() => {
        let mounted = true

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
                })
              })
            }

            if (mounted) {
              setInitialized(true);
            }
          } catch (error) {
            console.error(`[${debugIdRef.current}] ${ERROR_CONTEXT_INIT}`, error)
          }
        };

        initializeContext()

        return () => {
          mounted = false
        };
      }, [contextProps])

      if (!initialized) return loadingComponent

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

  const cleanupSynapse = async (): Promise<void> => {
    return synapseStore.destroy();
  };

  return {
    contextSynapse,
    useSynapseStorage,
    useSynapseSelectors,
    useSynapseActions,
    useSynapseState$,
    cleanupSynapse,
  };
}
