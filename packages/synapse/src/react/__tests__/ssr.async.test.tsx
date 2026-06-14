// @vitest-environment jsdom
//
// SSR + async-стор (IndexedDB): серверного контента нет (прежний гейт loadingComponent),
// но без краша и без request bleed; на клиенте стор доезжает до готовности.
import 'fake-indexeddb/auto'

import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { IndexedDBStorage } from '../../core/storage/adapters/indexed-DB.service'
import { Selectors } from '../../core/selector/selectors.base'
import { Dispatcher } from '../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../../utils'
import { useSelector } from '../hooks/useSelector'
import { createSynapseCtx } from '../utils/createSynapseCtx'

interface State extends Record<string, any> {
  value: string
}

let uid = 0

class CtxDispatcher extends Dispatcher<State> {}
class CtxSelectors extends Selectors<State> {
  readonly value = this.select((s) => s.value)
}

const makeCtx = () => {
  const handle = createSynapse<State, CtxDispatcher, CtxSelectors>(() => {
    const storage = new IndexedDBStorage<State>({
      name: `ssr_idb_${uid}`,
      initialState: { value: 'loaded' },
      options: { dbName: `ssr_idb_db_${uid++}` },
    })
    return { storage, dispatcher: new CtxDispatcher(storage), selectors: new CtxSelectors(storage) }
  })
  return createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('div', { 'data-testid': 'loading' }, 'loading') })
}

describe('SSR — async-стор (IndexedDB)', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
  })

  it('dehydrate async-стора собирает снапшот через fork без краша', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    // hydrate для IndexedDB асинхронный — dehydrate его дожидается → корректный снапшот.
    const dehydrated = await ctx.dehydrate({ initialState: { value: 'server' } })
    expect(dehydrated).toEqual({ value: 'server' })
  })

  it('серверный renderToString не падает (async-стор, без request-bleed)', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const value = useSelector(selectors.value)
      return createElement('span', null, `value:${value}`)
    })

    const dehydrated = await ctx.dehydrate({ initialState: { value: 'server' } })
    // Главное для async-пути: рендер не крашится, а если стор успел инициализироваться —
    // в HTML именно переданный снапшот (никаких чужих данных).
    const html = renderToString(createElement(View as any, { dehydratedState: dehydrated }))
    expect(html).not.toContain('value:other')
  })

  it('на клиенте async-стор доезжает до готовности и рендерит контент', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const value = useSelector(selectors.value)
      return createElement('span', { 'data-testid': 'val' }, `value:${value}`)
    })

    render(createElement(View as any))

    // Сначала гейт.
    expect(screen.getByTestId('loading')).toBeInTheDocument()

    // Потом async-инициализация доводит до готовности.
    await waitFor(() => expect(screen.getByTestId('val')).toBeInTheDocument())
    expect(screen.getByTestId('val').textContent).toBe('value:loaded')
  })
})
