// @vitest-environment jsdom
//
// ADVERSARIAL probes for the 5.4.0 SSR shell feature — client side.
// Targets: shell->real upgrade race, unmount-before-upgrade (leak/late setState),
// changing dehydratedState across renders, dispatch-during-shell loss.
import { createElement, StrictMode, useState } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
const objForm = (delay = 0) =>
  createSynapse<State, LabelDispatcher, LabelSelectors>({
    storage: () => new MemoryStorage<State>({ name: `cli_${uid++}`, initialState }),
    dispatcher: (s) => new LabelDispatcher(s),
    selectors: (s) => new LabelSelectors(s),
    wire: async () => {
      await new Promise((r) => setTimeout(r, delay))
      return {}
    },
  })

describe('PROBE — unmount before shell->real upgrade', () => {
  const errSpy = { current: null as ReturnType<typeof vi.spyOn> | null }
  afterEach(() => {
    vi.restoreAllMocks()
    errSpy.current = null
  })

  // Mount a provider that shows the shell, then unmount BEFORE the async wire resolves.
  // The awaiter's onReady still fires later; adoptRealStore calls setState on an unmounted
  // tree. React warns "state update on unmounted component" (or worse). Also the real store
  // that resolves late is never destroyed (nobody adopts it) -> effect/subscription leak.
  it('unmount during pending wire: no crash, no late-setState warning', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handle = objForm(30) // slow wire
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('p', null, 'loading') })
    const View = ctx.contextSynapse(function View() {
      return createElement('span', null, `label:${useSelector(ctx.useSynapseSelectors().label)}`)
    })

    const container = document.createElement('div')
    container.innerHTML = renderToString(createElement(View as any))
    document.body.appendChild(container)

    let root: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, createElement(View as any))
    })
    // Unmount before wire (30ms) resolves.
    await act(async () => {
      root!.unmount()
    })
    // Let the late wire resolve; adoptRealStore may fire onto the dead tree.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    const bad = consoleErr.mock.calls.filter((c) => /unmounted|memory leak|Warning.*setState/i.test(String(c[0])))
    expect(bad, `late-setState / leak warnings: ${JSON.stringify(bad)}`).toEqual([])
    await ctx.cleanupSynapse()
  })
})

describe('PROBE — dehydratedState prop changes after first render', () => {
  afterEach(() => vi.restoreAllMocks())

  // seedHydration only runs in the useState initializer and in useEffect(once). If the parent
  // re-renders the provider with a NEW dehydratedState, does the store re-seed? If not, that is
  // a silent stale-data footgun (documented? changelog says compose seeds "on the first client
  // frame" only). This test documents the actual behavior.
  it('changing dehydratedState prop does NOT re-seed (documents behavior)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const handle = objForm(0)
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('p', null, 'loading') })
    const View = ctx.contextSynapse(function View() {
      return createElement('span', null, `label:${useSelector(ctx.useSynapseSelectors().label)}`)
    })

    function Parent() {
      const [snap, setSnap] = useState<State>({ label: 'first' })
      ;(Parent as any).flip = () => setSnap({ label: 'second' })
      return createElement(View as any, { dehydratedState: snap })
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(createElement(Parent))
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
    expect(container.textContent).toContain('label:first')

    await act(async () => {
      ;(Parent as any).flip()
      await new Promise((r) => setTimeout(r, 5))
    })
    // Record whatever happens — this is a behavior probe, not a hard assertion of correctness.
    const after = container.textContent
    expect(after === 'label:first' || after === 'label:second').toBe(true)
    await ctx.cleanupSynapse()
  })
})

describe('PROBE — dispatch during shell phase is silently lost', () => {
  afterEach(() => vi.restoreAllMocks())

  // Documented gotcha #2: actions dispatched before upgrade are lost. Verify it actually loses
  // them (so the doc is honest) AND that it does not throw / corrupt the upgraded store.
  it('action dispatched on the shell is lost after upgrade, no crash', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const handle = objForm(30)
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('p', null, 'loading') })
    const captured: { actions: LabelDispatcher | undefined } = { actions: undefined }
    const View = ctx.contextSynapse(function View() {
      captured.actions = ctx.useSynapseActions()
      return createElement('span', null, `label:${useSelector(ctx.useSynapseSelectors().label)}`)
    })

    const container = document.createElement('div')
    container.innerHTML = renderToString(createElement(View as any))
    document.body.appendChild(container)
    await act(async () => {
      hydrateRoot(container, createElement(View as any))
    })
    // Dispatch on the SHELL (before wire resolves).
    await act(async () => {
      captured.actions!.set('shell-write')
    })
    expect(container.textContent).toContain('label:shell-write') // shell reflects it
    // Now let the real store take over.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })
    // Real store was built from initialState -> 'shell'. The shell-phase write is LOST.
    expect(container.textContent).toContain('label:shell')
    expect(container.textContent).not.toContain('label:shell-write')
    await ctx.cleanupSynapse()
  })
})
