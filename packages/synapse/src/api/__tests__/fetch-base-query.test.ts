// Регресс: json-ветка getResponseData должна читать тело Response РОВНО один раз.
// Раньше `await response.json()` на пустом теле (204/DELETE) бросал, а catch пытался
// `await response.text()` по уже вычитанному одноразовому потоку → "body stream already
// read". Используем НАСТОЯЩИЙ Response — он моделирует одноразовость потока (mock из
// api-client.test с двумя независимыми json()/text() эту проблему не воспроизвёл бы).
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchBaseQuery } from '../utils/fetch-base-query'

/** fetchFn, отдающий заранее заданный настоящий Response. */
function fetchReturning(response: Response): typeof fetch {
  return (async () => response) as unknown as typeof fetch
}

async function run(response: Response) {
  const baseQuery = fetchBaseQuery({ baseUrl: 'http://test.local', fetchFn: fetchReturning(response) })
  return baseQuery({ path: '/x', method: 'DELETE' } as any, {}, new Headers())
}

describe('fetchBaseQuery: getResponseData (json)', () => {
  it('204 No Content (пустое тело) → data: undefined, без throw', async () => {
    const res = new Response(null, { status: 204, statusText: 'No Content' })
    const result = await run(res)
    expect(result.ok).toBe(true)
    expect(result.data).toBeUndefined()
    expect(result.error).toBeUndefined()
  })

  it('200 с пустым телом (json content-type) → data: undefined', async () => {
    const res = new Response('', { status: 200, headers: { 'content-type': 'application/json' } })
    const result = await run(res)
    expect(result.ok).toBe(true)
    expect(result.data).toBeUndefined()
  })

  it('200 с валидным JSON → парсится', async () => {
    const res = new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { 'content-type': 'application/json' } })
    const result = await run(res)
    expect(result.data).toEqual({ id: 1 })
  })

  it('200 с не-JSON текстом → data = строка (fallback, без "body stream already read")', async () => {
    const res = new Response('plain text', { status: 200 })
    const result = await run(res)
    expect(result.data).toBe('plain text')
  })

  it('4xx с пустым телом → error: undefined, без повторного throw', async () => {
    const res = new Response(null, { status: 404, statusText: 'Not Found' })
    const result = await run(res)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
    expect(result.error).toBeUndefined()
  })
})

// Регресс: отмена (switchMap / unsubscribe) — штатная ситуация. Раньше AbortError во время
// чтения тела логировался как ошибка, а при 200 превращался в `ok: true, data: undefined`.
describe('fetchBaseQuery: отмена запроса', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Ошибка, которую браузер кидает из body-reader'а при abort. */
  const abortError = () => new DOMException('signal is aborted without reason', 'AbortError')

  /**
   * fetchFn: заголовки (200, json) приходят сразу, тело — стрим, который «висит», пока signal
   * не абортнут, после чего падает с `reason` (как браузерный fetch при abort во время чтения тела).
   */
  function fetchWithHangingBody(reason: () => unknown): typeof fetch {
    return (async (_url: string, init?: RequestInit) => {
      const signal = init?.signal
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"items":'))
          signal?.addEventListener('abort', () => controller.error(reason()), { once: true })
        },
      })
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
  }

  function runAbortable(fetchFn: typeof fetch, responseFormat?: string) {
    const controller = new AbortController()
    const baseQuery = fetchBaseQuery({ baseUrl: 'http://test.local', fetchFn })
    const promise = baseQuery({ path: '/x', method: 'GET' } as any, { signal: controller.signal, responseFormat } as any, new Headers())
    return { controller, promise }
  }

  it.each([undefined, 'text', 'blob', 'arrayBuffer'])('abort после заголовков, до конца тела (format: %s) → AbortError, без лога и без ok: true', async (format) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { controller, promise } = runAbortable(fetchWithHangingBody(abortError), format)

    await new Promise((r) => setTimeout(r, 0)) // заголовки получены, тело читается
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('abort во время чтения тела с не-AbortError причиной → всё равно трактуется как отмена (по signal)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { controller, promise } = runAbortable(fetchWithHangingBody(() => new TypeError('network error')))

    await new Promise((r) => setTimeout(r, 0))
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('abort до прихода заголовков → AbortError, без лога', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true })
      })) as unknown as typeof fetch
    const { controller, promise } = runAbortable(fetchFn)

    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('обычная сетевая ошибка (без abort) → ok: false, без лога (ошибку получает вызывающий)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const { promise } = runAbortable(fetchFn)

    const result = await promise
    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(consoleError).not.toHaveBeenCalled()
  })
})

// Обрыв тела при 2xx — неуспех, а не «успех с data: undefined» (неотличимый от 204).
describe('fetchBaseQuery: ошибка чтения тела', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('200, но поток тела упал (не abort) → ok: false, error = исходная ошибка', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"items":'))
        controller.error(new TypeError('network error'))
      },
    })
    const result = await run(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))

    expect(result.ok).toBe(false)
    expect(result.status).toBe(200)
    expect(result.error).toBeInstanceOf(TypeError)
  })
})

// Таймаут должен реально прерывать запрос (abort signal'а fetch), в т.ч. во время чтения тела.
describe('fetchBaseQuery: таймаут', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('таймаут до заголовков → abort signal fetch, ok: false, status 0', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let fetchSignal: AbortSignal | undefined
    const fetchFn = ((_url: string, init?: RequestInit) => {
      fetchSignal = init?.signal ?? undefined
      return new Promise(() => {}) // никогда не отвечает
    }) as unknown as typeof fetch
    const baseQuery = fetchBaseQuery({ baseUrl: 'http://test.local', fetchFn, timeout: 10 })

    const result = await baseQuery({ path: '/x', method: 'GET' } as any, {}, new Headers())

    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(String(result.statusText)).toMatch(/10мс/)
    expect(fetchSignal?.aborted).toBe(true)
  })

  it('таймаут во время чтения тела → ok: false (а не зависание / AbortError)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"items":'))
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true })
        },
      })
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const baseQuery = fetchBaseQuery({ baseUrl: 'http://test.local', fetchFn, timeout: 10 })

    const result = await baseQuery({ path: '/x', method: 'GET' } as any, {}, new Headers())

    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(String(result.statusText)).toMatch(/Превышено время ожидания/)
  })
})
