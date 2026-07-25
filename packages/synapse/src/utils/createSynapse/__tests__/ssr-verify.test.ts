// @vitest-environment node
//
// ADVERSARIAL probes for 5.4.0 object-form / buildSyncShell at the module level.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { StorageStatus } from '../../../core'
import { Selectors } from '../../../core/selector/selectors.base'
import { Dispatcher } from '../../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../../index'

interface State extends Record<string, any> {
  label: string
}
const initialState: State = { label: 'shell' }

class LabelDispatcher extends Dispatcher<State> {
  readonly set = this.action((store, label: string) => store.update((s) => (s.label = label)))
}
class LabelSelectors extends Selectors<State> {
  readonly label = this.select((s) => s.label)
}

let uid = 0

describe('PROBE — buildSyncShell isolation & idempotency', () => {
  it('each buildSyncShell() returns a FRESH isolated store', () => {
    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new MemoryStorage<State>({ name: `iso_${uid++}`, initialState }),
      dispatcher: (s) => new LabelDispatcher(s),
      selectors: (s) => new LabelSelectors(s),
    })
    const s1 = handle.buildSyncShell!()!
    const s2 = handle.buildSyncShell!()!
    expect(s1).not.toBe(s2)
    expect(s1.storage).not.toBe(s2.storage)
    s1.storage.hydrate({ label: 'one' })
    expect(s2.storage.getStateSync().label).toBe('shell') // not leaked
  })

  it('shell store is READY synchronously with initialState', () => {
    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new MemoryStorage<State>({ name: `ready_${uid++}`, initialState }),
    })
    const shell = handle.buildSyncShell!()!
    expect(shell.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(shell.storage.getStateSync()).toEqual(initialState)
  })

  it('shell dispatcher actions mutate ONLY the shell store', () => {
    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new MemoryStorage<State>({ name: `disp_${uid++}`, initialState }),
      dispatcher: (s) => new LabelDispatcher(s),
    })
    const shell = handle.buildSyncShell!()!
    shell.actions.set('mutated')
    expect(shell.storage.getStateSync().label).toBe('mutated')
    const shell2 = handle.buildSyncShell!()!
    expect(shell2.storage.getStateSync().label).toBe('shell')
  })
})

describe('PROBE — wire rejection does not produce an unhandled rejection', () => {
  const orig = process.listeners('unhandledRejection')
  const seen: unknown[] = []
  const handler = (r: unknown) => seen.push(r)
  afterEach(() => {
    process.off('unhandledRejection', handler)
    vi.restoreAllMocks()
  })

  it('object-form wire reject: ready() rejects but no floating unhandledRejection', async () => {
    process.on('unhandledRejection', handler)
    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new MemoryStorage<State>({ name: `rej_${uid++}`, initialState }),
      wire: async () => {
        throw new Error('boom')
      },
    })
    // Trigger the pipeline but DON'T await (simulate ctx using onReady/onError only).
    handle.ready().catch(() => {})
    // Give microtasks + a macrotask for any floating rejection to surface.
    await new Promise((r) => setTimeout(r, 20))
    expect(seen, `unhandled rejections leaked: ${JSON.stringify(seen.map(String))}`).toEqual([])
  })
})

describe('PROBE — buildSyncShell after fork and after destroy', () => {
  it('fork carries shell; original destroy() does not break fork shell', async () => {
    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new MemoryStorage<State>({ name: `fk_${uid++}`, initialState }),
      dispatcher: (s) => new LabelDispatcher(s),
    })
    const forked = handle.fork()
    await handle.destroy()
    // Forked handle should still be able to build a shell (independent lifecycle).
    const shell = forked.buildSyncShell!()!
    expect(shell.storage.getStateSync()).toEqual(initialState)
    await shell.destroy()
  })

  it('buildSyncShell works even after the real store was built and destroyed', async () => {
    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new MemoryStorage<State>({ name: `re_${uid++}`, initialState }),
      dispatcher: (s) => new LabelDispatcher(s),
      wire: async () => ({}),
    })
    await handle.ready()
    await handle.destroy()
    const shell = handle.buildSyncShell!()!
    expect(shell.storage.initStatus.status).toBe(StorageStatus.READY)
    await shell.destroy()
  })
})
