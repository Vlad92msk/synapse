// @vitest-environment node
//
// Объектная форма createSynapse({ storage, dispatcher, selectors, wire }): авто-вывод SSR-оболочки
// из sync-ядра, а async-обвязка (wire) не бежит при сборке оболочки.
import { describe, expect, it, vi } from 'vitest'

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

describe('createSynapse — объектная форма', () => {
  it('авто-выводит SSR-оболочку из sync-ядра (без ручного ssrShell)', () => {
    const handle = createSynapse<State, CounterDispatcher, CounterSelectors>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
      dispatcher: (s) => new CounterDispatcher(s),
      selectors: (s) => new CounterSelectors(s),
    })

    const shell = handle.buildSyncShell()
    expect(shell).toBeDefined()
    expect(shell!.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(shell!.storage.getStateSync()).toEqual(initialState)
    expect(shell!.dispatcher).toBeInstanceOf(CounterDispatcher)
    expect(shell!.selectors).toBeInstanceOf(CounterSelectors)
  })

  it('wire НЕ вызывается при сборке оболочки (клиентская обвязка на сервер не едет)', async () => {
    const wire = vi.fn(async () => ({}))
    const handle = createSynapse<State, CounterDispatcher, CounterSelectors>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
      dispatcher: (s) => new CounterDispatcher(s),
      selectors: (s) => new CounterSelectors(s),
      wire,
    })

    handle.buildSyncShell()
    expect(wire).not.toHaveBeenCalled()

    // wire исполняется только при сборке реального стора.
    await handle.ready()
    expect(wire).toHaveBeenCalledTimes(1)
  })

  it('wire получает sync-ядро и вливает dependencies/effects в реальный стор', async () => {
    const wire = vi.fn((core: { storage: unknown; dispatcher: unknown; selectors: unknown }) => {
      expect(core.storage).toBeDefined()
      expect(core.dispatcher).toBeInstanceOf(CounterDispatcher)
      return {}
    })
    const handle = createSynapse<State, CounterDispatcher, CounterSelectors>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
      dispatcher: (s) => new CounterDispatcher(s),
      selectors: (s) => new CounterSelectors(s),
      wire,
    })

    const synapse = await handle.ready()
    expect(synapse.selectors).toBeInstanceOf(CounterSelectors)
    expect(synapse.actions).toBeInstanceOf(CounterDispatcher)
    expect(wire).toHaveBeenCalledTimes(1)
  })

  it('каждый вызов оболочки — свежий изолированный storage', () => {
    const handle = createSynapse<State, CounterDispatcher, CounterSelectors>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
      selectors: (s) => new CounterSelectors(s),
    })
    const a = handle.buildSyncShell()!
    const b = handle.buildSyncShell()!
    expect(a.storage).not.toBe(b.storage)
    a.storage.set('value', 42)
    expect(b.storage.getStateSync().value).toBe(0)
  })

  it('работает без dispatcher/selectors (только storage)', () => {
    const handle = createSynapse<State>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
    })
    const shell = handle.buildSyncShell()!
    expect(shell.storage.getStateSync()).toEqual(initialState)
    expect(shell.dispatcher).toBeUndefined()
    expect(shell.selectors).toBeUndefined()
  })

  it('без wire реальный стор тоже собирается', async () => {
    const handle = createSynapse<State, CounterDispatcher, CounterSelectors>({
      storage: () => new MemoryStorage<State>({ name: name(), initialState }),
      dispatcher: (s) => new CounterDispatcher(s),
      selectors: (s) => new CounterSelectors(s),
    })
    const synapse = await handle.ready()
    expect(synapse.storage.getStateSync()).toEqual(initialState)
  })
})
