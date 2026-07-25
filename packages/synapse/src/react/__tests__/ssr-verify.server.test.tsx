// @vitest-environment node
//
// ADVERSARIAL probes for the 5.4.0 SSR shell feature — server side.
// Goal: BREAK request isolation, the shell/real-store boundary, and the
// dehydratedState composition. A failing test here = a real bug.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loggerConsole } from '../../_utils/logger-console.util'
import { LocalStorage } from '../../core/storage/adapters/local-storage.service'
import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { Selectors } from '../../core/selector/selectors.base'
import { Dispatcher } from '../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../../utils'
import { useSelector } from '../hooks/useSelector'
import { createSynapseCtx } from '../utils/createSynapseCtx'

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

// A data-store synapse whose real store resolves SYNCHRONOUSLY-ish: wire resolves
// immediately so once warmed via dehydrate/ready the main singleton snapshot is READY.
const dataSynapse = () =>
  createSynapse<State, LabelDispatcher, LabelSelectors>({
    storage: () => new MemoryStorage<State>({ name: `data_${uid++}`, initialState }),
    dispatcher: (s) => new LabelDispatcher(s),
    selectors: (s) => new LabelSelectors(s),
    wire: async () => ({}),
  })

describe('PROBE — cross-request bleed when the MAIN singleton store is warm', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
    vi.restoreAllMocks()
  })

  // The audit "isolation" test used wire that never resolves, so getSnapshot() is undefined
  // and the render always falls back to a per-instance SHELL (isolated by construction).
  // But a data store is normally WARMED on the server (dehydrateModule(module,{ssr:true})
  // readies the process-global main singleton). Once warm, resolveAwaiter().getStoreIfReady()
  // returns the SHARED singleton, and seedHydration() hydrates THAT shared store with the
  // per-request dehydratedState. Two concurrent requests then race on one store.
  it('two concurrent renders with different dehydratedState must not share state (warm singleton)', async () => {
    const handle = dataSynapse()
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('p', null, 'loading') })
    cleanups.push(ctx.cleanupSynapse)

    // Warm the process-global main singleton (this is what dehydrateModule(module,{ssr:true}) does).
    const main = await handle.ready({ withEffects: false })
    expect(main.storage.initStatus.status).toBeTruthy()

    const View = ctx.contextSynapse(function View() {
      return createElement('span', null, `label:${useSelector(ctx.useSynapseSelectors().label)}`)
    })

    const a = renderToString(createElement(View as any, { dehydratedState: { label: 'alice' } as State }))
    const b = renderToString(createElement(View as any, { dehydratedState: { label: 'bob' } as State }))

    expect(a).toContain('label:alice')
    expect(b).toContain('label:bob')

    // DIRECT evidence of bleed: the per-tree awaiter wraps synapseModule.getSnapshot() (the
    // process-global warm singleton). seedHydration() hydrates THAT shared store. After both
    // renders the singleton must NOT retain per-request data 'bob' — that is request state
    // leaking into a process-global object.
    expect(main.storage.getStateSync().label, 'MAIN SINGLETON was mutated by a per-request render').toBe('shell')

    // And a background consumer (no dehydratedState) shares the same singleton snapshot.
    const c = renderToString(createElement(View as any))
    expect(c).toContain('label:shell')
  })
})

describe('PROBE — dehydrate({ssr:true}) leaves the singleton hydrated with request data', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
    vi.restoreAllMocks()
  })

  // Documented SSR flow: ctx.dehydrate({...}) with ssr:true readies the process-global main
  // singleton and hydrates it with THIS request's data. That data persists on the shared
  // singleton after the call returns — so a concurrent request that reads the singleton
  // snapshot (background provider, or a race) sees another request's data.
  it('after dehydrate, handle.getSnapshot() holds this request data (shared mutable server state)', async () => {
    const handle = dataSynapse()
    const ctx = createSynapseCtx(handle, { ssr: true })
    cleanups.push(ctx.cleanupSynapse)

    await ctx.dehydrate({ initialState: { label: 'A-data' } as Partial<State> })
    // The process-global singleton is now hydrated with request A's private data.
    expect(handle.getSnapshot()?.storage.getStateSync().label).toBe('A-data')
  })
})

describe('PROBE — LocalStorage shell on the server (no localStorage global)', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
    vi.restoreAllMocks()
  })

  // ssrShell requires a SYNC storage. LocalStorage IS sync (isSync=true, has initializeSync),
  // so object-form/ssrShell will happily attach buildSyncShell. But on the server there is NO
  // `localStorage` global → initializeSync() -> initializeWithMiddlewares -> doGet touches
  // localStorage -> ReferenceError. Does the provider degrade gracefully or 500?
  it('LocalStorage-backed shell on server does not crash renderToString', () => {
    vi.spyOn(loggerConsole, 'warn').mockImplementation(() => {})
    vi.spyOn(loggerConsole, 'error').mockImplementation(() => {})

    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new LocalStorage<State>({ name: `ls_${uid++}`, initialState }),
      dispatcher: (s) => new LabelDispatcher(s),
      selectors: (s) => new LabelSelectors(s),
      wire: async () => ({}),
    })
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('p', null, 'loading') })
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      return createElement('span', null, `label:${useSelector(ctx.useSynapseSelectors().label)}`)
    })

    const hasLocalStorage = typeof (globalThis as any).localStorage !== 'undefined'
    let html = ''
    expect(() => {
      html = renderToString(createElement(View as any))
    }).not.toThrow()
    if (!hasLocalStorage) {
      // No localStorage global on the server -> initializeSync throws -> degrade to loading.
      expect(html).toContain('loading')
    } else {
      expect(html.length).toBeGreaterThan(0)
    }
  })
})
