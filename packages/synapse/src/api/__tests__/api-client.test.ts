// @vitest-environment node
//
// Тесты ApiClient: SSR-дегидрация/гидрация, синхронный fast-path чтения кэша,
// шина инвалидации кэша (авто-рефетч). Сеть мокается через baseQuery.fetchFn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { ApiClient } from '../api.module'

interface ListResult {
  items: string[]
}

/** Минимальный Response-подобный объект (json/text/headers/ok/status). */
function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response
}

let uid = 0

function createApi(fetchFn: typeof fetch) {
  return new ApiClient({
    storage: () => new MemoryStorage({ name: `api_cache_${uid++}` }),
    cache: { ttl: 60_000, cleanup: { enabled: false } },
    baseQuery: { baseUrl: 'http://test.local', fetchFn },
    endpoints: async (create) => ({
      getList: create<{ q?: string }, ListResult>({
        request: (params) => ({ path: '/list', method: 'GET', query: params }),
        tags: ['List'],
        cache: { ttl: 60_000 },
      }),
      getOther: create<{ id?: number }, ListResult>({
        request: (params) => ({ path: '/other', method: 'GET', query: params }),
        tags: ['Other'],
        cache: { ttl: 60_000 },
      }),
      createItem: create<{ name: string }, { ok: boolean }>({
        request: (params) => ({ path: '/item', method: 'POST', body: params }),
        invalidatesTags: ['List'],
      }),
    }),
  })
}

describe('ApiClient — кэш и дедупликация', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let api: ReturnType<typeof createApi>

  beforeEach(async () => {
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/list')) return jsonResponse({ items: ['a', 'b'] })
      return jsonResponse({ ok: true })
    })
    api = createApi(fetchMock as unknown as typeof fetch)
    await api.init()
  })

  afterEach(async () => {
    await api.destroy()
  })

  it('повторный GET с теми же параметрами берётся из кэша (fetch один раз)', async () => {
    const first = await api.request('getList', { q: 'x' })
    const second = await api.request('getList', { q: 'x' })

    expect(first.data).toEqual({ items: ['a', 'b'] })
    expect(second.fromCache).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('разные параметры — разные ключи кэша (fetch на каждый)', async () => {
    await api.request('getList', { q: 'x' })
    await api.request('getList', { q: 'y' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('ApiClient — getCachedSync (синхронный fast-path)', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let api: ReturnType<typeof createApi>

  beforeEach(async () => {
    fetchMock = vi.fn(async () => jsonResponse({ items: ['a', 'b'] }))
    api = createApi(fetchMock as unknown as typeof fetch)
    await api.init()
  })

  afterEach(async () => {
    await api.destroy()
  })

  it('до запроса возвращает undefined, после — данные синхронно', async () => {
    const endpoint = api.getEndpoints().getList

    expect(endpoint.getCachedSync({ q: 'x' })).toBeUndefined()

    await api.request('getList', { q: 'x' })

    const cached = endpoint.getCachedSync({ q: 'x' })
    expect(cached?.ok).toBe(true)
    expect(cached?.fromCache).toBe(true)
    expect(cached?.data).toEqual({ items: ['a', 'b'] })
    // Чтение не дёргает сеть
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('для мутации (POST) кэш не пишется → getCachedSync undefined', async () => {
    await api.request('createItem', { name: 'n' })
    expect(api.getEndpoints().createItem.getCachedSync({ name: 'n' })).toBeUndefined()
  })
})

describe('ApiClient — dehydrate / hydrate (SSR)', () => {
  it('снапшот кэша с сервера попадает в кэш на клиенте без повторного fetch', async () => {
    // --- server ---
    const serverFetch = vi.fn(async () => jsonResponse({ items: ['srv'] }))
    const serverApi = createApi(serverFetch as unknown as typeof fetch)
    await serverApi.init()
    await serverApi.request('getList', { q: 'x' })
    const snapshot = await serverApi.dehydrate()
    await serverApi.destroy()

    expect(serverFetch).toHaveBeenCalledTimes(1)
    expect(Object.keys(snapshot).length).toBeGreaterThan(0)

    // --- client ---
    const clientFetch = vi.fn(async () => jsonResponse({ items: ['client'] }))
    const clientApi = createApi(clientFetch as unknown as typeof fetch)
    await clientApi.init()
    await clientApi.hydrate(snapshot)

    // getCachedSync сразу отдаёт серверные данные
    const cached = clientApi.getEndpoints().getList.getCachedSync({ q: 'x' })
    expect(cached?.data).toEqual({ items: ['srv'] })

    // request попадает в кэш — сеть не дёргается
    const res = await clientApi.request('getList', { q: 'x' })
    expect(res.fromCache).toBe(true)
    expect(res.data).toEqual({ items: ['srv'] })
    expect(clientFetch).not.toHaveBeenCalled()

    await clientApi.destroy()
  })

  it('hydrate до init засевает кэш (init не перезатирает)', async () => {
    // Соберём снапшот
    const serverFetch = vi.fn(async () => jsonResponse({ items: ['seed'] }))
    const serverApi = createApi(serverFetch as unknown as typeof fetch)
    await serverApi.init()
    await serverApi.request('getList', { q: 'x' })
    const snapshot = await serverApi.dehydrate()
    await serverApi.destroy()

    const clientFetch = vi.fn(async () => jsonResponse({ items: ['network'] }))
    const clientApi = createApi(clientFetch as unknown as typeof fetch)
    // hydrate ДО init
    await clientApi.hydrate(snapshot)
    await clientApi.init()

    const res = await clientApi.request('getList', { q: 'x' })
    expect(res.fromCache).toBe(true)
    expect(res.data).toEqual({ items: ['seed'] })
    expect(clientFetch).not.toHaveBeenCalled()

    await clientApi.destroy()
  })
})

describe('ApiClient — шина инвалидации кэша', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let api: ReturnType<typeof createApi>

  beforeEach(async () => {
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/list') || url.includes('/other')) return jsonResponse({ items: ['a'] })
      return jsonResponse({ ok: true })
    })
    api = createApi(fetchMock as unknown as typeof fetch)
    await api.init()
  })

  afterEach(async () => {
    await api.destroy()
  })

  it('мутация с invalidatesTags уведомляет подписчиков эндпоинта с теми же тегами', async () => {
    const getList = api.getEndpoints().getList

    // Прогреваем кэш, чтобы было что инвалидировать
    await api.request('getList', { q: 'x' })

    const listener = vi.fn()
    const unsub = getList.onCacheInvalidate(listener)

    await api.request('createItem', { name: 'n' })

    expect(listener).toHaveBeenCalledTimes(1)

    // После инвалидации запись удалена — следующий GET снова идёт в сеть
    const res = await api.request('getList', { q: 'x' })
    expect(res.fromCache).toBe(false)

    unsub()
  })

  it('эндпоинт с непересекающимися тегами не уведомляется', async () => {
    await api.request('getList', { q: 'x' })
    await api.request('getOther', { id: 1 })

    const listListener = vi.fn()
    const otherListener = vi.fn()
    const unsubList = api.getEndpoints().getList.onCacheInvalidate(listListener)
    const unsubOther = api.getEndpoints().getOther.onCacheInvalidate(otherListener)

    // createItem инвалидирует только тег 'List'
    await api.request('createItem', { name: 'n' })

    expect(listListener).toHaveBeenCalledTimes(1)
    expect(otherListener).not.toHaveBeenCalled()

    unsubList()
    unsubOther()
  })
})
