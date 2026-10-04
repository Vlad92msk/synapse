// @vitest-environment node
//
// Регрессионные тесты по аудиту ApiClient/Endpoint/QueryStorage (аудит 6.2.0, описание находок — CHANGELOG 6.2.0,
// ID находок — A1…A18). Каждый тест воспроизводил баг до фикса (был `it.fails`).
import { lastValueFrom, of } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { apiResult } from '../../../reactive/effects/operators/api-result'
import { fromRequest } from '../../../reactive/effects/utils/fromRequest'
import { ApiClient } from '../../api.module'
import { QueryStorage } from '../../components/query-storage'
import { CacheConfig } from '../../types/api.interface'

let uid = 0

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), { status: 200, ...init, headers: { 'content-type': 'application/json', ...(init.headers as any) } })

interface Opts {
  fetchFn: typeof fetch
  cache?: CacheConfig
  cacheableHeaderKeys?: string[]
  prepareHeaders?: (h: Headers, ctx: any) => Promise<Headers>
  endpointsDelay?: number
}

function createApi({ fetchFn, cache = { ttl: 60_000, cleanup: { enabled: false } }, cacheableHeaderKeys, prepareHeaders, endpointsDelay }: Opts) {
  return new ApiClient({
    storage: () => new MemoryStorage({ name: `audit_${uid++}` }),
    cache,
    cacheableHeaderKeys,
    baseQuery: { baseUrl: 'http://test.local', fetchFn, prepareHeaders },
    endpoints: async (create) => {
      if (endpointsDelay) await new Promise((r) => setTimeout(r, endpointsDelay))
      return {
        getList: create<{ q?: string; filter?: Record<string, any> }, { items: string[] }>({
          request: (params) => ({ path: '/list', method: 'GET', query: params as any }),
          tags: ['List'],
          cache: true,
        }),
        createItem: create<{ name: string }, { ok: boolean }>({
          request: (params) => ({ path: '/item', method: 'POST', body: params }),
          invalidatesTags: ['List'],
        }),
        withHeaders: create<Record<string, never>, unknown>({
          request: () => ({ path: '/h', method: 'GET', headers: { 'X-From-Definition': '1' } }),
        }),
      }
    },
  })
}

/** fetchFn с подсчётом вызовов по пути; ответ строится колбэком. */
function countingFetch(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return respond(url, init)
  }) as unknown as typeof fetch
  const count = (part: string) => calls.filter((c) => c.url.includes(part)).length
  return { fn, calls, count }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AUDIT: ключ кэша', () => {
  // A1
  it('A1: инвалидация по тегу работает для параметров с точкой (email, float, домен)', async () => {
    const f = countingFetch((url) => (url.includes('/list') ? json({ items: ['x'] }) : json({ ok: true })))
    const api = await createApi({ fetchFn: f.fn }).init()

    await api.request('getList', { q: 'a.b' })
    await api.request('createItem', { name: 'n' }) // invalidatesTags: ['List']
    const after = await api.request('getList', { q: 'a.b' })

    expect(after.fromCache).toBe(false)
    expect(f.count('/list')).toBe(2)
    await api.destroy()
  })

  // A2
  it('A2: разные вложенные объекты в params — разные ключи кэша', async () => {
    const f = countingFetch((url) => json({ items: [url] }))
    const api = await createApi({ fetchFn: f.fn }).init()

    await api.request('getList', { filter: { a: 1 } })
    const second = await api.request('getList', { filter: { a: 2 } })

    expect(second.fromCache).toBe(false)
    expect(f.count('/list')).toBe(2)
    await api.destroy()
  })

  // A2 (вариант): значения с '&'/'=' склеиваются в одинаковую строку ключа
  it('A2: { filter: "y&q=x" } и { filter: "y", q: "x" } не должны делить запись кэша', async () => {
    const f = countingFetch((url) => json({ items: [url] }))
    const api = await createApi({ fetchFn: f.fn }).init()

    await api.request('getList', { filter: 'y' as any, q: 'x' })
    const second = await api.request('getList', { filter: 'y&q=x' as any })

    expect(second.fromCache).toBe(false)
    await api.destroy()
  })
})

