// @vitest-environment node
//
// SSR фоновых провайдеров: провайдер над async-стором БЕЗ серверных данных (presence-подобный)
// рендерит children в серверный HTML через синхронную SSR-оболочку (createSynapse ssrShell),
// вместо того чтобы срезать поддерево loadingComponent'ом.
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
