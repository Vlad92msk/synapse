// @vitest-environment node
//
// Сквозной путь ошибок/пустых ответов: fetchBaseQuery → Endpoint → fromRequest → apiResult.
// Используем НАСТОЯЩИЕ Response — важны пустые тела (204) и одноразовость потока.
import { lastValueFrom, of } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { apiResult } from '../../reactive/effects/operators/api-result'
import { fromRequest } from '../../reactive/effects/utils/fromRequest'
import { ApiClient } from '../api.module'
import { ApiError } from '../utils/api-error'

let uid = 0

function createApi(fetchFn: typeof fetch) {
  return new ApiClient({
    storage: () => new MemoryStorage({ name: `api_error_${uid++}` }),
    cache: { ttl: 60_000, cleanup: { enabled: false } },
    baseQuery: { baseUrl: 'http://test.local', fetchFn },
    endpoints: async (create) => ({
      leave: create<{ id: number }, void>({
        request: ({ id }) => ({ path: `/chats/${id}/leave`, method: 'POST' }),
      }),
      getItem: create<{ id: number }, { id: number }>({
        request: ({ id }) => ({ path: `/items/${id}`, method: 'GET' }),
        cache: { ttl: 60_000 },
      }),
    }),
  })
}

/** Прогоняет запрос через fromRequest + apiResult; возвращает либо результат колбэка, либо пойманную ошибку. */
async function runEffect<T>(req: Parameters<typeof fromRequest<T>>[0], onSuccess = vi.fn((data: T) => data)) {
  let caught: unknown
  const value = await lastValueFrom(
    fromRequest(req).pipe(
      apiResult(onSuccess),
      catchError((err) => {
        caught = err
        return of('error' as const)
      }),
    ),
  )
  return { value, caught, onSuccess }
}

describe('Endpoint + apiResult: успех без тела и ошибки', () => {
  let api: ReturnType<typeof createApi>
  let respond: () => Response

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api = createApi((async () => respond()) as unknown as typeof fetch)
    await api.init()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await api.destroy()
  })

  it('204 No Content → onSuccess(undefined), без ошибки', async () => {
    respond = () => new Response(null, { status: 204 })
    const { value, caught, onSuccess } = await runEffect(api.getEndpoints().leave.request({ id: 1 }))

    expect(caught).toBeUndefined()
    expect(onSuccess).toHaveBeenCalledWith(undefined, expect.objectContaining({ status: 204 }))
    expect(value).toBeUndefined()
  })

  it('404 с пустым телом → ApiError со статусом (а не throw undefined)', async () => {
    respond = () => new Response(null, { status: 404, statusText: 'Not Found' })
    const { caught, onSuccess } = await runEffect(api.getEndpoints().getItem.request({ id: 1 }))

    expect(onSuccess).not.toHaveBeenCalled()
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).meta.status).toBe(404)
    expect((caught as ApiError).originalError).toBeUndefined()
    expect((caught as ApiError).message).toBe('Request failed with status 404 Not Found')
  })

  it('500 с JSON-телом → ApiError: тело в originalError, message из тела', async () => {
    respond = () => new Response(JSON.stringify({ message: 'boom', code: 'X' }), { status: 500, headers: { 'content-type': 'application/json' } })
    const { caught } = await runEffect(api.getEndpoints().getItem.request({ id: 1 }))

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).meta.status).toBe(500)
    expect((caught as ApiError).originalError).toEqual({ message: 'boom', code: 'X' })
    expect((caught as ApiError).message).toBe('boom')
  })

  it('состояние запроса и подписчики эндпоинта получают тот же ApiError', async () => {
    respond = () => new Response(null, { status: 403 })
    const endpoint = api.getEndpoints().getItem
    const endpointErrors: unknown[] = []
    endpoint.subscribe((s) => s.status === 'error' && endpointErrors.push(s.error))

    const req = endpoint.request({ id: 1 })
    const states: unknown[] = []
    req.subscribe((s) => s.status === 'error' && states.push(s.error))
    const thrown = await req.wait().catch((e) => e)

    expect(thrown).toBeInstanceOf(ApiError)
    expect(endpointErrors).toEqual([thrown])
    expect(states[0]).toBe(thrown)
  })

  it('дедупликация: параллельный дубль при ошибке тоже reject с ApiError (а не resolve с ok: false)', async () => {
    respond = () => new Response(null, { status: 500 })
    const endpoint = api.getEndpoints().getItem
    const [a, b] = await Promise.allSettled([endpoint.request({ id: 7 }).wait(), endpoint.request({ id: 7 }).wait()])

    expect(a.status).toBe('rejected')
    expect(b.status).toBe('rejected')
    expect((b as PromiseRejectedResult).reason).toBeInstanceOf(ApiError)
    expect((b as PromiseRejectedResult).reason.meta).toMatchObject({ status: 500, fromCache: true })
  })

  it('сетевая ошибка → ApiError со status 0 и исходной ошибкой', async () => {
    respond = () => {
      throw new TypeError('Failed to fetch')
    }
    const { caught } = await runEffect(api.getEndpoints().getItem.request({ id: 2 }))

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).meta.status).toBe(0)
    expect((caught as ApiError).originalError).toBeInstanceOf(TypeError)
    expect((caught as ApiError).message).toBe('Failed to fetch')
  })
})

describe('apiResult на QueryResult напрямую', () => {
  const run = (result: any) => {
    const onSuccess = vi.fn((data: unknown) => data)
    let caught: unknown
    const done = lastValueFrom(
      of(result).pipe(
        apiResult(onSuccess),
        catchError((err) => {
          caught = err
          return of('error')
        }),
      ),
    )
    return done.then((value) => ({ value, caught, onSuccess }))
  }

  it('ok + data: undefined → onSuccess(undefined)', async () => {
    const { caught, onSuccess } = await run({ ok: true, data: undefined, status: 204 })
    expect(caught).toBeUndefined()
    expect(onSuccess).toHaveBeenCalledWith(undefined, expect.objectContaining({ status: 204 }))
  })

  it('ok + data: null → onSuccess(null)', async () => {
    const { onSuccess } = await run({ ok: true, data: null, status: 200 })
    expect(onSuccess).toHaveBeenCalledWith(null, expect.anything())
  })

  it('!ok → ApiError с meta.status; готовый ApiError не оборачивается повторно', async () => {
    const { caught } = await run({ ok: false, error: 'E', status: 422 })
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).meta.status).toBe(422)
    expect((caught as ApiError).message).toBe('E')

    const original = new ApiError(undefined, { status: 500, statusText: '', headers: new Headers() })
    const { caught: same } = await run({ ok: false, error: original })
    expect(same).toBe(original)
  })
})
