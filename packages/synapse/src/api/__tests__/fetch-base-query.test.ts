// Регресс: json-ветка getResponseData должна читать тело Response РОВНО один раз.
// Раньше `await response.json()` на пустом теле (204/DELETE) бросал, а catch пытался
// `await response.text()` по уже вычитанному одноразовому потоку → "body stream already
// read". Используем НАСТОЯЩИЙ Response — он моделирует одноразовость потока (mock из
// api-client.test с двумя независимыми json()/text() эту проблему не воспроизвёл бы).
import { describe, expect, it } from 'vitest'

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
