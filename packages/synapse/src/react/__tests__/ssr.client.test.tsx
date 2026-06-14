// @vitest-environment jsdom
//
// SSR (клиентский путь): тот же снапшот, что отдал сервер, синхронно гидрирует стор
// ДО первого рендера → HTML совпадает → hydrateRoot не ругается на mismatch.
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
  user: string
}

let uid = 0

class CtxDispatcher extends Dispatcher<State> {
  readonly setUser = this.action((store, user: string) => store.update((s) => (s.user = user)))
}
class CtxSelectors extends Selectors<State> {
  readonly user = this.select((s) => s.user)
}

const makeCtx = () => {
  const handle = createSynapse<State, CtxDispatcher, CtxSelectors>(() => {
    const storage = new MemoryStorage<State>({ name: `ssrc_${uid++}`, initialState: { user: 'default' } })
    return { storage, dispatcher: new CtxDispatcher(storage), selectors: new CtxSelectors(storage) }
  })
  return createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('div', null, 'loading') })
}

describe('SSR — клиентская гидрация', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
    vi.restoreAllMocks()
  })

  it('гидрация тем же снапшотом не даёт hydration mismatch', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const user = useSelector(selectors.user)
      return createElement('span', null, `user:${user}`)
    })

    // 1) Сервер: снапшот + HTML (тот же контур, что в реальном SSR).
    const dehydrated = await ctx.dehydrate({ initialState: { user: 'alice' } })
    const serverHtml = renderToString(createElement(View as any, { dehydratedState: dehydrated }))
    expect(serverHtml).toContain('user:alice')

    // React предупреждает о mismatch через console.error — ловим, чтобы провалить тест.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // 2) Клиент: тот же снапшот приезжает пропом и засевается ДО первого рендера.
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)

    await act(async () => {
      hydrateRoot(container, createElement(StrictMode, null, createElement(View as any, { dehydratedState: dehydrated })))
    })

    // Контент на месте, никакого mismatch-варнинга.
    expect(container.textContent).toContain('user:alice')
    const mismatchWarnings = errorSpy.mock.calls.filter((c) => String(c[0]).toLowerCase().includes('hydrat'))
    expect(mismatchWarnings).toEqual([])
  })

  it('после гидрации стор живой: action меняет состояние на клиенте', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const actions = ctx.useSynapseActions()
      const user = useSelector(selectors.user)
      return createElement('button', { onClick: () => actions.setUser('bob') }, `user:${user}`)
    })

    const dehydrated = await ctx.dehydrate({ initialState: { user: 'alice' } })
    const serverHtml = renderToString(createElement(View as any, { dehydratedState: dehydrated }))

    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)

    await act(async () => {
      hydrateRoot(container, createElement(View as any, { dehydratedState: dehydrated }))
    })
    expect(container.textContent).toContain('user:alice')

    await act(async () => {
      container.querySelector('button')!.click()
    })
    expect(container.textContent).toContain('user:bob')
  })
})
