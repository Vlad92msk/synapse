// @vitest-environment node
//
// SSR фоновых провайдеров: провайдер над async-стором БЕЗ серверных данных (presence-подобный)
// рендерит children в серверный HTML через синхронную SSR-оболочку (createSynapse ssrShell),
// вместо того чтобы срезать поддерево loadingComponent'ом.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loggerConsole } from '../../_utils/logger-console.util'
import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { Selectors } from '../../core/selector/selectors.base'
import { Dispatcher } from '../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../../utils'
import { useSelector } from '../hooks/useSelector'
import { createSynapseCtx } from '../utils/createSynapseCtx'

interface State extends Record<string, any> {
  online: boolean
  count: number
}

const initialState: State = { online: false, count: 0 }

class PresenceDispatcher extends Dispatcher<State> {
  readonly go = this.action((store) => store.update((s) => (s.online = true)))
}
class PresenceSelectors extends Selectors<State> {
  readonly online = this.select((s) => s.online)
}

let uid = 0

// Фоновый синапс: async-фабрика НЕ резолвится синхронно (эмулирует await зависимостей),
// зато есть ssrShell для синхронного серверного рендера.
const makeBackgroundCtx = (withShell = true) => {
  const name = `presence_${uid++}`
  const handle = createSynapse<State, PresenceDispatcher, PresenceSelectors>(
    async () => {
      // Async, но резолвится на микрозадаче: на синхронном серверном кадре стор всё равно НЕ
      // готов (renderToString синхронен) → проверяем поведение оболочки/гейта; при этом
      // cleanupSynapse не виснет в ожидании долгого таймера.
      await Promise.resolve()
      const storage = new MemoryStorage<State>({ name, initialState })
      return { storage, dispatcher: new PresenceDispatcher(storage), selectors: new PresenceSelectors(storage) }
    },
    withShell
      ? {
          ssrShell: () => {
            const storage = new MemoryStorage<State>({ name: `${name}_shell`, initialState })
            return { storage, dispatcher: new PresenceDispatcher(storage), selectors: new PresenceSelectors(storage) }
          },
        }
      : undefined,
  )
  return createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('div', null, 'LOADING') })
}

describe('SSR — фоновый провайдер через ssrShell', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
  })

  it('рендерит children на сервере (не loadingComponent), хотя async-стор не готов', () => {
    const ctx = makeBackgroundCtx()
    cleanups.push(ctx.cleanupSynapse)

    const Provider = ctx.contextSynapse(function Provider({ children }: { children?: React.ReactNode }) {
      return createElement('section', null, children)
    })

    const html = renderToString(createElement(Provider as any, null, createElement('span', null, 'CONTENT')))

    expect(html).toContain('CONTENT') // поддерево в HTML
    expect(html).not.toContain('LOADING') // гейт не сработал
  })

  it('оболочка отдаёт initialState селекторам на сервере', () => {
    const ctx = makeBackgroundCtx()
    cleanups.push(ctx.cleanupSynapse)

    const Provider = ctx.contextSynapse(function Provider() {
      const selectors = ctx.useSynapseSelectors()
      const online = useSelector(selectors.online)
      return createElement('span', null, `online:${String(online)}`)
    })

    const html = renderToString(createElement(Provider as any))
    expect(html).toContain('online:false')
  })

  it('без ssrShell флаг ssr — no-op: гейт рендерит loadingComponent', () => {
    const ctx = makeBackgroundCtx(false)
    cleanups.push(ctx.cleanupSynapse)

    const Provider = ctx.contextSynapse(function Provider({ children }: { children?: React.ReactNode }) {
      return createElement('section', null, children)
    })

    const html = renderToString(createElement(Provider as any, null, createElement('span', null, 'CONTENT')))
    expect(html).toContain('LOADING')
    expect(html).not.toContain('CONTENT')
  })

  it('нет request bleed: параллельные серверные рендеры не делят стор оболочки', () => {
    const ctx = makeBackgroundCtx()
    cleanups.push(ctx.cleanupSynapse)

    const Provider = ctx.contextSynapse(function Provider() {
      const selectors = ctx.useSynapseSelectors()
      const online = useSelector(selectors.online)
      return createElement('span', null, `online:${String(online)}`)
    })

    const a = renderToString(createElement(Provider as any))
    const b = renderToString(createElement(Provider as any))
    // Оба видят чистый initialState — ни один не «протёк» в другой.
    expect(a).toContain('online:false')
    expect(b).toContain('online:false')
  })
})

// ─── Объектная форма: авто-вывод оболочки + серверный рендер ─────────────────────────────
describe('SSR — объектная форма createSynapse (авто-оболочка)', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
  })

  it('провайдер объектной формы рендерит children на сервере без ручного ssrShell', () => {
    const handle = createSynapse<State, PresenceDispatcher, PresenceSelectors>({
      storage: () => new MemoryStorage<State>({ name: `presence_obj_${uid++}`, initialState }),
      dispatcher: (s) => new PresenceDispatcher(s),
      selectors: (s) => new PresenceSelectors(s),
      wire: async () => {
        await Promise.resolve()
        return {}
      },
    })
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('div', null, 'LOADING') })
    cleanups.push(ctx.cleanupSynapse)

    const Provider = ctx.contextSynapse(function Provider() {
      const online = useSelector(ctx.useSynapseSelectors().online)
      return createElement('span', null, `online:${String(online)}`)
    })

    const html = renderToString(createElement(Provider as any))
    expect(html).toContain('online:false') // оболочка отрендерила children
    expect(html).not.toContain('LOADING')
  })
})

// ─── Dev-варнинг: ssr:true без ssrShell ──────────────────────────────────────────────────
describe('SSR — dev-варнинг про ssr:true без ssrShell', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
    vi.restoreAllMocks()
  })

  it('варнит один раз, когда ssr:true, стор не готов и оболочки нет', () => {
    const warn = vi.spyOn(loggerConsole, 'warn').mockImplementation(() => {})

    const handle = createSynapse<State, PresenceDispatcher, PresenceSelectors>(async () => {
      await Promise.resolve()
      const storage = new MemoryStorage<State>({ name: `noshell_warn_${uid++}`, initialState })
      return { storage, dispatcher: new PresenceDispatcher(storage), selectors: new PresenceSelectors(storage) }
    })
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('div', null, 'LOADING') })
    cleanups.push(ctx.cleanupSynapse)
    const Provider = ctx.contextSynapse(function Provider() {
      return createElement('span', null, 'x')
    })

    renderToString(createElement(Provider as any))
    renderToString(createElement(Provider as any))

    const hits = warn.mock.calls.filter((c) => String(c[0]).includes('ssrShell'))
    expect(hits).toHaveLength(1) // один раз, не на каждый рендер
  })

  it('НЕ варнит для объектной формы (оболочка есть)', () => {
    const warn = vi.spyOn(loggerConsole, 'warn').mockImplementation(() => {})

    const handle = createSynapse<State, PresenceDispatcher, PresenceSelectors>({
      storage: () => new MemoryStorage<State>({ name: `obj_nowarn_${uid++}`, initialState }),
      dispatcher: (s) => new PresenceDispatcher(s),
      selectors: (s) => new PresenceSelectors(s),
    })
    const ctx = createSynapseCtx(handle, { ssr: true })
    cleanups.push(ctx.cleanupSynapse)
    const Provider = ctx.contextSynapse(function Provider() {
      return createElement('span', null, 'x')
    })

    renderToString(createElement(Provider as any))
    const hits = warn.mock.calls.filter((c) => String(c[0]).includes('ssrShell'))
    expect(hits).toHaveLength(0)
  })
})
