import { from, OperatorFunction, pipe } from 'rxjs'
import { switchMap } from 'rxjs/operators'

import { ApiError, ApiResultMeta, toApiError } from '../../../api/utils/api-error'

export { ApiError, type ApiResultMeta }

/**
 * Оператор для обработки успешного результата API-запроса (QueryResult).
 *
 * При `result.ok` — вызывает callback с `data` и `meta`. Успешный ответ без тела
 * (204 / пустой 200) — тоже успех: `data` придёт `undefined`.
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
      if (!result.ok) throw toApiError(result)

      const meta: ApiResultMeta = {
        status: result.status ?? 0,
        statusText: result.statusText ?? '',
        headers: result.headers ?? new Headers(),
        fromCache: result.fromCache,
      }
      // data может быть undefined (204 / пустое тело) — это не ошибка запроса
      const out = onSuccess(result.data as TData, meta)
      return from(Promise.resolve(out))
    }),
  )
}
