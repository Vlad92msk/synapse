import { ComponentType, createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react'
import { Observable } from 'rxjs'

import { deepMerge } from '../../_utils'
import { IStorage } from '../../core'
import { AnySynapseStore, SynapseStoreBasic, SynapseStoreWithDispatcher, SynapseStoreWithEffects } from '../../utils'

const ERROR_HOOK_MESSAGE = 'useSynapseActions необходимо использовать внутри компонента contextSynapse'
const ERROR_CONTEXT_INIT = 'Ошибка при инициализации контекста:'

interface Options<TStore extends Record<string, any>> {
  loadingComponent?: any
  mergeFn?: (target: TStore, source: Record<string, any>) => void
}

/**
 * Типы для условного возврата хуков в зависимости от типа store
 */
type ConditionalActions<T> = T extends SynapseStoreWithEffects<any, any, any, infer A> ? A : T extends SynapseStoreWithDispatcher<any, any, any, infer A> ? A : never

type ConditionalState$<T> = T extends SynapseStoreWithEffects<infer S, any, any, any> ? Observable<S> : never

/**
 * Перегрузки для createSynapseCtx в зависимости от типа хранилища
 */

// Для хранилища с effects
export function createSynapseCtx<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors, TActions>(
  synapseStorePromise: Promise<SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>> | SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>,
  options?: Options<TStore>,
): {
  contextSynapse: <SelfComponentProps, PublicContextProps = Record<string, any>>(
    Component: ComponentType<SelfComponentProps>,
  ) => ComponentType<SelfComponentProps & { contextProps?: PublicContextProps }>
  useSynapseStorage: () => TStorage
  useSynapseSelectors: () => TSelectors
  useSynapseActions: () => TActions
  useSynapseState$: () => Observable<TStore>
  cleanupSynapse: () => Promise<void>
}

// Для хранилища с dispatcher (без effects)
export function createSynapseCtx<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors, TActions>(
  synapseStorePromise: Promise<SynapseStoreWithDispatcher<TStore, TStorage, TSelectors, TActions>> | SynapseStoreWithDispatcher<TStore, TStorage, TSelectors, TActions>,
  options?: Options<TStore>,
): {
  contextSynapse: <SelfComponentProps, PublicContextProps = Record<string, any>>(
    Component: ComponentType<SelfComponentProps>,
  ) => ComponentType<SelfComponentProps & { contextProps?: PublicContextProps }>
  useSynapseStorage: () => TStorage
  useSynapseSelectors: () => TSelectors
  useSynapseActions: () => TActions
  cleanupSynapse: () => Promise<void>
}

// Для базового хранилища
export function createSynapseCtx<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors>(
  synapseStorePromise: Promise<SynapseStoreBasic<TStore, TStorage, TSelectors>> | SynapseStoreBasic<TStore, TStorage, TSelectors>,
  options?: Options<TStore>,
): {
  contextSynapse: <SelfComponentProps, PublicContextProps = Record<string, any>>(
    Component: ComponentType<SelfComponentProps>,
  ) => ComponentType<SelfComponentProps & { contextProps?: PublicContextProps }>
  useSynapseStorage: () => TStorage
  useSynapseSelectors: () => TSelectors
  cleanupSynapse: () => Promise<void>
}

// Основная реализация
export function createSynapseCtx<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors = any, TActions = any>(
  synapseStorePromise: Promise<AnySynapseStore<TStore, TStorage, TSelectors, TActions>> | AnySynapseStore<TStore, TStorage, TSelectors, TActions>,
  options?: Options<TStore>,
) {
  const { loadingComponent = null, mergeFn = deepMerge } = options || {}

  // Храним ссылку на store
  let synapseStore: AnySynapseStore<TStore, TStorage, TSelectors, TActions> | null = null

  // Флаг готовности хранилища
  let storeReady = false

  // Если передан Promise, начинаем его обработку
  const initPromise = (async () => {
    try {
      synapseStore = await (synapseStorePromise instanceof Promise ? synapseStorePromise : Promise.resolve(synapseStorePromise))
      storeReady = true
    } catch (error) {
      console.error('Ошибка инициализации хранилища Synapse:', error)
    }
  })()

  const SynapseContext = createContext<AnySynapseStore<TStore, TStorage, TSelectors, TActions> | null>(null)

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

  // Условный хук для actions (только если есть dispatcher)
  const useSynapseActions = (): TActions => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    if ('actions' in context) {
      return (context as SynapseStoreWithDispatcher<TStore, TStorage, TSelectors, TActions> | SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>).actions
    }

    throw new Error('useSynapseActions: actions недоступны для этого типа хранилища. Убедитесь, что передана функция createDispatcherFn при создании хранилища.')
  }

  // Условный хук для state$ (только если есть effects)
  const useSynapseState$ = (): Observable<TStore> => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    if ('state$' in context) {
      return (context as SynapseStoreWithEffects<TStore, TStorage, TSelectors, TActions>).state$
    }

    throw new Error('useSynapseState$: state$ недоступен для этого типа хранилища. Убедитесь, что переданы функции createDispatcherFn и createEffectConfig при создании хранилища.')
  }

  /**
   * Декоратор для обертывания компонентов в контекст Synapse
   */
  function contextSynapse<SelfComponentProps, PublicContextProps = Record<string, any>>(Component: ComponentType<SelfComponentProps>) {
    type WrappedComponentProps = SelfComponentProps & { contextProps?: PublicContextProps }

    function WrappedComponent({ contextProps, ...props }: WrappedComponentProps) {
      const [initialized, setInitialized] = useState(false)
      const [storeInitialized, setStoreInitialized] = useState(storeReady)
      const debugIdRef = useRef(`synapse-${synapseStore?.storage.name || 'initializing'}`)

      // Отслеживаем инициализацию хранилища, если оно еще не готово
      useEffect(() => {
        if (!storeReady) {
          initPromise.then(() => {
            setStoreInitialized(true)
          })
        }
      }, [])

      // Инициализируем контекст при монтировании компонента
      useEffect(() => {
        // Не начинаем инициализацию контекста, пока хранилище не готово
        if (!storeInitialized) return

        let mounted = true

        const initializeContext = async () => {
          try {
            if (synapseStore && contextProps && Object.keys(contextProps).length > 0) {
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
        }
      }, [contextProps, storeInitialized])

      // Проверяем инициализацию хранилища и контекста
      if (!storeInitialized) {
        return loadingComponent || <div>Загрузка хранилища...</div>
      }

      if (!initialized) {
        return loadingComponent || <div>Инициализация контекста...</div>
      }

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
    await initPromise // Ждем завершения инициализации
    return synapseStore?.destroy() || Promise.resolve()
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
