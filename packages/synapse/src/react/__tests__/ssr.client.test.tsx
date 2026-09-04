// @vitest-environment jsdom
//
// SSR (клиентский путь): тот же снапшот, что отдал сервер, синхронно гидрирует стор
// ДО первого рендера → HTML совпадает → hydrateRoot не ругается на mismatch.
import { createElement, startTransition, StrictMode } from 'react'
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
  const handle = createSynapse<State, CtxDispatcher, CtxSelectors>({
    storage: () => new MemoryStorage<State>({ name: `ssrc_${uid++}`, initialState: { user: 'default' } }),
    dispatcher: (s) => new CtxDispatcher(s),
    selectors: (s) => new CtxSelectors(s),
  })
  return createSynapseCtx(handle, { loadingComponent: createElement('div', null, 'loading') })
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

  // Регрессия: общий клиентский main, провайдер A уже подписан. Маунт провайдера B (навигация
  // внутри того же app-root) с dehydratedState НЕ должен нотифицировать подписчиков A в фазе
  // рендера B → «Cannot update a component while rendering a different component».
  it('кросс-роутный маунт не триггерит setState подписчика во время рендера', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const user = useSelector(selectors.user)
      return createElement('span', null, `user:${user}`)
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const snapA = await ctx.dehydrate({ initialState: { user: 'alice' } })
    const snapB = await ctx.dehydrate({ initialState: { user: 'bob' } })

    // Единый app-root. Сначала на экране только провайдер A (первый маунт, подписан на общий main).
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(View as any, { key: 'a', dehydratedState: snapA }))
    })
    expect(container.textContent).toContain('user:alice')

    // Навигация: в том же дереве появляется провайдер B с другим снапшотом на том же сторе.
    // Если B сеет в фазе рендера — hydrate нотифицирует живого подписчика A → варнинг.
    await act(async () => {
      root.render([
        createElement(View as any, { key: 'a', dehydratedState: snapA }),
        createElement(View as any, { key: 'b', dehydratedState: snapB }),
      ])
    })

    const renderPhaseWarnings = errorSpy.mock.calls.filter((c) => String(c[0]).includes('while rendering a different component'))
    expect(renderPhaseWarnings).toEqual([])
  })

  // Идемпотентность засева на первом клиентском маунте: инициализатор useState сеет в рендере ОДИН
  // раз, повторный `seedClient` из useEffect — no-op (тот же снапшот по ссылке). Итог — ровно один hydrate.
  it('первый маунт сеет ровно один раз (useState init + useEffect не дублируют hydrate)', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const user = useSelector(selectors.user)
      return createElement('span', null, `user:${user}`)
    })

    const dehydrated = await ctx.dehydrate({ initialState: { user: 'alice' } })
    // Спай ставим ПОСЛЕ dehydrate — он форкает и сам зовёт hydrate на форке, эти вызовы не считаем.
    const hydrateSpy = vi.spyOn(MemoryStorage.prototype, 'hydrate')

    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(createElement(View as any, { dehydratedState: dehydrated }))
    })

    expect(container.textContent).toContain('user:alice')
    expect(hydrateSpy).toHaveBeenCalledTimes(1)
  })

  // Concurrent-рендер (React 18): монтирование второго провайдера внутри transition на общий стор
  // не клобберит и не роняет render-phase-варнинг — засев ушёл в commit-фазу.
  it('concurrent-маунт в startTransition не клобберит общий стор', async () => {
    const ctx = makeCtx()
    cleanups.push(ctx.cleanupSynapse)

    const View = ctx.contextSynapse(function View() {
      const selectors = ctx.useSynapseSelectors()
      const user = useSelector(selectors.user)
      return createElement('span', null, `user:${user}`)
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Явные метки свежести: B строго новее A → мердж-по-свежести применит B (иначе равные Date.now() дали бы skip).
    const snapA = await ctx.dehydrate({ initialState: { user: 'alice' }, hydratedAt: 1000 })
    const snapB = await ctx.dehydrate({ initialState: { user: 'bob' }, hydratedAt: 2000 })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(View as any, { key: 'a', dehydratedState: snapA }))
    })

    await act(async () => {
      startTransition(() => {
        root.render([
          createElement(View as any, { key: 'a', dehydratedState: snapA }),
          createElement(View as any, { key: 'b', dehydratedState: snapB }),
        ])
      })
    })

    const renderPhaseWarnings = errorSpy.mock.calls.filter((c) => String(c[0]).includes('while rendering a different component'))
    expect(renderPhaseWarnings).toEqual([])
    // Общий стор сведён к свежему снапшоту B, оба провайдера показывают его.
    expect(container.textContent).toContain('user:bob')
    expect(container.textContent).not.toContain('user:alice')
  })
})