describe('AUDIT: результат из кэша', () => {
  // A3
  it('A3: на попадании в кэш meta.headers в apiResult — Headers (meta.headers.get работает)', async () => {
    const f = countingFetch(() => json({ items: [] }, { headers: { 'x-total-count': '42' } }))
    const api = await createApi({ fetchFn: f.fn }).init()
    const ep = api.getEndpoints().getList

    const total = () =>
      lastValueFrom(
        fromRequest(ep.request({ q: 'p' })).pipe(
          apiResult((_d, meta) => meta.headers.get('x-total-count')),
          catchError((e) => of(`error: ${e}`)),
        ),
      )

    expect(await total()).toBe('42') // сеть
    expect(await total()).toBe('42') // кэш: сейчас TypeError "meta.headers.get is not a function"
    await api.destroy()
  })
})

describe('AUDIT: дедупликация', () => {
  // A4
  it('A4: отмена «ведущего» запроса не роняет параллельный дубль другого потребителя', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(json({ items: ['ok'] })), 30)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })) as unknown as typeof fetch
    const api = await createApi({ fetchFn }).init()
    const ep = api.getEndpoints().getList

    const leader = ep.request({ q: 'same' })
    const follower = ep.request({ q: 'same' })
    leader.catch(() => {})
    await new Promise((r) => setTimeout(r, 5))
    leader.abort() // например, размонтирован один из двух компонентов с одинаковым useApiQuery

    const res = await follower.wait()
    expect(res.data).toEqual({ items: ['ok'] })
    await api.destroy()
  })

  // A5
  it('A5: GET, стартовавший до мутации, не кладёт в кэш устаревшие данные после инвалидации', async () => {
    let version = 1
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((r) => (releaseFirst = r))
    let listCalls = 0
    const fetchFn = (async (url: string) => {
      if (url.includes('/item')) {
        version = 2
        return json({ ok: true })
      }
      listCalls++
      const v = version // снимок «сервера» в момент запроса
      if (listCalls === 1) await firstGate
      return json({ items: [`v${v}`] })
    }) as unknown as typeof fetch
    const api = await createApi({ fetchFn }).init()

    const stale = api.request('getList', { q: 's' }) // летит, видит v1
    await new Promise((r) => setTimeout(r, 5))
    await api.request('createItem', { name: 'n' }) // сервер → v2, invalidatesTags: ['List']
    releaseFirst()
    await stale

    const fresh = await api.request('getList', { q: 's' })
    expect(fresh.data).toEqual({ items: ['v2'] })
    await api.destroy()
  })
})

describe('AUDIT: заголовки запроса', () => {
  // A6
  it('A6: RequestDefinition.headers уходят в fetch', async () => {
    const f = countingFetch(() => json({}))
    const api = await createApi({ fetchFn: f.fn }).init()
    await api.request('withHeaders', {})
    expect(new Headers(f.calls[0].init?.headers).get('x-from-definition')).toBe('1')
    await api.destroy()
  })

  // A6
  it('A6: QueryOptions.headers уходят в fetch', async () => {
    const f = countingFetch(() => json({}))
    const api = await createApi({ fetchFn: f.fn }).init()
    await api.request('withHeaders', {}, { headers: new Headers({ 'X-From-Options': '1' }) })
    expect(new Headers(f.calls[0].init?.headers).get('x-from-options')).toBe('1')
    await api.destroy()
  })

  // A14 — расхождение с docs/en/api-client.md («context.context?.source»)
  it('A14: prepareHeaders получает options.context как context.context (как в документации), служебные поля не перетираются', async () => {
    const seen: any[] = []
    const f = countingFetch(() => json({}))
    const api = await createApi({
      fetchFn: f.fn,
      prepareHeaders: async (h, ctx) => {
        seen.push(ctx)
        return h
      },
    }).init()
    await api.request('withHeaders', {}, { context: { source: 'admin', requestParams: 'hijack' } })
    expect(seen[0].requestParams).toEqual({})
    expect(seen[0].context?.source).toBe('admin')
    expect(seen[0].source).toBe('admin') // историческое поведение (верхний уровень) сохранено
    await api.destroy()
  })
})

