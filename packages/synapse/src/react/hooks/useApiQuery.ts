import { useCallback, useEffect, useRef, useState } from 'react'

import type { Endpoint, RequestStatus } from '../../api/types/endpoint.interface'
import type { QueryOptions } from '../../api/types/query.interface'

/**
 * Стабильная сериализация параметров для ключа зависимостей эффекта.
 * Сортирует ключи объектов рекурсивно, поэтому `{ a: 1, b: 2 }` и `{ b: 2, a: 1 }`
 * дают одинаковую строку — новый объект-литерал на каждый рендер не вызывает
 * бесконечный ре-запрос.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

interface InternalQueryState<TData> {
  status: RequestStatus
  data: TData | undefined
  error: Error | undefined
  fromCache: boolean
}

const IDLE_STATE: InternalQueryState<any> = { status: 'idle', data: undefined, error: undefined, fromCache: false }

/** Синхронно читает кэш эндпоинта (если доступно) и приводит к состоянию запроса. */
function readSyncCache<TParams extends Record<string, any>, TData>(endpoint: Endpoint<TParams, TData>, params: TParams): InternalQueryState<TData> | undefined {
  const cached = endpoint.getCachedSync(params)
  if (cached?.ok) {
    return { status: 'success', data: cached.data, error: undefined, fromCache: true }
  }
  return undefined
}

export interface UseApiQueryOptions extends QueryOptions {
  /** Если `false` — запрос не выполняется (lazy). По умолчанию `true`. */
  enabled?: boolean
  /**
   * Авто-рефетч активного запроса при инвалидации кэша по тегам эндпоинта
   * (после мутаций соседних эндпоинтов с `invalidatesTags`). По умолчанию `true`.
   */
  refetchOnInvalidate?: boolean
}

export interface UseApiQueryResult<TData> {
  /** Данные ответа (или из кэша) */
  data: TData | undefined
  /** Ошибка запроса */
  error: Error | undefined
  /** Текущий статус запроса */
  status: RequestStatus
  /** Идёт загрузка */
  isLoading: boolean
  /** Запрос завершился ошибкой */
  isError: boolean
  /** Запрос завершился успехом */
  isSuccess: boolean
  /** Данные пришли из кэша (а не из сети) */
  fromCache: boolean
  /** Принудительно перезапросить (минуя кэш-«свежесть» через новый request) */
  refetch: () => void
}

/**
 * Хук для выполнения GET-запросов через эндпоинт ApiClient в стиле React Query.
 *
 * Тонкая обёртка над `endpoint.request(params).subscribe(...)`: дедупликация,
 * кэш по тегам, отмена и retry уже реализованы в самом эндпоинте. Хук добавляет
 * React-слой: подписку, стабильный ключ параметров, `enabled`/`refetch`,
 * SSR-fast-path (синхронное чтение кэша на первом рендере без вспышки loading)
 * и авто-рефетч при инвалидации кэша.
 *
 * @example
 * const { data, isLoading, error, refetch } = useApiQuery(endpoints.getUser, { id })
 */
export function useApiQuery<TParams extends Record<string, any>, TData>(endpoint: Endpoint<TParams, TData>, params: TParams, options: UseApiQueryOptions = {}): UseApiQueryResult<TData> {
  const { enabled = true, refetchOnInvalidate = true, ...queryOptions } = options

  const paramsKey = stableStringify(params)

  // refs — чтобы effect зависел только от стабильного ключа, а не от идентичности объектов
  const paramsRef = useRef(params)
  paramsRef.current = params
  const optionsRef = useRef(queryOptions)
  optionsRef.current = queryOptions

  // Ленивый инициализатор важен для SSR: на сервере effect не выполняется, поэтому
  // первый (и единственный) рендер должен сразу отдать засеянные/кэшированные данные.
  const [state, setState] = useState<InternalQueryState<TData>>(() => (enabled ? (readSyncCache(endpoint, params) ?? IDLE_STATE) : IDLE_STATE))

  const [refetchToken, setRefetchToken] = useState(0)
  const refetch = useCallback(() => setRefetchToken((t) => t + 1), [])

  useEffect(() => {
    if (!enabled) {
      setState(IDLE_STATE)
      return
    }

    // На смену параметров: показываем кэш сразу (без вспышки) либо loading.
    setState(readSyncCache(endpoint, paramsRef.current) ?? { status: 'loading', data: undefined, error: undefined, fromCache: false })

    let cancelled = false
    const req = endpoint.request(paramsRef.current, optionsRef.current)
    const unsubscribe = req.subscribe(
      (s) => {
        // 'idle' — начальный эхо-снапшот подписки; игнорируем, чтобы не сбрасывать
        // уже показанные данные. Реальные переходы — loading/success/error.
        if (cancelled || s.status === 'idle') return
        setState({ status: s.status, data: s.data, error: s.error, fromCache: s.fromCache })
      },
      { autoUnsubscribe: false },
    )

    return () => {
      cancelled = true
      req.abort()
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, paramsKey, enabled, refetchToken])

  // Авто-рефетч при инвалидации кэша по тегам этого эндпоинта (например, после мутации)
  useEffect(() => {
    if (!enabled || !refetchOnInvalidate) return undefined
    return endpoint.onCacheInvalidate(() => setRefetchToken((t) => t + 1))
  }, [endpoint, enabled, refetchOnInvalidate])

  return {
    data: state.data,
    error: state.error,
    status: state.status,
    isLoading: state.status === 'loading',
    isError: state.status === 'error',
    isSuccess: state.status === 'success',
    fromCache: state.fromCache,
    refetch,
  }
}
