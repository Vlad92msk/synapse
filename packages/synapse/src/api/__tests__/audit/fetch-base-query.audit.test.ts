// @vitest-environment node
//
// Регрессионные тесты по аудиту fetchBaseQuery (аудит 6.2.0, см. CHANGELOG; ID находок A7/A15/A16).
// Каждый тест воспроизводил баг до фикса (был `it.fails`).
import { describe, expect, it } from 'vitest'

import { fetchBaseQuery } from '../../utils/fetch-base-query'

function capture(response: () => Response = () => new Response(null, { status: 204 })) {
  const calls: RequestInit[] = []
  const fetchFn = (async (_url: string, init: RequestInit) => {
    calls.push(init)
    return response()
  }) as unknown as typeof fetch
  const query = fetchBaseQuery({ baseUrl: 'http://test.local', fetchFn })
  return { calls, run: (def: any) => query(def, {}, new Headers()) }
}

describe('AUDIT: сериализация тела запроса', () => {
  // A7
  it('A7: URLSearchParams отправляется как form-urlencoded, а не "{}" с application/json', async () => {
    const { calls, run } = capture()
    await run({ path: '/login', method: 'POST', body: new URLSearchParams({ user: 'u', pass: 'p' }) })

    expect(String(calls[0].body)).toBe('user=u&pass=p')
    expect(new Headers(calls[0].headers).get('content-type')).not.toBe('application/json')
  })

  // A7
  it('A7: ArrayBuffer / Uint8Array отправляются как бинарь, а не "{}"', async () => {
    const { calls, run } = capture()
    await run({ path: '/upload', method: 'PUT', body: new Uint8Array([1, 2, 3]) })

    expect(calls[0].body).not.toBe('{"0":1,"1":2,"2":3}')
    expect(typeof calls[0].body).not.toBe('string')
  })
})

describe('AUDIT: определение формата ответа и файлы', () => {
  // A16
  it('A16: JSON-ответ с "Content-Disposition: inline; filename=…" парсится как JSON, а не Blob', async () => {
    const { run } = capture(
      () =>
        new Response(JSON.stringify({ id: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'content-disposition': 'inline; filename="report.json"' },
        }),
    )
    const res = await run({ path: '/r', method: 'GET' })
    expect(res.data).toEqual({ id: 1 })
  })

  // A16
  it("A16: filename*=UTF-8''… (RFC 5987) декодируется в имя файла", async () => {
    const { run } = capture(
      () =>
        new Response('x', {
          status: 200,
          headers: { 'content-type': 'application/pdf', 'content-disposition': "attachment; filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82.pdf" },
        }),
    )
    const res = await run({ path: '/f', method: 'GET' })
    expect((res.fileDownloadResult as any)?.filename).toBe('отчёт.pdf')
  })
})

describe('AUDIT: метаданные файла', () => {
  // A15: рантайм-форма fileDownloadResult совпадает с типом ResponseFileMetadata
  it('A15: fileDownloadResult — { filename, contentType, contentDisposition, size }', async () => {
    const { run } = capture(
      () =>
        new Response('abc', {
          status: 200,
          headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="a.pdf"', 'content-length': '3' },
        }),
    )
    const res = await run({ path: '/f', method: 'GET' })
    expect(res.fileDownloadResult).toEqual({
      filename: 'a.pdf',
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="a.pdf"',
      size: 3,
    })
  })

  // A16: attachment у JSON — по-прежнему файл (явное скачивание)
  it('A16: JSON с "attachment" остаётся файлом (Blob)', async () => {
    const { run } = capture(
      () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="x.json"' },
        }),
    )
    const res = await run({ path: '/f', method: 'GET' })
    expect(res.data).toBeInstanceOf(Blob)
  })
})
