// @vitest-environment node
//
// C-форма createSynapse({ storage, dispatcher, selectors, dependencies?, effects? }): синхронная
// конструкция ядра, buildSyncShell для SSR-изоляции, вывод генериков из фабрики storage.
import { describe, expect, it } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { StorageStatus } from '../../../core/storage/storage.interface'
import { Selectors } from '../../../core/selector/selectors.base'
import { Dispatcher } from '../../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../createSynapse'

interface State extends Record<string, any> {
  value: number
}
const initialState: State = { value: 0 }

class CounterDispatcher extends Dispatcher<State> {
  readonly inc = this.action((store) => store.update((s) => (s.value += 1)))
}
class CounterSelectors extends Selectors<State> {
  readonly value = this.select((s) => s.value)
}

let uid = 0
const name = () => `objform_${uid++}`

describe('createSynapse — C-форма', () => {
  it('buildSyncShell отдаёт READY-ядро синхронно из initialState', () => {
    const handle = createSynapse<State, CounterDispatcher, CounterSelectors>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
      dispatcher: (s) => new CounterDispatcher(s),
      selectors: (s) => new CounterSelectors(s),
    })

    const shell = handle.buildSyncShell!()
    expect(shell).toBeDefined()
    expect(shell!.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(shell!.storage.getStateSync()).toEqual(initialState)
    expect(shell!.dispatcher).toBeInstanceOf(CounterDispatcher)
    expect(shell!.selectors).toBeInstanceOf(CounterSelectors)
  })

  it('каждый вызов оболочки — свежий изолированный storage (request-изоляция)', () => {
    const handle = createSynapse<State, CounterDispatcher, CounterSelectors>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
      selectors: (s) => new CounterSelectors(s),
    })
    const a = handle.buildSyncShell!()!
    const b = handle.buildSyncShell!()!
    expect(a.storage).not.toBe(b.storage)
    a.storage.set('value', 42)
    expect(b.storage.getStateSync().value).toBe(0)
  })

  it('работает без dispatcher/selectors (только storage)', () => {
    const handle = createSynapse<State>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
    })
    const shell = handle.buildSyncShell!()!
    expect(shell.storage.getStateSync()).toEqual(initialState)
    expect(shell.dispatcher).toBeUndefined()
    expect(shell.selectors).toBeUndefined()
  })

  it('выводит генерики из storage без ручного перечисления (<State, Disp, Sel>)', async () => {
    // Ни одного генерика в вызове — TState выводится из MemoryStorage<State>,
    // TDispatcher/TSelectors — из конструкторов.
    const handle = createSynapse({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
      dispatcher: (s) => new CounterDispatcher(s),
      selectors: (s) => new CounterSelectors(s),
    })

    const synapse = await handle.ready()
    const v: number = synapse.selectors.value.selectSync()
    expect(v).toBe(0)
    synapse.actions.inc()
    expect(synapse.storage.getStateSync().value).toBe(1)
    expect(synapse.selectors).toBeInstanceOf(CounterSelectors)
    expect(synapse.actions).toBeInstanceOf(CounterDispatcher)
  })

  it('реальный стор собирается через ready()', async () => {
    const handle = createSynapse<State, CounterDispatcher, CounterSelectors>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
      dispatcher: (s) => new CounterDispatcher(s),
      selectors: (s) => new CounterSelectors(s),
    })
    const synapse = await handle.ready()
    expect(synapse.storage.getStateSync()).toEqual(initialState)
  })
})
