// @vitest-environment node
//
// Дизайн-решения API-слоя (вопросы к дизайну из аудита, 6.2.0):
// retry только для идемпотентных методов по умолчанию, ошибка prepareHeaders валит запрос,
// ключ кэша учитывает path/responseFormat, reset() трогает только свой эндпоинт,
// бинарные ответы не кэшируются, invalidateOnError работает на принудительном рефетче.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { ApiClient } from '../api.module'
import { ResponseFormat } from '../types/api.interface'
import { ApiError } from '../utils/api-error'

let uid = 0

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

function createApi(fetchFn: typeof fetch, extra: Record<string, any> = {}) {
  return new ApiClient({
    storage: () => new MemoryStorage({ name: `api_design_${uid++}` }),
    cache: { ttl: 60_000, cleanup: { enabled: false } },
    baseQuery: { baseUrl: 'http://test.local', fetchFn, ...extra.baseQuery },
    retry: { count: 2, delay: 0 },
    endpoints: async (create) => ({
      getItem: create<{ id: number }, { id: number }>({
        request: ({ id }, ctx?: { scope?: string }) => ({ path: `/${ctx?.scope ?? 'items'}/${id}`, method: 'GET' }),
        tags: ['Item'],
        cache: { ttl: 60_000 },
      }),
      getOther: create<{ id: number }, { id: number }>({
        request: ({ id }) => ({ path: `/other/${id}`, method: 'GET' }),
        tags: ['Item'],
        cache: { ttl: 60_000 },
      }),
      getFile: create<{ id: number }, Blob>({
        request: ({ id }) => ({ path: `/file/${id}`, method: 'GET', responseFormat: ResponseFormat.Blob }),
        cache: { ttl: 60_000 },
      }),
      create: create<{ name: string }, { id: number }>({
        request: (body) => ({ path: '/items', method: 'POST', body }),
      }),
      createRetried: create<{ name: string }, { id: number }>({
        request: (body) => ({ path: '/items', method: 'POST', body }),
        retry: { count: 2, delay: 0 },
      }),
    }),
  })
}

describe('API: дизайн-решения', () => {
  let api: ReturnType<typeof createApi>

  afterEach(async () => {
    vi.restoreAllMocks()
    await api?.destroy()
  })

  it('глобальный retry не повторяет POST (неидемпотентный); GET — повторяет', async () => {
    const fetchFn = vi.fn(async () => json({ message: 'down' }, 503))
    api = createApi(fetchFn as unknown as typeof fetch)
    await api.init()

    await expect(api.request('create', { name: 'x' })).rejects.toBeInstanceOf(ApiError)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    fetchFn.mockClear()
    await expect(api.request('getItem', { id: 1 }, { disableCache: true })).rejects.toBeInstanceOf(ApiError)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('явный retry на эндпоинте действует и для POST (осознанный opt-in)', async () => {
    const fetchFn = vi.fn(async () => json({ message: 'down' }, 503))
    api = createApi(fetchFn as unknown as typeof fetch)
    await api.init()

    await expect(api.request('createRetried', { name: 'x' })).rejects.toBeInstanceOf(ApiError)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('ошибка в prepareHeaders валит запрос ApiError (status 0) и fetch не вызывается', async () => {
    const fetchFn = vi.fn(async () => json({ id: 1 }))
    api = new ApiClient({
      storage: () => new MemoryStorage({ name: `api_design_${uid++}` }),
      cache: false,
      baseQuery: {
        baseUrl: 'http://test.local',
        fetchFn: fetchFn as unknown as typeof fetch,
        prepareHeaders: async () => {
          throw new Error('token refresh failed')
        },
      },
      endpoints: async (create) => ({
        me: create<Record<string, never>, { id: number }>({ request: () => ({ path: '/me', method: 'GET' }) }),
      }),
    }) as any
    await api.init()

    const err = await (api as any).request('me', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.meta.status).toBe(0)
    expect(err.message).toBe('token refresh failed')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('ключ кэша учитывает итоговый path: разный context при тех же params — разные записи', async () => {
    const fetchFn = vi.fn(async (url: string) => json({ id: url.includes('/archive/') ? 2 : 1 }))
    api = createApi(fetchFn as unknown as typeof fetch)
    await api.init()
    const ep = api.getEndpoints().getItem

    const a = await ep.request({ id: 1 }).wait()
    const b = await ep.request({ id: 1 }, { context: { scope: 'archive' } }).wait()

    expect(a.data).toEqual({ id: 1 })
    expect(b.data).toEqual({ id: 2 })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('reset() эндпоинта не сбрасывает кэш другого эндпоинта с тем же тегом', async () => {
    const fetchFn = vi.fn(async (url: string) => json({ id: url.includes('/other/') ? 9 : 1 }))
    api = createApi(fetchFn as unknown as typeof fetch)
    await api.init()
    const { getItem, getOther } = api.getEndpoints()

    await getItem.request({ id: 1 }).wait()
    await getOther.request({ id: 1 }).wait()
    await getItem.reset()

    expect((await getOther.request({ id: 1 }).wait()).fromCache).toBe(true)
    expect((await getItem.request({ id: 1 }).wait()).fromCache).toBe(false)
  })

  it('бинарный ответ (Blob) не кэшируется — повторный запрос идёт в сеть', async () => {
    const fetchFn = vi.fn(async () => new Response(new Blob(['abc']), { status: 200, headers: { 'content-type': 'application/octet-stream' } }))
    api = createApi(fetchFn as unknown as typeof fetch)
    await api.init()
    const ep = api.getEndpoints().getFile

    const first = await ep.request({ id: 1 }).wait()
    const second = await ep.request({ id: 1 }).wait()

    expect(first.data).toBeInstanceOf(Blob)
    expect(second.fromCache).toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('invalidateOnError: упавший принудительный рефетч (disableCache) выбрасывает устаревшую запись', async () => {
    let fail = false
    const fetchFn = vi.fn(async () => (fail ? json({ message: 'boom' }, 500) : json({ id: 1 })))
    api = createApi(fetchFn as unknown as typeof fetch)
    await api.init()
    const ep = api.getEndpoints().getOther

    await ep.request({ id: 1 }).wait()
    expect((await ep.request({ id: 1 }).wait()).fromCache).toBe(true)

    fail = true
    await expect(ep.request({ id: 1 }, { disableCache: true }).wait()).rejects.toBeInstanceOf(ApiError)

    fail = false
    expect((await ep.request({ id: 1 }).wait()).fromCache).toBe(false)
  })
})
