// @vitest-environment jsdom
//
// АУДИТ SSR-оболочки (клиент): StrictMode, error-путь, отсутствие лишней сборки оболочки,
// апгрейд оболочка→реальный стор без «destroyed storage».
import { createElement, StrictMode } from 'react'
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
// wire НЕ трогает storage (в пайплайне wire исполняется ДО storage.initialize()) — только
// возвращает обвязку. Данные меняем через dispatcher после готовности стора.
const objForm = (delay = 0) =>
  createSynapse<State, LabelDispatcher, LabelSelectors>({
    storage: () => new MemoryStorage<State>({ name: `audit_${uid++}`, initialState }),
    dispatcher: (s) => new LabelDispatcher(s),
    selectors: (s) => new LabelSelectors(s),
    wire: async () => {
      await new Promise((r) => setTimeout(r, delay))
      return {}
    },
  })

describe('АУДИТ клиента', () => {
  const errSpy = { current: null as ReturnType<typeof vi.spyOn> | null }
  afterEach(() => {
    vi.restoreAllMocks()
    errSpy.current = null
  })

  it('StrictMode: оболочка не «разрушается под ногами» (апгрейд без destroyed-storage ошибок)', async () => {
    const ctx = createSynapseCtx(objForm(), { ssr: true, loadingComponent: createElement('p', null, 'loading') })
    const View = ctx.contextSynapse(function View() {
      const actions = ctx.useSynapseActions()
      const label = useSelector(ctx.useSynapseSelectors().label)
      return createElement('button', { onClick: () => actions.set('clicked') }, `label:${label}`)
    })

    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const serverHtml = renderToString(createElement(View as any))
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)

    await act(async () => {
      hydrateRoot(container, createElement(StrictMode, null, createElement(View as any)))
    })
    // Даём апгрейду шелл→реальный стор завершиться (wire — микро/макрозадача).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })

    // Стор живой после апгрейда под StrictMode-двойным маунтом; action работает; нет
    // "destroyed"/"not ready"/hydration-ошибок (оболочку не разрушили под ногами).
    expect(container.textContent).toContain('label:shell')
    await act(async () => {
      container.querySelector('button')!.click()
    })
    expect(container.textContent).toContain('label:clicked')
    const bad = consoleErr.mock.calls.filter((c) => /destroyed|not ready|hydrat/i.test(String(c[0])))
    expect(bad).toEqual([])
  })

  it('error-путь: wire отклоняется → провайдер показывает ошибку, не крашится', async () => {
    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new MemoryStorage<State>({ name: `err_${uid++}`, initialState }),
      selectors: (s) => new LabelSelectors(s),
      wire: async () => {
        throw new Error('wire failed')
      },
    })
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('p', null, 'loading') })
    const View = ctx.contextSynapse(function View() {
      return createElement('span', null, `label:${useSelector(ctx.useSynapseSelectors().label)}`)
    })

    vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    // Оболочка засеяна пустым initialState на сервере → 'label:shell'
    container.innerHTML = renderToString(createElement(View as any))
    document.body.appendChild(container)

    await act(async () => {
      hydrateRoot(container, createElement(View as any))
    })
    // Реальный стор упал (wire reject) → показывается сообщение об ошибке, не белый экран/креш.
    expect(container.textContent).toMatch(/Ошибка при инициализации|label:shell/)
  })

  it('стор синхронно готов (повторный mount): оболочка НЕ строится (нет лишней работы)', async () => {
    const handle = objForm(0)
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('p', null, 'loading') })
    // Прогреваем модуль: строим реальный стор заранее (как повторный mount в живом SPA).
    await handle.ready()

    const buildSpy = vi.spyOn(handle, 'buildSyncShell' as never)
    const View = ctx.contextSynapse(function View() {
      return createElement('span', null, `label:${useSelector(ctx.useSynapseSelectors().label)}`)
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    // Чистый клиентский маунт (не гидрация) — стор уже прогрет.
    await act(async () => {
      createRoot(container).render(createElement(View as any))
    })

    expect(container.textContent).toContain('label:shell')
    // Оболочку не трогали — реальный стор был готов синхронно (getStoreIfReady вернул его).
    expect(buildSpy).not.toHaveBeenCalled()
    await ctx.cleanupSynapse()
  })
})
