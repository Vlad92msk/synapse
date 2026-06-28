import { useCallback, useEffect, useRef, useState } from 'react'

import type { Endpoint, RequestResponseModify, RequestStatus } from '../../api/types/endpoint.interface'
import type { QueryOptions, QueryResult } from '../../api/types/query.interface'

interface InternalMutationState<TData> {
  status: RequestStatus
  data: TData | undefined
  error: Error | undefined
}

const IDLE_STATE: InternalMutationState<any> = { status: 'idle', data: undefined, error: undefined }

export interface UseApiMutationResult<TParams, TData> {
  /** Запустить мутацию (ошибки не пробрасываются — смотри `error`/`isError`) */
  mutate: (params: TParams) => void
  /** Запустить мутацию и дождаться результата (ошибки пробрасываются) */
  mutateAsync: (params: TParams) => Promise<QueryResult<TData, Error>>
  /** Данные успешного ответа */
  data: TData | undefined
  /** Ошибка мутации */
  error: Error | undefined
  /** Текущий статус */
  status: RequestStatus
  /** Мутация выполняется */
  isLoading: boolean
  /** Мутация завершилась ошибкой */
  isError: boolean
  /** Мутация завершилась успехом */
  isSuccess: boolean
  /** Сбросить состояние к idle */
  reset: () => void
}

/**
 * Хук для выполнения мутаций (POST/PUT/DELETE/PATCH) через эндпоинт ApiClient.
 *
 * В отличие от {@link useApiQuery}, запрос не стартует автоматически — его
 * запускает `mutate`/`mutateAsync`. Мутации не кэшируются (по REST-методу), а их
 * `invalidatesTags` инвалидируют кэш — активные `useApiQuery` соседних эндпоинтов
 * автоматически перезапросятся через шину инвалидации.
 *
 * @example
 * const { mutate, isLoading } = useApiMutation(endpoints.createUser)
 * mutate({ name: 'Alex' })
 */
export function useApiMutation<TParams extends Record<string, any>, TData>(endpoint: Endpoint<TParams, TData>, options: QueryOptions = {}): UseApiMutationResult<TParams, TData> {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [state, setState] = useState<InternalMutationState<TData>>(IDLE_STATE)

  const reqRef = useRef<RequestResponseModify<TData> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      reqRef.current?.abort()
    }
  }, [])

  const mutateAsync = useCallback(
    async (params: TParams): Promise<QueryResult<TData, Error>> => {
      setState({ status: 'loading', data: undefined, error: undefined })

      const req = endpoint.request(params, optionsRef.current)
      reqRef.current = req

      try {
        const res = await req.wait()
        // wait() реджектится на !ok, но подстрахуемся
        if (!res.ok) throw res.error ?? new Error('Mutation failed')
        if (mountedRef.current) setState({ status: 'success', data: res.data, error: undefined })
        return res
      } catch (err) {
        if (mountedRef.current) setState({ status: 'error', data: undefined, error: err as Error })
        throw err
      }
    },
    [endpoint],
  )

  const mutate = useCallback(
    (params: TParams) => {
      // Намеренно глотаем reject — состояние ошибки уже выставлено в mutateAsync
      mutateAsync(params).catch(() => {})
    },
    [mutateAsync],
  )

  const reset = useCallback(() => setState(IDLE_STATE), [])

  return {
    mutate,
    mutateAsync,
    data: state.data,
    error: state.error,
    status: state.status,
    isLoading: state.status === 'loading',
    isError: state.status === 'error',
    isSuccess: state.status === 'success',
    reset,
  }
}
