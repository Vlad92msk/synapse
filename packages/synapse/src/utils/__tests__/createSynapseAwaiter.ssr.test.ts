// @vitest-environment node
//
// SSR sync-fast-path awaiter: уже готовый (READY) synapse доступен синхронно, без микротаски.
import { afterEach, describe, expect, it } from 'vitest'

import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { Selectors } from '../../core/selector/selectors.base'
import { Dispatcher } from '../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../createSynapse'
import { createSynapseAwaiter } from '../createSynapseAwaiter'

interface State extends Record<string, any> {
  count: number
}

let uid = 0

class CtxDispatcher extends Dispatcher<State> {
  readonly inc = this.action((store) => store.update((s) => (s.count += 1)))
}
class CtxSelectors extends Selectors<State> {
  readonly count = this.select((s) => s.count)
}

const makeHandle = (initial: State = { count: 0 }) =>
  createSynapse<State, CtxDispatcher, CtxSelectors>(() => {
    const storage = new MemoryStorage<State>({ name: `aw_${uid++}`, initialState: initial })
    return { storage, dispatcher: new CtxDispatcher(storage), selectors: new CtxSelectors(storage) }
  })

describe('createSynapseAwaiter — SSR sync-fast-path', () => {
  const created: Array<{ destroy(): Promise<void> }> = []
  afterEach(async () => {
    while (created.length) await created.pop()!.destroy()
  })

  it('готовый synapse (handle.ready()) отдаётся синхронно через getStoreIfReady', async () => {
    const handle = makeHandle()
    created.push(handle)
    // Прогреваем модуль — после этого getSnapshot() отдаёт READY synapse.
    await handle.ready()

    const awaiter = createSynapseAwaiter(handle)
    // Синхронно, без await: стор уже доступен.
    expect(awaiter.isReady()).toBe(true)
    expect(awaiter.getStoreIfReady()).toBeDefined()
    expect(awaiter.getStatus()).toBe('ready')
  })

  it('не прогретый handle уходит в async-ветку (getStoreIfReady пуст до резолва)', async () => {
    const handle = makeHandle()
    created.push(handle)

    const awaiter = createSynapseAwaiter(handle)
    // Фабрика ещё не отработала → синхронно стора нет.
    expect(awaiter.getStoreIfReady()).toBeUndefined()
    expect(awaiter.getStatus()).toBe('pending')

    // Но async-ветка доводит до готовности.
    const store = await awaiter.waitForReady()
    expect(store).toBeDefined()
    expect(awaiter.isReady()).toBe(true)
  })

  it('напрямую переданный READY-synapse доступен синхронно', async () => {
    const handle = makeHandle({ count: 7 })
    created.push(handle)
    const synapse = await handle.ready()

    const awaiter = createSynapseAwaiter(synapse)
    expect(awaiter.isReady()).toBe(true)
    expect(awaiter.getStoreIfReady()?.storage.getStateSync().count).toBe(7)
  })
})
