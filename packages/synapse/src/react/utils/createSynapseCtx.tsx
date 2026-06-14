import { ComponentType, createContext, forwardRef, PropsWithChildren, useContext, useEffect, useState } from 'react'
import { Observable } from 'rxjs'

import { handleCleanupError } from '../../_utils/error-handling.util'
import { IStorage } from '../../core'
import { createSynapseAwaiter, type Synapse, type SynapseModule } from '../../utils'

const ERROR_HOOK_MESSAGE = 'Хук необходимо использовать внутри компонента contextSynapse'
const ERROR_CONTEXT_INIT = 'Ошибка при инициализации контекста:'

interface SimplifiedOptions {
  loadingComponent?: React.ReactNode
}

/**
 * React-обёртка над class-based `SynapseModule`-handle. Запускает фабрику лениво при
 * первом монтировании Provider'а (синглтон на handle), гейтит детей до готовности и
 * раздаёт `storage`/`selectors`/`actions`/`state$` через хуки. Очистка делегируется
 * самому handle (`destroy()` сбрасывает мемоизацию → пересоздаваемость).
 */
export function createSynapseCtx<TState extends Record<string, any>, TDispatcher, TSelectors>(
  synapseModule: SynapseModule<TState, TDispatcher, TSelectors>,
  options?: SimplifiedOptions,
) {
  const { loadingComponent = <div>Инициализация контекста...</div> } = options || {}

  type ReadySynapse = Synapse<TState, TDispatcher, TSelectors>

  // Lazy-инициализация: awaiter создаётся при первом обращении и сбрасывается при cleanup.
  // createSynapseAwaiter дожидается handle через Promise.resolve, что лениво дёргает
  // фабрику (handle.ready()) при создании awaiter, т.е. при первом mount.
  let awaiter: ReturnType<typeof createSynapseAwaiter<ReadySynapse>> | null = null

  const getAwaiter = () => {
    if (!awaiter) awaiter = createSynapseAwaiter<ReadySynapse>(synapseModule)
    return awaiter
  }

  const SynapseContext = createContext<ReadySynapse | null>(null)

  const useSynapseStorage = (): IStorage<TState> => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(`useSynapseStorage: ${ERROR_HOOK_MESSAGE}`)
    return context.storage
  }

  const useSynapseSelectors = (): TSelectors => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(`useSynapseSelectors: ${ERROR_HOOK_MESSAGE}`)
    return context.selectors
  }

  const useSynapseActions = (): TDispatcher => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(`useSynapseActions: ${ERROR_HOOK_MESSAGE}`)
    return context.actions
  }

  const useSynapseState$ = (): Observable<TState> => {
    const context = useContext(SynapseContext)
    if (!context) throw new Error(`useSynapseState$: ${ERROR_HOOK_MESSAGE}`)
    return context.state$
  }

  /**
   * Декоратор для обертывания компонентов в контекст Synapse
   */
  function contextSynapse<SelfComponentProps>(Component: ComponentType<SelfComponentProps>) {
    const WrappedComponent = forwardRef<unknown, SelfComponentProps>(function WrappedComponent(props, ref) {
      const [synapseStore, setSynapseStore] = useState<ReadySynapse | undefined>(() => getAwaiter().getStoreIfReady())
      const [error, setError] = useState<Error | null>(() => getAwaiter().getError())

      useEffect(() => {
        // awaiter мог поменять состояние между рендером и эффектом — синхронизируемся
        const instance = getAwaiter()
        setSynapseStore(instance.getStoreIfReady())
        setError(instance.getError())

        const unsubscribeReady = instance.onReady((store) => {
          setSynapseStore(store)
          setError(null)
        })
        const unsubscribeError = instance.onError((err) => {
          setSynapseStore(undefined)
          setError(err)
        })

        return () => {
          unsubscribeReady()
          unsubscribeError()
        }
      }, [])

      // Показываем ошибку если что-то пошло не так
      if (error) return <div>{`${ERROR_CONTEXT_INIT} ${error.message}`}</div>

      // Показываем загрузку пока store не готов
      if (!synapseStore) return <>{loadingComponent}</>

      return (
        <SynapseContext.Provider value={synapseStore}>
          <Component {...(props as PropsWithChildren<SelfComponentProps>)} ref={ref} />
        </SynapseContext.Provider>
      )
    })

    // Устанавливаем отображаемое имя для отладки
    const componentName = Component.displayName || Component.name || 'Component'
    WrappedComponent.displayName = `SynapseContext(${componentName})`

    // Копируем статические свойства оригинального компонента
    const excludedKeys = new Set(['$$typeof', 'render', 'defaultProps', 'displayName', 'propTypes'])
    Object.keys(Component).forEach((key) => {
      if (!excludedKeys.has(key)) {
        ;(WrappedComponent as any)[key] = (Component as any)[key]
      }
    })

    return WrappedComponent as ComponentType<SelfComponentProps>
  }

  const cleanupSynapse = async (): Promise<void> => {
    // Handle владеет жизненным циклом synapse (LIFO-teardown + сброс мемоизации):
    // делегируем очистку ему, чтобы следующий mount заново исполнил фабрику.
    const instance = awaiter
    awaiter = null
    try {
      instance?.destroy()
      await synapseModule.destroy()
    } catch (error) {
      handleCleanupError('createSynapseCtx: error during Synapse cleanup', error)
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
