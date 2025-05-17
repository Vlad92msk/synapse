import { ComponentType, createContext, useContext, useEffect, useRef, useState, PropsWithChildren } from 'react'
import { Observable } from 'rxjs'
import { IStorage } from '../../core'
import { SynapseStore } from './createSynapse'
import { deepMerge } from '../../utils'

const ERROR_HOOK_MESSAGE = 'useSynapseActions необходимо использовать внутри компонента contextSynapse'
const ERROR_CONTEXT_INIT = 'Ошибка при инициализации контекста:'


interface Options<TStore extends Record<string, any>> {
  loadingComponent?: any,
  mergeFn?: (target: TStore, source: Record<string, any>) => void
}

/**
 * Создает React-контекст и хуки для удобного использования хранилища Synapse в React-компонентах
 *
 * @param synapseStore - Хранилище, созданное функцией createSynapse
 * @param options
 * @returns Объект с функцией HOC и хуками для доступа к хранилищу
 */
export function createSynapseCtx<
  TStore extends Record<string, any>,
  TStorage extends IStorage<TStore>,
  TSelectors = any,
  TActions = any
>(
  synapseStore: SynapseStore<TStore, TStorage, TSelectors, TActions>,
  options?: Options<TStore>
) {
  const {
    loadingComponent = null,
    mergeFn = deepMerge
  } = options || {}

  const SynapseContext = createContext<SynapseStore<TStore, TStorage, TSelectors, TActions> | null>(null)

  const useSynapseStorage = (): TStorage => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    return context.storage
  }

  const useSynapseSelectors = (): TSelectors => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    return context.selectors
  }

  const useSynapseActions = (): TActions => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    return context.actions
  }

  const useSynapseState$ = (): Observable<TStore> => {
    const context = useContext(SynapseContext);
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    return context.state$
  }

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
            if (contextProps && Object.keys(contextProps).length > 0) {
              await synapseStore.storage.update((state) => {
                mergeFn(state, contextProps)
              })
            }

            if (mounted) {
              setInitialized(true)
            }
          } catch (error) {
            console.error(`[${debugIdRef.current}] ${ERROR_CONTEXT_INIT}`, error)
          }
        }

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
