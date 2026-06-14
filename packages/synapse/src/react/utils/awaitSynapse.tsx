import { ComponentType, PropsWithChildren, ReactNode, useEffect, useState } from 'react'

import { type AwaitableSynapse, createSynapseAwaiter } from '../../utils'

interface ReactAwaitSynapseOptions {
  loadingComponent?: ReactNode
  errorComponent?: (error: Error) => ReactNode
}

/**
 * React-обертка для фреймворк-независимой утилиты ожидания Synapse.
 * Добавляет React-специфичные методы поверх createSynapseAwaiter. Принимает
 * `SynapseModule`-handle (PromiseLike), Promise готового synapse или сам synapse.
 */
export function awaitSynapse<TStore extends AwaitableSynapse>(synapseStorePromise: PromiseLike<TStore> | TStore, options?: ReactAwaitSynapseOptions) {
  const { loadingComponent = <div>Инициализация...</div>, errorComponent = (error: Error) => <div>Ошибка инициализации: {error.message}</div> } = options || {}

  const awaiter = createSynapseAwaiter<TStore>(synapseStorePromise)

  /**
   * Хук для получения текущего состояния готовности
   */
  function useSynapseReady() {
    const [status, setStatus] = useState<'pending' | 'ready' | 'error'>(() => awaiter.getStatus())
    const [store, setStore] = useState<TStore | undefined>(() => awaiter.getStoreIfReady())
    const [error, setError] = useState<Error | null>(() => awaiter.getError())

    useEffect(() => {
      // Проверяем текущее состояние при монтировании
      const currentStatus = awaiter.getStatus()
      const currentStore = awaiter.getStoreIfReady()
      const currentError = awaiter.getError()

      setStatus(currentStatus)
      setStore(currentStore)
      setError(currentError)

      // Подписываемся на изменения
      const unsubscribeReady = awaiter.onReady((readyStore) => {
        setStatus('ready')
        setStore(readyStore)
        setError(null)
      })

      const unsubscribeError = awaiter.onError((err) => {
        setStatus('error')
        setStore(undefined)
        setError(err)
      })

      return () => {
        unsubscribeReady()
        unsubscribeError()
      }
    }, [])

    return {
      isReady: status === 'ready',
      isError: status === 'error',
      isPending: status === 'pending',
      store,
      error,
    }
  }

  /**
   * Обертка, которая ждет готовности Synapse
   */
  function withSynapseReady<ComponentProps>(Component: ComponentType<ComponentProps>) {
    function WrappedComponent(props: ComponentProps) {
      const { isReady, isError, error } = useSynapseReady()

      // Показываем ошибку
      if (isError && error) return <>{errorComponent(error)}</>

      // Показываем загрузку
      if (!isReady) return <>{loadingComponent}</>

      // Рендерим компонент когда все готово
      return <Component {...(props as PropsWithChildren<ComponentProps>)} />
    }

    // Устанавливаем отображаемое имя для отладки
    const componentName = Component.displayName || Component.name || 'Component'
    WrappedComponent.displayName = `AwaitSynapse(${componentName})`

    return WrappedComponent
  }

  return {
    // React методы
    withSynapseReady,
    useSynapseReady,

    // Проксируем все методы из awaiter (обёртки сохраняют контекст при деструктуризации)
    waitForReady: () => awaiter.waitForReady(),
    isReady: () => awaiter.isReady(),
    getStoreIfReady: () => awaiter.getStoreIfReady(),
    onReady: (cb: Parameters<typeof awaiter.onReady>[0]) => awaiter.onReady(cb),
    onError: (cb: Parameters<typeof awaiter.onError>[0]) => awaiter.onError(cb),
    getStatus: () => awaiter.getStatus(),
    getError: () => awaiter.getError(),
    destroy: () => awaiter.destroy(),
  }
}
