// Type-level: `RequestDefinition.query` — ПОДМНОЖЕСТВО параметров эндпоинта. Параметры пути уходят
// в `path`, поэтому дескриптор с path+query (сгенерированный клиент) должен проходить без `as`.
import { describe, expectTypeOf, it } from 'vitest'

import type { RequestDefinition } from '../types/api.interface'
import type { EndpointConfig } from '../types/endpoint.interface'

// Обычный interface (как у сгенерированных типов): без индекс-сигнатуры, поэтому имена ключей
// query проверяются. С `extends Record<string, any>` допустим любой ключ — это свойство самого типа.
interface GetHistoryParams {
  id: number
  thread_id?: number
  before_seq?: number
  limit: number
}

// Как в сгенерированном дескрипторе: функция объявлена отдельно, `id` — в пути, не в query.
const getHistory = (params: GetHistoryParams) => ({
  path: `/api/chats/${params.id}/messages`,
  method: 'GET' as const,
  query: { thread_id: params.thread_id, before_seq: params.before_seq, limit: params.limit },
})

describe('RequestDefinition.query — type-level', () => {
  it('path+query дескриптор присваивается EndpointConfig.request без приведения', () => {
    const config: EndpointConfig<GetHistoryParams, unknown> = { request: getHistory }
    expectTypeOf(config.request).returns.toEqualTypeOf<RequestDefinition<GetHistoryParams>>()
  })

  it('inline-дескриптор: query без параметра пути', () => {
    const config: EndpointConfig<GetHistoryParams, unknown> = {
      request: (p) => ({ path: `/api/chats/${p.id}/messages`, method: 'GET', query: { limit: p.limit } }),
    }
    expectTypeOf(config).not.toBeAny()
  })

  it('имена ключей query по-прежнему проверяются', () => {
    const config: EndpointConfig<GetHistoryParams, unknown> = {
      // @ts-expect-error — `limt` нет среди параметров эндпоинта
      request: (p) => ({ path: '/x', method: 'GET', query: { limt: p.limit } }),
    }
    expectTypeOf(config).not.toBeAny()
  })

  it('типы значений query по-прежнему проверяются', () => {
    const config: EndpointConfig<GetHistoryParams, unknown> = {
      // @ts-expect-error — limit: number, не string
      request: () => ({ path: '/x', method: 'GET', query: { limit: '20' } }),
    }
    expectTypeOf(config).not.toBeAny()
  })
})
