import { ComponentType, createContext, forwardRef, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react'
import { Observable } from 'rxjs'

import { handleCleanupError, logError } from '../../_utils/error-handling.util'
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

  // Dev-guard: `ssr: true`, но у модуля нет ssrShell → на сервере провайдер молча срежет children
  // гейтом loadingComponent. Предупреждаем один раз (иначе симптом «пустой body» далеко от причины).
  let ssrWithoutShellWarned = false

  // Оболочку построить не удалось (напр. объектная форма с async-storage: buildSyncShell бросает —
  // у IndexedDB синхронного SSR нет). Ставим флаг, чтобы не пытаться снова и не рушить рендер.
  let shellBuildFailed = false

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

      // При наличии dehydratedState — per-tree awaiter (свой на дерево), иначе общий клиентский
      // (обратная совместимость). ВАЖНО: per-tree awaiter изолирует сам awaiter-объект, но НЕ
      // состояние — он читает общий main через getSnapshot(). Реальная изоляция данных под запрос
      // на сервере обеспечивается СВЕЖЕЙ засеянной оболочкой (см. серверную ветку ниже, модуль с
      // ssrShell); у легаси-модулей без оболочки — синхронным seed+read (безопасно только вне
      // стриминга, см. SSR-HYDRATION-KONSPEKT §5.5).
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

      // ssr включён, стор синхронно НЕ готов и оболочки нет → children будут срезаны гейтом. Это и
      // есть «забыл ssrShell» (в отличие от валидного ssr:true + dehydratedState, где стор уже готов).
      // Предупреждаем один раз — симптом «пустой body» далеко от причины.
      const warnSsrWithoutShell = () => {
        if (process.env.NODE_ENV === 'production' || !ssr || canBuildShell || ssrWithoutShellWarned) return
        ssrWithoutShellWarned = true
        logError(
          'createSynapseCtx: { ssr: true } задан, но стор не готов синхронно и у модуля нет ssrShell — ' +
            'провайдер отрендерит loadingComponent: у фонового стора это срежет children на сервере, ' +
            'а у стора с dehydratedState первый клиентский кадр разойдётся с серверным HTML (hydration mismatch). ' +
            'Добавь ssrShell в createSynapse (или используй объектную форму createSynapse({ storage, dispatcher, selectors, wire }) — она выводит оболочку сама).',
          null,
          null,
          'warn',
        )
      }
      const buildShellIfNeeded = (): ReadySynapse | undefined => {
        if (!canBuildShell || shellBuildFailed) return undefined
        // Идемпотентно: guard от повторной сборки (в т.ч. двойной вызов инициализатора useState в StrictMode).
        if (!shellStoreRef.current) {
          try {
            shellStoreRef.current = synapseModule.buildSyncShell?.() ?? null
          } catch (err) {
            // buildSyncShell бросил (объектная форма с async-storage: у IndexedDB синхронного SSR
            // нет). НЕ рушим рендер — откатываемся к гейту loadingComponent + варнинг один раз.
            shellBuildFailed = true
            if (process.env.NODE_ENV !== 'production') {
              logError(
                'createSynapseCtx: не удалось синхронно построить SSR-оболочку (storage бросил на initializeSync — напр. ' +
                  'async-хранилище вроде IndexedDB, у которого синхронного SSR нет, либо LocalStorage без доступного ' +
                  'localStorage на сервере). Откат к loadingComponent; полный стор достроится на клиенте. ' +
                  'Если это ожидаемо — убери { ssr: true } у этого провайдера.',
                err,
                null,
                'warn',
              )
            }
            return undefined
          }
        }
        return shellStoreRef.current ?? undefined
      }

      const [synapseStore, setSynapseStore] = useState<ReadySynapse | undefined>(() => {
        // СЕРВЕР + модуль с оболочкой: рендерим СВЕЖУЮ засеянную оболочку — и для фонового стора,
        // и для стора с dehydratedState. Изоляция под запрос by construction: свой стор на каждый
        // рендер, БЕЗ мутации общего main-синглтона. Это важно для стриминга (Next App Router по
        // умолчанию стримит) — там нет гарантии «синхронный рендер без await между засевом и
        // чтением», на которой держалась безопасность засева общего main. clientAwaiter/main на
        // сервере не трогаем → async-фабрика/эффекты/IndexedDB туда не едут. Оболочку не собрать
        // (async storage) → гейт loadingComponent (клиент достроит реальный стор в useEffect).
        if (canBuildShell && typeof window === 'undefined') {
          const shell = buildShellIfNeeded()
          if (shell) {
            seedHydration(shell) // засев dehydratedState; no-op для фонового стора без снапшота
            return shell
          }
          return undefined
        }

        const store = resolveAwaiter().getStoreIfReady()
        if (store) {
          seedHydration(store)
          return store
        }
        // Стор не готов синхронно (async-стор / клиентский старт). При ssr+ssrShell отдаём
        // оболочку, чтобы первый кадр (сервер и гидрация) рендерил children.
        const shell = buildShellIfNeeded()
        if (shell) {
          // Композиция ssrShell + dehydratedState: засеваем оболочку снапшотом, чтобы первый
          // клиентский кадр стора С серверными данными рендерил тот же контент, что и сервер
          // (нет hydration mismatch). Для фоновых сторов без снапшота seedHydration — no-op
          // (оболочка остаётся пустой). Оболочка — sync-стор (READY) → hydrate применим сразу.
          seedHydration(shell)
        } else {
          warnSsrWithoutShell() // ssr:true, но оболочки нет → гейт срежет children / mismatch на клиенте
        }
        return shell
      })
      const [error, setError] = useState<Error | null>(() => {
        // Тот же серверный guard: для модуля с оболочкой на сервере clientAwaiter не поднимаем.
        if (canBuildShell && typeof window === 'undefined') return null
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
