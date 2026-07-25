// @vitest-environment jsdom
//
// SSR-оболочка на клиенте: первый кадр гидрации === серверный (оболочка с initialState) →
// нет hydration mismatch; когда реальный async-стор достраивается, контекст бесшовно
// переключается на него (upgrade) уже после гидрации.
import { createElement, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
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

let uid = 0

class LabelDispatcher extends Dispatcher<State> {
  readonly set = this.action((store, label: string) => store.update((s) => (s.label = label)))
}
class LabelSelectors extends Selectors<State> {
  readonly label = this.select((s) => s.label)
}

// Оболочка стартует с label:'shell'; реальный async-стор — с label:'real'. Так виден момент
// апгрейда: сервер и первый клиентский кадр показывают 'shell', после готовности — 'real'.
const makeCtx = () => {
  const name = `shellc_${uid++}`
  const handle = createSynapse<State, LabelDispatcher, LabelSelectors>(
    async () => {
      await Promise.resolve()
      const storage = new MemoryStorage<State>({ name, initialState: { label: 'real' } })
      return { storage, dispatcher: new LabelDispatcher(storage), selectors: new LabelSelectors(storage) }
    },
    {
      ssrShell: () => {
        const storage = new MemoryStorage<State>({ name: `${name}_shell`, initialState: { label: 'shell' } })
        return { storage, dispatcher: new LabelDispatcher(storage), selectors: new LabelSelectors(storage) }
      },
    },
  )
  return createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('div', null, 'loading') })
}

describe('SSR-оболочка — клиентская гидрация и апгрейд', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
    vi.restoreAllMocks()
  })

  it('первый кадр === сервер (нет mismatch), затем апгрейд на реальный стор', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const label = useSelector(selectors.label)
      return createElement('span', null, `label:${label}`)
    })

    // Сервер: оболочка → 'shell'.
    const serverHtml = renderToString(createElement(View as any))
    expect(serverHtml).toContain('label:shell')

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)

    await act(async () => {
      hydrateRoot(container, createElement(StrictMode, null, createElement(View as any)))
    })

    // Апгрейд состоялся: реальный стор ('real') заменил оболочку.
    expect(container.textContent).toContain('label:real')

    // Первый кадр совпал с сервером → React не ругался на hydration mismatch.
    const mismatchWarnings = errorSpy.mock.calls.filter((c) => String(c[0]).toLowerCase().includes('hydrat'))
    expect(mismatchWarnings).toEqual([])
  })

  it('после апгрейда стор живой: action меняет состояние', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const actions = ctx.useSynapseActions()
      const label = useSelector(selectors.label)
      return createElement('button', { onClick: () => actions.set('clicked') }, `label:${label}`)
    })

    const serverHtml = renderToString(createElement(View as any))
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)

    await act(async () => {
      hydrateRoot(container, createElement(View as any))
    })
    expect(container.textContent).toContain('label:real')

    await act(async () => {
      container.querySelector('button')!.click()
    })
    expect(container.textContent).toContain('label:clicked')
  })
})