describe('AUDIT: TTL и сериализация кэша', () => {
  // A8
  it('A8: глобальный cache-объект без ttl не делает записи вечными (дефолт 5 мин сохраняется)', async () => {
    const now = vi.spyOn(Date, 'now')
    let t = 1_000_000
    now.mockImplementation(() => t)
    const f = countingFetch(() => json({ items: [] }))
    const api = await createApi({ fetchFn: f.fn, cache: { invalidateOnError: true } }).init()

    await api.request('getList', { q: 'ttl' })
    t += 60 * 60 * 1000 // час спустя
    const again = await api.request('getList', { q: 'ttl' })

    expect(again.fromCache).toBe(false)
    await api.destroy()
  })

  // A9
  it('A9: «вечная» запись (expiresAt: Infinity) переживает dehydrate → JSON → hydrate', async () => {
    const f = countingFetch(() => json({ items: ['ssr'] }))
    const server = await createApi({ fetchFn: f.fn, cache: { ttl: 0, cleanup: { enabled: false } } }).init()
    await server.request('getList', { q: 'ssr' })
    const html = JSON.stringify(await server.dehydrate()) // Infinity → null
    await server.destroy()

    const client = createApi({ fetchFn: f.fn, cache: { ttl: 0, cleanup: { enabled: false } } })
    await client.hydrate(JSON.parse(html))
    await client.init()
    const res = await client.request('getList', { q: 'ssr' })

    expect(res.fromCache).toBe(true)
    await client.destroy()
  })

  // A12
  it('A12: значение Authorization из cacheableHeaderKeys не попадает в снапшот dehydrate (SSR-HTML)', async () => {
    const f = countingFetch(() => json({ items: [] }))
    const api = await createApi({
      fetchFn: f.fn,
      cacheableHeaderKeys: ['authorization'],
      prepareHeaders: async (h) => {
        h.set('Authorization', 'Bearer SECRET-TOKEN')
        return h
      },
    }).init()
    await api.request('getList', { q: 'me' })

    expect(JSON.stringify(await api.dehydrate())).not.toContain('SECRET-TOKEN')
    await api.destroy()
  })
})

describe('AUDIT: гонки QueryStorage', () => {
  // A10
  it('A10: чтение кэша, совпавшее с инвалидацией, не воскрешает удалённую запись', async () => {
    const qs = await new QueryStorage(new MemoryStorage({ name: `audit_qs_${uid++}` }), { ttl: 60_000, cleanup: { enabled: false } }).initialize()
    const [key] = qs.createCacheKey('ep', { id: 1 })
    await qs.setCachedResult(key, { ok: true, data: 1 }, { ttl: 60_000 }, {}, ['T'])

    const read = qs.getCachedResult(key) // get → (await) → set(updatedMetadata)
    await qs.invalidateCacheByTags(['T'])
    await read

    expect(await qs.getCachedResult(key)).toBeUndefined()
    await qs.destroy()
  })
})

describe('AUDIT: жизненный цикл ApiClient', () => {
  // A11
  it('A11: hydrate(), вызванный во время init(), не теряется', async () => {
    const f = countingFetch(() => json({ items: ['net'] }))
    const server = await createApi({ fetchFn: f.fn }).init()
    await server.request('getList', { q: 'h' })
    const snapshot = await server.dehydrate()
    await server.destroy()

    const client = createApi({ fetchFn: f.fn, endpointsDelay: 20 })
    const initP = client.init()
    await new Promise((r) => setTimeout(r, 5)) // storage уже создан, эндпоинты ещё строятся
    await client.hydrate(snapshot)
    await initP

    const res = await client.request('getList', { q: 'h' })
    expect(res.fromCache).toBe(true)
    await client.destroy()
  })

  // A13
  it('A13: отменённый запрос не логируется как ошибка (как обещает документация)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = ((_u: string, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch
    const api = await createApi({ fetchFn }).init()
    const ctrl = new AbortController()

    const p = api.request('getList', { q: 'abort' }, { signal: ctrl.signal })
    setTimeout(() => ctrl.abort(), 5)
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })

    expect(consoleError).not.toHaveBeenCalled()
    await api.destroy()
  })
})

