// @vitest-environment jsdom
//
// Тесты React-хуков useApiQuery / useApiMutation поверх ApiClient.
// Сеть мокается через baseQuery.fetchFn.
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClient } from '../../api/api.module'
import type { Endpoint } from '../../api/types/endpoint.interface'
import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { useApiMutation } from '../hooks/useApiMutation'
import { useApiQuery } from '../hooks/useApiQuery'

interface ListResult {
  items: string[]
}

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
    storage: () => new MemoryStorage({ name: `api_hooks_${uid++}` }),
    cache: { ttl: 60_000, cleanup: { enabled: false } },
    baseQuery: { baseUrl: 'http://test.local', fetchFn },
    endpoints: async (create) => ({
      getList: create<{ q?: string }, ListResult>({
        request: (params) => ({ path: '/list', method: 'GET', query: params }),
        tags: ['List'],
        cache: { ttl: 60_000 },
      }),
      createItem: create<{ name: string }, { ok: boolean }>({
        request: (params) => ({ path: '/item', method: 'POST', body: params }),
        invalidatesTags: ['List'],
      }),
    }),
  })
}

type Endpoints = {
  getList: Endpoint<{ q?: string }, ListResult>
  createItem: Endpoint<{ name: string }, { ok: boolean }>
}

describe('useApiQuery', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let api: ReturnType<typeof createApi>
  let endpoints: Endpoints

  beforeEach(async () => {
    fetchMock = vi.fn(async () => jsonResponse({ items: ['a', 'b'] }))
    api = createApi(fetchMock as unknown as typeof fetch)
    await api.init()
    endpoints = api.getEndpoints() as unknown as Endpoints
  })

  afterEach(async () => {
    await api.destroy()
  })

  it('проходит loading → success и отдаёт данные', async () => {
    function Comp() {
      const { data, isLoading, isSuccess } = useApiQuery(endpoints.getList, { q: 'x' })
      return (
        <div>
          <span data-testid="loading">{String(isLoading)}</span>
          <span data-testid="success">{String(isSuccess)}</span>
          <span data-testid="data">{data?.items.join(',') ?? ''}</span>
        </div>
      )
    }

    render(<Comp />)

    await waitFor(() => expect(screen.getByTestId('success').textContent).toBe('true'))
    expect(screen.getByTestId('data').textContent).toBe('a,b')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('enabled: false — запрос не выполняется', async () => {
    function Comp() {
      const { status } = useApiQuery(endpoints.getList, { q: 'x' }, { enabled: false })
      return <span data-testid="status">{status}</span>
    }

    render(<Comp />)
    // дать шанс эффектам
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(screen.getByTestId('status').textContent).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('первый рендер после гидрации отдаёт кэш сразу (без вспышки loading)', async () => {
    // Засеваем кэш напрямую через тот же ApiClient
    await api.request('getList', { q: 'x' })
    fetchMock.mockClear()

    const statuses: string[] = []
    function Comp() {
      const { status, data } = useApiQuery(endpoints.getList, { q: 'x' })
      statuses.push(status)
      return <span data-testid="data">{data?.items.join(',') ?? ''}</span>
    }

    render(<Comp />)

    await waitFor(() => expect(screen.getByTestId('data').textContent).toBe('a,b'))
    // Не было перехода в loading — первый снапшот уже success из кэша
    expect(statuses).not.toContain('loading')
  })

  it('refetch перезапрашивает данные', async () => {
    let refetchFn: () => void = () => {}
    function Comp() {
      const { data, refetch } = useApiQuery(endpoints.getList, { q: 'x' })
      refetchFn = refetch
      return <span data-testid="data">{data?.items.join(',') ?? ''}</span>
    }

    render(<Comp />)
    await waitFor(() => expect(screen.getByTestId('data').textContent).toBe('a,b'))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // refetch → новый request (попадёт в кэш, но request всё равно вызывается)
    await act(async () => {
      refetchFn()
      await new Promise((r) => setTimeout(r, 20))
    })

    // Данные на месте
    expect(screen.getByTestId('data').textContent).toBe('a,b')
  })

  it('авто-рефетч при инвалидации кэша после мутации', async () => {
    let version = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/list')) {
        version += 1
        return jsonResponse({ items: [`v${version}`] })
      }
      return jsonResponse({ ok: true })
    })

    function Comp() {
      const { data } = useApiQuery(endpoints.getList, { q: 'x' })
      return <span data-testid="data">{data?.items.join(',') ?? ''}</span>
    }

    render(<Comp />)
    await waitFor(() => expect(screen.getByTestId('data').textContent).toBe('v1'))

    // Мутация инвалидирует тег 'List' → активный useApiQuery должен перезапроситься
    await act(async () => {
      await api.request('createItem', { name: 'n' })
      await new Promise((r) => setTimeout(r, 20))
    })

    await waitFor(() => expect(screen.getByTestId('data').textContent).toBe('v2'))
  })
})

describe('useApiMutation', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let api: ReturnType<typeof createApi>
  let endpoints: Endpoints

  beforeEach(async () => {
    fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    api = createApi(fetchMock as unknown as typeof fetch)
    await api.init()
    endpoints = api.getEndpoints() as unknown as Endpoints
  })

  afterEach(async () => {
    await api.destroy()
  })

  it('mutate переводит idle → loading → success', async () => {
    let mutateFn: (p: { name: string }) => void = () => {}
    function Comp() {
      const { status, mutate, isSuccess } = useApiMutation(endpoints.createItem)
      mutateFn = mutate
      return (
        <div>
          <span data-testid="status">{status}</span>
          <span data-testid="success">{String(isSuccess)}</span>
        </div>
      )
    }

    render(<Comp />)
    expect(screen.getByTestId('status').textContent).toBe('idle')

    await act(async () => {
      mutateFn({ name: 'n' })
      await new Promise((r) => setTimeout(r, 20))
    })

    await waitFor(() => expect(screen.getByTestId('success').textContent).toBe('true'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('mutateAsync пробрасывает ошибку и выставляет isError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, 500))

    let mutateAsyncFn: (p: { name: string }) => Promise<unknown> = async () => undefined
    function Comp() {
      const { isError, mutateAsync } = useApiMutation(endpoints.createItem)
      mutateAsyncFn = mutateAsync
      return <span data-testid="error">{String(isError)}</span>
    }

    render(<Comp />)

    await act(async () => {
      await expect(mutateAsyncFn({ name: 'n' })).rejects.toBeTruthy()
    })

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('true'))
  })
})
