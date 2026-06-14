// @vitest-environment jsdom
//
// Dev-only logger-middleware для storage: логирует пишущие действия, молчит на чтениях.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../adapters/memory-storage.service'

interface State extends Record<string, any> {
  count: number
}

let uid = 0
const nextName = () => `logger_${uid++}`

describe('loggerMiddleware (через config.middlewares(getDefault))', () => {
  let group: ReturnType<typeof vi.spyOn>
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    group = vi.spyOn(console, 'group').mockImplementation(() => {})
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('логирует set, но не get', async () => {
    const storage = new MemoryStorage<State>({
      name: nextName(),
      initialState: { count: 0 },
      middlewares: (getDefault) => [getDefault().logger()],
    })
    await storage.initialize()

    group.mockClear()

    storage.set('count', 5)
    expect(group).toHaveBeenCalledTimes(1)
    expect(group.mock.calls[0][0]).toContain('set')

    group.mockClear()
    storage.get('count')
    expect(group).not.toHaveBeenCalled()
  })

  it('showState: false → не печатает prev/next', async () => {
    const storage = new MemoryStorage<State>({
      name: nextName(),
      initialState: { count: 0 },
      middlewares: (getDefault) => [getDefault().logger({ showState: false })],
    })
    await storage.initialize()

    log.mockClear()
    storage.set('count', 1)

    const printedKeys = log.mock.calls.map((c) => c[0])
    expect(printedKeys).not.toContain('prev:')
    expect(printedKeys).not.toContain('next:')
  })
})
