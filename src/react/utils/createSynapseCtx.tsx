import { ComponentType, createContext, PropsWithChildren, useContext, useEffect, useState } from 'react'
import { Observable } from 'rxjs'

import { IStorage } from '../../core'
import { AnySynapseStore, SynapseStoreBasic, SynapseStoreWithDispatcher, SynapseStoreWithEffects } from '../../utils'

const ERROR_HOOK_MESSAGE = 'Хук необходимо использовать внутри компонента contextSynapse'
const ERROR_CONTEXT_INIT = 'Ошибка при инициализации контекста:'

interface SimplifiedOptions {
  loadingComponent?: React.ReactNode
}

/**
 * Перегрузки для createSynapseCtx в зависимости от типа хранилища
 */

// Для хранилища с effects
export function createSynapseCtx<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors, TActions>(
  synapseStorePromise: Promise<SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>> | SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>,
  options?: SimplifiedOptions,
): {
  contextSynapse: <SelfComponentProps>(Component: ComponentType<SelfComponentProps>) => ComponentType<SelfComponentProps>
  useSynapseStorage: () => TStorage
  useSynapseSelectors: () => TSelectors
  useSynapseActions: () => TActions
  useSynapseState$: () => Observable<TStore>
  cleanupSynapse: () => Promise<void>
}

// Для хранилища с dispatcher (без effects)
export function createSynapseCtx<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors, TActions>(
  synapseStorePromise: Promise<SynapseStoreWithDispatcher<TStore, TStorage, TSelectors, TActions>> | SynapseStoreWithDispatcher<TStore, TStorage, TSelectors, TActions>,
  options?: SimplifiedOptions,
): {
  contextSynapse: <SelfComponentProps>(Component: ComponentType<SelfComponentProps>) => ComponentType<SelfComponentProps>
  useSynapseStorage: () => TStorage
  useSynapseSelectors: () => TSelectors
  useSynapseActions: () => TActions
  cleanupSynapse: () => Promise<void>
}

// Для базового хранилища
export function createSynapseCtx<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors>(
  synapseStorePromise: Promise<SynapseStoreBasic<TStore, TStorage, TSelectors>> | SynapseStoreBasic<TStore, TStorage, TSelectors>,
  options?: SimplifiedOptions,
): {
  contextSynapse: <SelfComponentProps>(Component: ComponentType<SelfComponentProps>) => ComponentType<SelfComponentProps>
  useSynapseStorage: () => TStorage
  useSynapseSelectors: () => TSelectors
  cleanupSynapse: () => Promise<void>
}

// Основная реализация
export function createSynapseCtx<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors = any, TActions = any>(
  synapseStorePromise: Promise<AnySynapseStore<TStore, TStorage, TSelectors, TActions>> | AnySynapseStore<TStore, TStorage, TSelectors, TActions>,
  options?: SimplifiedOptions,
) {
  const { loadingComponent = <div>Инициализация контекста...</div> } = options || {}

  // Создаем Promise для инициализации хранилища
  const storeInitPromise = (async () => {
    try {
      const store = await (synapseStorePromise instanceof Promise ? synapseStorePromise : Promise.resolve(synapseStorePromise))
      await store.storage.waitForReady()
      return store
    } catch (error) {
      console.error('Ошибка инициализации хранилища Synapse:', error)
      throw error
    }
  })()

  const SynapseContext = createContext<AnySynapseStore<TStore, TStorage, TSelectors, TActions> | null>(null)

  const useSynapseStorage = (): TStorage => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(`useSynapseStorage: ${ERROR_HOOK_MESSAGE}`)
    return context.storage
  }

  const useSynapseSelectors = (): TSelectors => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(`useSynapseSelectors: ${ERROR_HOOK_MESSAGE}`)
    return context.selectors
  }

  // Условный хук для actions (только если есть dispatcher)
  const useSynapseActions = (): TActions => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(`useSynapseActions: ${ERROR_HOOK_MESSAGE}`)

    if ('actions' in context) {
      return (context as SynapseStoreWithDispatcher<TStore, TStorage, TSelectors, TActions> | SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>).actions
    }

    throw new Error('useSynapseActions: actions недоступны для этого типа хранилища. Убедитесь, что передана функция createDispatcherFn при создании хранилища.')
  }

  // Условный хук для state$ (только если есть effects)
  const useSynapseState$ = (): Observable<TStore> => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(`useSynapseState$: ${ERROR_HOOK_MESSAGE}`)

    if ('state$' in context) {
      return (context as SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>).state$
    }

    throw new Error('useSynapseState$: state$ недоступен для этого типа хранилища. Убедитесь, что переданы функции createDispatcherFn и createEffectConfig при создании хранилища.')
  }

  /**
   * Декоратор для обертывания компонентов в контекст Synapse
   */
  function contextSynapse<SelfComponentProps>(Component: ComponentType<SelfComponentProps>) {
    function WrappedComponent(props: SelfComponentProps) {
      const [synapseStore, setSynapseStore] = useState<AnySynapseStore<TStore, TStorage, TSelectors, TActions> | null>(null)
      const [isReady, setIsReady] = useState(false)
      const [error, setError] = useState<Error | null>(null)

      useEffect(() => {
        let mounted = true

        const initializeContext = async () => {
          try {
            const store = await storeInitPromise

            if (mounted) {
              setSynapseStore(store)
              setIsReady(true)
            }
          } catch (err) {
            if (mounted) {
              setError(err instanceof Error ? err : new Error(String(err)))
            }
          }
        }

        initializeContext()

        return () => {
          mounted = false
        }
      }, [])

      // Показываем ошибку если что-то пошло не так
      if (error) return <div>{`${ERROR_CONTEXT_INIT}: ${error.message}`}</div>

      // Показываем загрузку пока все не готово
      if (!isReady || !synapseStore) return <>{loadingComponent}</>

      return (
        <SynapseContext.Provider value={synapseStore}>
          <Component {...(props as PropsWithChildren<SelfComponentProps>)} />
        </SynapseContext.Provider>
      )
    }

    // Устанавливаем отображаемое имя для отладки
    const componentName = Component.displayName || Component.name || 'Component'
    WrappedComponent.displayName = `SynapseContext(${componentName})`

    return WrappedComponent
  }

  const cleanupSynapse = async (): Promise<void> => {
    try {
      const store = await storeInitPromise
      return store?.destroy() || Promise.resolve()
    } catch (error) {
      console.error('Ошибка при очистке Synapse:', error)
    }
  }

  return {
    contextSynapse,
    useSynapseStorage,
    useSynapseSelectors,
    useSynapseActions,
    useSynapseState$,
    cleanupSynapse,
  }
}
