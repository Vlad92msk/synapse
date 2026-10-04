import { from, OperatorFunction, pipe } from 'rxjs'
import { switchMap } from 'rxjs/operators'

/**
 * Метаданные ответа API, доступные в колбэках apiResult.
 */
export interface ApiResultMeta {
  status: number
  statusText: string
  headers: Headers
  fromCache?: boolean
}

/**
 * Ошибка API-запроса. Бросается apiResult при !result.ok.
 * Ловится errorAction в validateMap.
 */
export class ApiError extends Error {
  constructor(
    public readonly originalError: any,
    public readonly meta: ApiResultMeta,
  ) {
    super(typeof originalError === 'string' ? originalError : (originalError?.message ?? 'API request failed'))
    this.name = 'ApiError'
  }
}

/**
 * Оператор для обработки успешного результата API-запроса (QueryResult).
 *
 * При `result.ok` — вызывает callback с `data` и `meta`.
 * При `!result.ok` — бросает `ApiError`, который ловится `errorAction` в `validateMap`.
 *
 * @example
 * ```ts
 * // Простой случай
 * validateMap({
 *   errorAction: (err) => dispatcher.dispatch.loadError(String(err)),
 *   apiCall: () => from(api.request('getList', params)).pipe(
 *     apiResult((data) => dispatcher.dispatch.loadSuccess(data)),
 *   ),
 * })
 *
 * // С доступом к headers (пагинация)
 * apiResult((data, meta) => {
 *   const total = Number(meta.headers.get('X-Total-Count'))
 *   dispatcher.dispatch.loadSuccess({ items: data, total })
 * })
 * ```
 */
export function apiResult<TData, TResult = void>(
  onSuccess: (data: TData, meta: ApiResultMeta) => TResult | Promise<TResult>,
): OperatorFunction<{ ok: boolean; data?: TData; error?: any; status?: number; statusText?: string; headers?: Headers; fromCache?: boolean }, TResult> {
  return pipe(
    switchMap((result) => {
      const meta: ApiResultMeta = {
        status: result.status ?? 0,
        statusText: result.statusText ?? '',
        headers: result.headers ?? new Headers(),
        fromCache: result.fromCache,
      }
      if (result.ok && result.data !== undefined) {
        const out = onSuccess(result.data, meta)
        return from(Promise.resolve(out))
      }
      throw new ApiError(result.error ?? 'Unknown error', meta)
    }),
  )
}
