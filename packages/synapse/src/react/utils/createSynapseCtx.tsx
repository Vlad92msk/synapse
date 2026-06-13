import { ComponentType, createContext, forwardRef, PropsWithChildren, useContext, useEffect, useState } from 'react'
import { Observable } from 'rxjs'

import { handleCleanupError } from '../../_utils/error-handling.util'
import { IStorage } from '../../core'
import { AnySynapseStore, createSynapseAwaiter, SynapseModule, SynapseStoreBasic, SynapseStoreWithDispatcher, SynapseStoreWithEffects } from '../../utils'

const ERROR_HOOK_MESSAGE = 'Хук необходимо использовать внутри компонента contextSynapse'
const ERROR_CONTEXT_INIT = 'Ошибка при инициализации контекста:'

interface SimplifiedOptions {
  loadingComponent?: React.ReactNode
}

/**
 * Runtime-детектор class-based handle (`SynapseModule`): у него есть собственный
 * ленивый жизненный цикл (`ready`/`destroy`/`isReady`), поэтому очистка делегируется
 * ему, а не самому synapse — это сбрасывает мемоизацию и даёт пересоздаваемость.
 */
function isSynapseModule(value: unknown): value is SynapseModule<any, any, any> {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as SynapseModule<any, any, any>).ready === 'function' &&
    typeof (value as SynapseModule<any, any, any>).isReady === 'function' &&
    typeof (value as SynapseModule<any, any, any>).destroy === 'function' &&
    typeof (value as SynapseModule<any, any, any>).then === 'function'
  )
}

/**
 * Перегрузки для createSynapseCtx в зависимости от типа хранилища
 */

// Class-based handle (этап 5): ленивый запуск фабрики при первом монтировании Provider'а.
export function createSynapseCtx<TState extends Record<string, any>, TDispatcher, TSelectors>(
  synapseModule: SynapseModule<TState, TDispatcher, TSelectors>,
  options?: SimplifiedOptions,
): {
  contextSynapse: <SelfComponentProps>(Component: ComponentType<SelfComponentProps>) => ComponentType<SelfComponentProps>
  useSynapseStorage: () => IStorage<TState>
  useSynapseSelectors: () => TSelectors
  useSynapseActions: () => TDispatcher
  useSynapseState$: () => Observable<TState>
  cleanupSynapse: () => Promise<void>
}

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
  synapseStorePromise:
    | Promise<AnySynapseStore<TStore, TStorage, TSelectors, TActions>>
    | AnySynapseStore<TStore, TStorage, TSelectors, TActions>
    | SynapseModule<TStore, TActions, TSelectors>,
  options?: SimplifiedOptions,
) {
  const { loadingComponent = <div>Инициализация контекста...</div> } = options || {}

  // Lazy-инициализация: awaiter создаётся при первом обращении и сбрасывается при cleanup.
  // Сам awaiter (createSynapseAwaiter) инкапсулирует ожидание готовности, статус и подписки.
  let awaiter: ReturnType<typeof createSynapseAwaiter<TStore, TStorage, TSelectors, TActions>> | null = null

  // SynapseModule — PromiseLike: createSynapseAwaiter дожидается его через Promise.resolve,
  // что лениво дёргает фабрику (handle.ready()) при создании awaiter, т.е. при первом mount.
  const source = synapseStorePromise as Promise<AnySynapseStore<TStore, TStorage, TSelectors, TActions>> | AnySynapseStore<TStore, TStorage, TSelectors, TActions>

  const getAwaiter = () => {
    if (!awaiter) awaiter = createSynapseAwaiter(source)
    return awaiter
  }

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
    const WrappedComponent = forwardRef<unknown, SelfComponentProps>(function WrappedComponent(props, ref) {
      const [synapseStore, setSynapseStore] = useState<AnySynapseStore<TStore, TStorage, TSelectors, TActions> | undefined>(() => getAwaiter().getStoreIfReady())
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
    // Class-based handle владеет жизненным циклом synapse (LIFO-teardown + сброс мемоизации):
    // делегируем очистку ему, чтобы следующий mount заново исполнил фабрику.
    if (isSynapseModule(synapseStorePromise)) {
      const instance = awaiter
      awaiter = null
      instance?.destroy()
      await synapseStorePromise.destroy()
      return
    }

    if (!awaiter) return

    const instance = awaiter
    awaiter = null // сбрасываем сразу, чтобы следующий маунт создал новый awaiter

    try {
      const store = instance.getStoreIfReady() ?? (await instance.waitForReady())
      instance.destroy()
      await store?.destroy()
    } catch (error) {
      instance.destroy()
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
