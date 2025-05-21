import { ComponentType, createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react'
import { Observable } from 'rxjs'

import { deepMerge } from '../../_utils'
import { IStorage } from '../../core'
import { SynapseStore } from '../../utils'

const ERROR_HOOK_MESSAGE = 'useSynapseActions необходимо использовать внутри компонента contextSynapse'
const ERROR_CONTEXT_INIT = 'Ошибка при инициализации контекста:'

interface Options<TStore extends Record<string, any>> {
  loadingComponent?: any
  mergeFn?: (target: TStore, source: Record<string, any>) => void
}

/**
 * Создает React-контекст и хуки для удобного использования хранилища Synapse в React-компонентах
 *
 * @param synapseStore - Хранилище, созданное функцией createSynapse
 * @param options
 * @returns Объект с функцией HOC и хуками для доступа к хранилищу
 */
// Модифицированный createSynapseCtx.tsx
export function createSynapseCtx<TStore extends Record<string, any>, TStorage extends IStorage<TStore>, TSelectors = any, TActions = any>(
  synapseStorePromise: Promise<SynapseStore<TStore, TStorage, TSelectors, TActions>> | SynapseStore<TStore, TStorage, TSelectors, TActions>,
  options?: Options<TStore>,
) {
  const { loadingComponent = null, mergeFn = deepMerge } = options || {}

  // Храним ссылку на store
  let synapseStore: SynapseStore<TStore, TStorage, TSelectors, TActions> | null = null

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
    const context = useContext(SynapseContext)
    if (!context) throw new Error(ERROR_HOOK_MESSAGE)

    return context.state$
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