describe('AUDIT: прочее', () => {
  // A17
  it('A17: слушатель abort на внешнем signal снимается после завершения запроса', async () => {
    const f = countingFetch(() => json({}))
    const api = await createApi({ fetchFn: f.fn }).init()
    const ctrl = new AbortController()
    const add = vi.spyOn(ctrl.signal, 'addEventListener')
    const remove = vi.spyOn(ctrl.signal, 'removeEventListener')

    await api.request('withHeaders', {}, { signal: ctrl.signal })
    await api.request('withHeaders', {}, { signal: ctrl.signal })

    expect(add).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(2)
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1])
    await api.destroy()
  })

  // A18
  it('A18: getCachedSync учитывает options.disableCache', async () => {
    const f = countingFetch(() => json({ items: ['c'] }))
    const api = await createApi({ fetchFn: f.fn }).init()
    const ep = api.getEndpoints().getList
    await api.request('getList', { q: 'sync' })

    expect(ep.getCachedSync({ q: 'sync' })?.data).toEqual({ items: ['c'] })
    expect(ep.getCachedSync({ q: 'sync' }, { disableCache: true })).toBeUndefined()
    await api.destroy()
  })

  // A3 (sync-путь)
  it('A3: getCachedSync отдаёт headers как Headers', async () => {
    const f = countingFetch(() => json({ items: [] }, { headers: { 'x-total-count': '7' } }))
    const api = await createApi({ fetchFn: f.fn }).init()
    await api.request('getList', { q: 'h' })

    expect(api.getEndpoints().getList.getCachedSync({ q: 'h' })?.headers.get('x-total-count')).toBe('7')
    await api.destroy()
  })

  // A4 (дополнение): отмена дубля реджектит его сразу, а общий запрос продолжает жить для ведущего
  it('A4: отмена дубля не отменяет общий запрос; отмена всех — отменяет fetch', async () => {
    let aborted = 0
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(json({ items: ['ok'] })), 30)
        init?.signal?.addEventListener('abort', () => {
          aborted++
          clearTimeout(t)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })) as unknown as typeof fetch
    const api = await createApi({ fetchFn }).init()
    const ep = api.getEndpoints().getList

    const leader = ep.request({ q: 'x' })
    const follower = ep.request({ q: 'x' })
    await new Promise((r) => setTimeout(r, 5))
    follower.abort()
    await expect(follower.wait()).rejects.toMatchObject({ name: 'AbortError' })
    expect((await leader.wait()).data).toEqual({ items: ['ok'] })
    expect(aborted).toBe(0)

    const a = ep.request({ q: 'y' })
    const b = ep.request({ q: 'y' })
    await new Promise((r) => setTimeout(r, 5))
    a.abort()
    b.abort()
    await expect(a.wait()).rejects.toMatchObject({ name: 'AbortError' })
    await expect(b.wait()).rejects.toMatchObject({ name: 'AbortError' })
    await new Promise((r) => setTimeout(r, 0))
    expect(aborted).toBe(1)
    await api.destroy()
  })

  // A2/A1: записи старого формата ключа (`<endpoint>_k=v`) в persistent-хранилище — просто промахи
  it('A2: запись старого формата ключа не ломает чтение — промах и запрос в сеть', async () => {
    const f = countingFetch(() => json({ items: ['new'] }))
    const api = createApi({ fetchFn: f.fn })
    await api.hydrate({
      'getList_q=old': {
        data: { ok: true, data: { items: ['legacy'] }, status: 200, statusText: '', headers: {} },
        metadata: { createdAt: 0, updatedAt: 0, expiresAt: null, tags: ['List'] },
        params: { q: 'old' },
      },
    })
    await api.init()

    const res = await api.request('getList', { q: 'old' })
    expect(res.fromCache).toBe(false)
    expect(res.data).toEqual({ items: ['new'] })
    await api.destroy()
  })
})
