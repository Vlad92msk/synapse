// @vitest-environment node
//
// SSR (серверный путь): renderToString засеянного sync-стора отдаёт контент в HTML,
// а параллельные запросы с разными снапшотами изолированы (нет request bleed).
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { Selectors } from '../../core/selector/selectors.base'
import { Dispatcher } from '../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../../utils'
import { useSelector } from '../hooks/useSelector'
import { createSynapseCtx } from '../utils/createSynapseCtx'

interface State extends Record<string, any> {
  user: string
  count: number
}

let uid = 0

class PostsDispatcher extends Dispatcher<State> {
  readonly inc = this.action((store) => store.update((s) => (s.count += 1)))
}
class PostsSelectors extends Selectors<State> {
  readonly user = this.select((s) => s.user)
  readonly count = this.select((s) => s.count)
}

const makeCtx = () => {
  const handle = createSynapse<State, PostsDispatcher, PostsSelectors>(() => {
    const storage = new MemoryStorage<State>({ name: `ssr_${uid++}`, initialState: { user: 'default', count: 0 } })
    return { storage, dispatcher: new PostsDispatcher(storage), selectors: new PostsSelectors(storage) }
  })
  return createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('div', { 'data-testid': 'loading' }, 'loading') })
}

describe('SSR — серверный renderToString', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
  })

  it('Memory-синапс с ssr:true и dehydrate рендерит контент в серверном HTML', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const user = useSelector(selectors.user)
      return createElement('span', null, `user:${user}`)
    })

    const dehydrated = await ctx.dehydrate({ initialState: { user: 'alice', count: 5 } })
    expect(dehydrated).toEqual({ user: 'alice', count: 5 })

    const html = renderToString(createElement(View as any, { dehydratedState: dehydrated }))
    // Контент в HTML, не loadingComponent.
    expect(html).toContain('user:alice')
    expect(html).not.toContain('loading')
  })

  it('нет request bleed: два параллельных рендера с разными снапшотами изолированы', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const user = useSelector(selectors.user)
      return createElement('span', null, `user:${user}`)
    })

    // Снапшоты двух «запросов».
    const a = await ctx.dehydrate({ initialState: { user: 'alice', count: 1 } })
    const b = await ctx.dehydrate({ initialState: { user: 'bob', count: 2 } })

    const htmlA = renderToString(createElement(View as any, { dehydratedState: a }))
    const htmlB = renderToString(createElement(View as any, { dehydratedState: b }))

    expect(htmlA).toContain('user:alice')
    expect(htmlA).not.toContain('user:bob')
    expect(htmlB).toContain('user:bob')
    expect(htmlB).not.toContain('user:alice')
  })

  it('dehydrate форкает модуль — снапшоты независимы между собой', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const a = await ctx.dehydrate({ initialState: { user: 'alice', count: 1 } })
    const b = await ctx.dehydrate({ initialState: { user: 'bob', count: 2 } })

    expect(a).toEqual({ user: 'alice', count: 1 })
    expect(b).toEqual({ user: 'bob', count: 2 })
  })
})
