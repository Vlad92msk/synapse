/**
 * Метаданные ответа API: доступны в колбэках `apiResult` и в `ApiError.meta`.
 */
export interface ApiResultMeta {
  status: number
  statusText: string
  headers: Headers
  fromCache?: boolean
}

function getApiErrorMessage(originalError: any, meta: ApiResultMeta): string {
  if (typeof originalError === 'string' && originalError) return originalError
  if (typeof originalError?.message === 'string' && originalError.message) return originalError.message
  if (meta.status) return `Request failed with status ${meta.status}${meta.statusText ? ` ${meta.statusText}` : ''}`
  return meta.statusText || 'API request failed'
}

/**
 * Ошибка API-запроса — единый тип для всех неуспешных ответов (`!ok`): HTTP 4xx/5xx,
 * сетевая ошибка и таймаут (`meta.status === 0`), обрыв соединения во время чтения тела.
 *
 * - `originalError` — то, что вернул сервер (распарсенный JSON / текст / `undefined` для пустого тела)
 *   или исходная JS-ошибка (сеть / таймаут);
 * - `meta` — статус, statusText и заголовки ответа.
 *
 * Отмена запроса (`AbortError`) — не `ApiError`: это штатная ситуация, она пробрасывается как есть.
 */
export class ApiError extends Error {
  constructor(
    public readonly originalError: any,
    public readonly meta: ApiResultMeta,
  ) {
    super(getApiErrorMessage(originalError, meta))
    this.name = 'ApiError'
  }
}

/**
 * Превращает неуспешный результат запроса в `ApiError` (уже готовый `ApiError` возвращается как есть).
 * @internal
 */
export function toApiError(result: { error?: any; status?: number; statusText?: string; headers?: Headers; fromCache?: boolean }): ApiError {
  if (result.error instanceof ApiError) return result.error
  return new ApiError(result.error, {
    status: result.status ?? 0,
    statusText: result.statusText ?? '',
    headers: result.headers ?? new Headers(),
    fromCache: result.fromCache,
  })
}
