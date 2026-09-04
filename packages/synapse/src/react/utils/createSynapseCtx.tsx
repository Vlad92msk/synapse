import { ComponentType, createContext, forwardRef, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react'
import { Observable } from 'rxjs'

import { handleCleanupError } from '../../_utils/error-handling.util'
import { IStorage, StorageStatus } from '../../core'
import { dehydrateModule, type Synapse, type SynapseModule, type SyncSynapseModule } from '../../utils'

const ERROR_HOOK_MESSAGE = 'Хук необходимо использовать внутри компонента contextSynapse'
const ERROR_CONTEXT_INIT = 'Ошибка при инициализации контекста:'

interface SimplifiedOptions {
  /** Запасной рендер, если стор не удалось построить синхронно (в норме C-форма всегда готова к первому кадру). */
  loadingComponent?: React.ReactNode
}

export function createSynapseCtx<TState extends Record<string, any>, TDispatcher, TSelectors>(
  synapseModule: SynapseModule<TState, TDispatcher, TSelectors>,
  options?: SimplifiedOptions,
) {
  const { loadingComponent = <div>Инициализация контекста...</div> } = options || {}

  type ReadySynapse = Synapse<TState, TDispatcher, TSelectors>

  const SynapseContext = createContext<ReadySynapse | null>(null)

  // Клиент: общий main-синглтон. Sync-handle строит его лениво при первом обращении к геттеру —
  // трогаем `.storage`, затем берём готовый снапшот. Стор один на приложение, роуты пере-сеют его.
  const getClientStore = (): ReadySynapse | undefined => {
    void (synapseModule as SyncSynapseModule<TState, TDispatcher, TSelectors>).storage
    return synapseModule.getSnapshot()
  }

  // Трекинг засева общего клиентского main. Стор один на приложение, поэтому состояние —
  // на уровне контекста (не пер-инстанс):
  //  • `clientRenderSeeded` — первый клиентский маунт разрешено сеять в фазе рендера (живых
  //    подписчиков ещё нет), чтобы первый кадр совпал с SSR-HTML; последующие маунты — только в эффекте.
  //  • `lastClientSnapshot` — идемпотентность по ссылке: тем же снапшотом повторно не сеем.
  let clientRenderSeeded = false
  let lastClientSnapshot: TState | undefined

  // Клиентский засев. `hydrate` синхронно нотифицирует подписчиков, поэтому в фазе рендера его
  // можно звать только на первом маунте (подписчиков нет); при навигации — из эффекта (commit-фаза),
  // иначе эмиссия попадёт в рендер чужого провайдера → «setState in render».
  const seedClient = (store: ReadySynapse | undefined, snapshot: TState | undefined): void => {
    if (!store || snapshot === undefined) return
    if (store.storage.initStatus.status !== StorageStatus.READY) return
    if (lastClientSnapshot === snapshot) return // уже засеяно этим снапшотом
    lastClientSnapshot = snapshot
    store.storage.hydrate(snapshot)
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

  // Снимает серверный снапшот состояния для пропа dehydratedState (классический SSR: renderToString).
  // `hydratedAt` — метка свежести для мердж-по-свежести в `hydrate` (по умолчанию — `Date.now()`).
  const dehydrate = (opts?: { initialState?: Partial<TState>; hydratedAt?: number }): Promise<TState> =>
    dehydrateModule(synapseModule, { state: opts?.initialState, hydratedAt: opts?.hydratedAt })

  /** Декоратор для обёртки компонентов в контекст Synapse. */
  function contextSynapse<SelfComponentProps>(Component: ComponentType<SelfComponentProps>) {
    const WrappedComponent = forwardRef<unknown, SelfComponentProps & { dehydratedState?: TState }>(function WrappedComponent(props, ref) {
      const { dehydratedState, ...restProps } = props as SelfComponentProps & { dehydratedState?: TState }

      // Серверный засев эмитит подписчикам; повторный засев того же стора этим же инстансом выстрелил бы
      // эмиссию во время рендера. Набор ПЕР-ИНСТАНСНЫЙ (не общий): на сервере каждый рендер обязан
      // пере-сеять свой throwaway-стор своим снапшотом (изоляция запросов), общий набор это бы пропустил.
      const seededRef = useRef<WeakSet<object> | null>(null)
      const seeded = (seededRef.current ??= new WeakSet<object>())

      // Синхронный засев throwaway-стора до первого рендера на сервере — одинаковый HTML. Идемпотентно.
      const seedServer = (store: ReadySynapse | undefined) => {
        if (store && dehydratedState !== undefined && store.storage.initStatus.status === StorageStatus.READY && !seeded.has(store)) {
          seeded.add(store)
          store.storage.hydrate(dehydratedState)
        }
      }

      const [store, setStore] = useState<ReadySynapse | undefined>(() => {
        // Сервер: свежий throwaway-стор на каждый рендер — изоляция запроса by construction (main не трогаем).
        if (typeof window === 'undefined') {
          const shell = synapseModule.buildSyncShell?.() ?? undefined
          seedServer(shell)
          return shell
        }
        // Клиент: общий main. Сеять в фазе рендера можно ТОЛЬКО на самом первом маунте — живых
        // подписчиков ещё нет, а первый кадр обязан совпасть с SSR-HTML. Дальше засев уезжает в эффект.
        const main = getClientStore()
        if (!clientRenderSeeded) {
          clientRenderSeeded = true
          seedClient(main, dehydratedState)
        }
        return main
      })

      const [error, setError] = useState<Error | null>(null)

      useEffect(() => {
        // Эффекты стартуют только на клиенте, на общем main; идентичность стора при этом НЕ меняется.
        let cancelled = false
        const active = store ?? getClientStore()
        if (!store) setStore(active) // редкий случай: main не был готов на первом кадре
        // Клиентский засев в commit-фазе: при навигации нотификация подписчиков идёт вне рендера
        // чужого провайдера (фикс «setState in render»). На первом маунте — no-op (тот же снапшот).
        seedClient(active, dehydratedState)
        synapseModule.ready().catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
        })
        return () => {
          cancelled = true
        }
      }, [])

      if (error) return <div>{`${ERROR_CONTEXT_INIT} ${error.message}`}</div>
      if (!store) return <>{loadingComponent}</>

      return (
        <SynapseContext.Provider value={store}>
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
    try {
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
