import { ComponentType, createContext, forwardRef, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react'
import { Observable } from 'rxjs'

import { handleCleanupError } from '../../_utils/error-handling.util'
import { IStorage, StorageStatus } from '../../core'
import { createSynapseAwaiter, dehydrateModule, type Synapse, type SynapseAwaiter, type SynapseModule } from '../../utils'

const ERROR_HOOK_MESSAGE = 'Хук необходимо использовать внутри компонента contextSynapse'
const ERROR_CONTEXT_INIT = 'Ошибка при инициализации контекста:'

interface SimplifiedOptions {
  loadingComponent?: React.ReactNode
  /**
   * Включает серверный рендер засеянных sync-сторов (Memory/LocalStorage). При `ssr: true`
   * и синхронно-готовом сторе Provider рендерит children сразу (без `loadingComponent`),
   * что даёт контент в серверном HTML и совпадающий первый кадр при гидрации.
   * Для async-сторов (IndexedDB) поведение прежнее — гейт `loadingComponent`.
   */
  ssr?: boolean
}

export function createSynapseCtx<TState extends Record<string, any>, TDispatcher, TSelectors>(
  synapseModule: SynapseModule<TState, TDispatcher, TSelectors>,
  options?: SimplifiedOptions,
) {
  const { loadingComponent = <div>Инициализация контекста...</div>, ssr = false } = options || {}

  type ReadySynapse = Synapse<TState, TDispatcher, TSelectors>

  const SynapseContext = createContext<ReadySynapse | null>(null)

  // ── Awaiter ───────────────────────────────────────────────────────────────
  // Клиент сохраняет прежнюю синглтон-семантику: один awaiter на handle (общий стор,
  // фабрика стартует один раз при первом mount). На сервере синглтон уровня модуля
  // запрещён (request bleed), поэтому там awaiter живёт per-render-tree и не шарится.
  let clientAwaiter: SynapseAwaiter<ReadySynapse> | null = null

  const getClientAwaiter = () => {
    if (!clientAwaiter) clientAwaiter = createSynapseAwaiter<ReadySynapse>(synapseModule)
    return clientAwaiter
  }

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

  // Серверный помощник: тонкая обёртка над server-safe dehydrateModule (вся логика там).
  // initialState — серверные данные под запрос, не статический initialState модуля; ssr — из
  // опций контекста.
  const dehydrate = (opts?: { initialState?: Partial<TState> }): Promise<TState> => dehydrateModule(synapseModule, { state: opts?.initialState, ssr })

  /**
   * Декоратор для обёртки компонентов в контекст Synapse.
   */
  function contextSynapse<SelfComponentProps>(Component: ComponentType<SelfComponentProps>) {
    const WrappedComponent = forwardRef<unknown, SelfComponentProps & { dehydratedState?: TState }>(function WrappedComponent(props, ref) {
      const { dehydratedState, ...restProps } = props as SelfComponentProps & { dehydratedState?: TState }

      // Per-tree awaiter при наличии dehydratedState (изоляция server-рендера); иначе —
      // общий клиентский awaiter (обратная совместимость).
      const treeAwaiterRef = useRef<SynapseAwaiter<ReadySynapse> | null>(null)
      const resolveAwaiter = (): SynapseAwaiter<ReadySynapse> => {
        if (dehydratedState !== undefined) {
          if (!treeAwaiterRef.current) treeAwaiterRef.current = createSynapseAwaiter<ReadySynapse>(synapseModule)
          return treeAwaiterRef.current
        }
        return getClientAwaiter()
      }

      // Синхронный засев снапшота ДО первого рендера: одинаковый HTML на сервере и клиенте.
      const seedHydration = (store: ReadySynapse | undefined) => {
        if (store && dehydratedState !== undefined && store.storage.initStatus.status === StorageStatus.READY) {
          store.storage.hydrate(dehydratedState)
        }
      }

      const [synapseStore, setSynapseStore] = useState<ReadySynapse | undefined>(() => {
        const store = resolveAwaiter().getStoreIfReady()
        seedHydration(store)
        return store
      })
      const [error, setError] = useState<Error | null>(() => resolveAwaiter().getError())

      useEffect(() => {
        // На сервере эффект не исполняется — подписки/догрузка стартуют только на клиенте.
        const instance = resolveAwaiter()
        const current = instance.getStoreIfReady()
        seedHydration(current)
        setSynapseStore(current)
        setError(instance.getError())

        const unsubscribeReady = instance.onReady((store) => {
          seedHydration(store)
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

      if (error) return <div>{`${ERROR_CONTEXT_INIT} ${error.message}`}</div>

      // SSR-гейт: при ssr и синхронно-готовом сторе (сервер после dehydrate / клиентская
      // гидрация) synapseStore уже есть → рендерим children. Иначе — прежний гейт загрузки
      // (async-сторы и обычный клиентский старт).
      if (!synapseStore) return <>{loadingComponent}</>

      return (
        <SynapseContext.Provider value={synapseStore}>
          <Component {...(restProps as PropsWithChildren<SelfComponentProps>)} ref={ref} />
        </SynapseContext.Provider>
      )
    })

    const componentName = Component.displayName || Component.name || 'Component'
    WrappedComponent.displayName = `SynapseContext(${componentName})`

    // Копируем статические свойства оригинального компонента
    const excludedKeys = new Set(['$$typeof', 'render', 'defaultProps', 'displayName', 'propTypes'])
    Object.keys(Component).forEach((key) => {
      if (!excludedKeys.has(key)) {
        ;(WrappedComponent as any)[key] = (Component as any)[key]
      }
    })

    return WrappedComponent as ComponentType<SelfComponentProps & { dehydratedState?: TState }>
  }

  const cleanupSynapse = async (): Promise<void> => {
    const instance = clientAwaiter
    clientAwaiter = null
    try {
      instance?.destroy()
      await synapseModule.destroy()
    } catch (error) {
      handleCleanupError('createSynapseCtx: error during Synapse cleanup', error)
    }
  }

  return {
    contextSynapse,
    dehydrate,
    useSynapseStorage,
    useSynapseSelectors,
    useSynapseActions,
    useSynapseState$,
    cleanupSynapse,
  }
}
