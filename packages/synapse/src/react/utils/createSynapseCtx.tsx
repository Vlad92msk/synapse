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
   * Включает синхронный серверный рендер `children` для «фоновых» провайдеров без
   * серверных данных (presence/relations/media-player).
   *
   * При `ssr: true` и НЕ готовом синхронно сторе Provider строит **SSR-оболочку** из
   * `initialState` (см. `createSynapse(module, { ssrShell })`) и рендерит `children` сразу —
   * так поддерево попадает в серверный HTML и совпадает с первым кадром гидрации. Полный
   * стор (с зависимостями и эффектами) достраивается на клиенте, после чего контекст
   * бесшовно переключается на него.
   *
   * Требует, чтобы у модуля была задана `ssrShell`-фабрика. Без неё флаг — no-op (гейт
   * `loadingComponent`, прежнее поведение). Для синхронно-готового стора (posts после
   * `dehydrate`, клиентская гидрация) флаг не нужен — children рендерятся и так.
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

  // clientAwaiter — общий на всё приложение доступ к стору на клиенте. Стор строится один раз
  // (лениво, при первом mount), и все компоненты работают с ним через этот awaiter.
  // На сервере так нельзя: один стор на всех → данные одного запроса утекут в другой (request
  // bleed). Поэтому там стор берётся отдельный на каждый рендер — не отсюда, а из resolveAwaiter.
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

  // Фича для КЛАССИЧЕСКОГО SSR (Vite/Remix/Express + renderToString)
  // В Next App Router (RSC) не применяем - там ручной вызов dehydrateModule(module, { ssr })
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

      // SSR-оболочка: синхронный «пустой» стор из initialState, построенный БЕЗ async-фабрики,
      // зависимостей и эффектов (см. synapseModule.buildSyncShell / createSynapse ssrShell).
      // Строится один раз на инстанс провайдера, живёт до появления реального стора.
      const shellStoreRef = useRef<ReadySynapse | null>(null)
      const canBuildShell = ssr && typeof synapseModule.buildSyncShell === 'function'
      const buildShellIfNeeded = (): ReadySynapse | undefined => {
        if (!canBuildShell) return undefined
        // Идемпотентно: guard от повторной сборки (в т.ч. двойной вызов инициализатора useState в StrictMode).
        if (!shellStoreRef.current) shellStoreRef.current = synapseModule.buildSyncShell() ?? null
        return shellStoreRef.current ?? undefined
      }

      const [synapseStore, setSynapseStore] = useState<ReadySynapse | undefined>(() => {
        // Сервер + ssr-оболочка (без dehydratedState): НЕ трогаем общий clientAwaiter — иначе
        // async-фабрика/эффекты поедут на сервер, а module-синглтон рискует cross-request bleed.
        // Сразу отдаём синхронную оболочку → children попадают в HTML.
        if (canBuildShell && dehydratedState === undefined && typeof window === 'undefined') {
          const shell = buildShellIfNeeded()
          if (shell) return shell
        }

        const store = resolveAwaiter().getStoreIfReady()
        if (store) {
          seedHydration(store)
          return store
        }
        // Стор не готов синхронно (async-стор / клиентский старт). При ssr+ssrShell отдаём
        // оболочку, чтобы первый кадр (сервер и гидрация) рендерил children с initialState.
        return buildShellIfNeeded()
      })
      const [error, setError] = useState<Error | null>(() => {
        // Тот же серверный guard: не поднимаем clientAwaiter на сервере ради оболочки.
        if (canBuildShell && dehydratedState === undefined && typeof window === 'undefined') return null
        return resolveAwaiter().getError()
      })

      useEffect(() => {
        // На сервере эффект не исполняется — подписки/догрузка стартуют только на клиенте.
        const instance = resolveAwaiter()

        // Переключение с SSR-оболочки на реальный стор. Оболочку уничтожаем ТОЛЬКО здесь
        // (при свапе), а не в cleanup: иначе двойной прогон эффекта в StrictMode разрушил бы
        // ещё отрендеренную оболочку. На реальном размонтировании оболочка осиротеет и будет
        // собрана GC (в ней нет внешних подписок — это чистый Memory-стор без эффектов).
        const adoptRealStore = (store: ReadySynapse) => {
          seedHydration(store)
          setSynapseStore(store)
          setError(null)
          const shell = shellStoreRef.current
          if (shell && shell !== store) {
            shellStoreRef.current = null
            void shell.destroy()
          }
        }

        const current = instance.getStoreIfReady()
        if (current) {
          // Реальный стор уже готов синхронно — свапаемся сразу (без мигания оболочки).
          adoptRealStore(current)
        } else {
          setError(instance.getError())
          // Оболочка (если есть) уже показана из useState — держим её до onReady.
        }

        const unsubscribeReady = instance.onReady(adoptRealStore)
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

      // Гейт рендера. synapseStore есть, когда: стор готов синхронно (сервер после dehydrate /
      // клиентская гидрация), ЛИБО построена SSR-оболочка (ssr + ssrShell). Иначе — прежний
      // гейт загрузки (async-сторы без ssrShell, обычный клиентский старт).
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
