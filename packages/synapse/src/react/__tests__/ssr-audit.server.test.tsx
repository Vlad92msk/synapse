// @vitest-environment node
//
// АУДИТ SSR-оболочки (серверная сторона): состязательные кейсы по матрице
// ssr × dehydratedState × shell × sync/async storage. Цель — поймать то, что happy-path тесты
// пропускают (именно так утекали реальные баги).
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loggerConsole } from '../../_utils/logger-console.util'
import { IndexedDBStorage } from '../../core/storage/adapters/indexed-DB.service'
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

describe('АУДИТ — async-хранилище (IndexedDB) в объектной форме + ssr:true', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
    vi.restoreAllMocks()
  })

  // РИСК: объектная форма ВСЕГДА вешает buildSyncShell (не зная, sync ли storage). Если storage
  // async (IndexedDB), buildSyncShell бросит на initializeSync. Вопрос: рушит ли это серверный
  // рендер (500), или откатывается к loadingComponent gracefully?
  it('не рушит серверный рендер: откат к loadingComponent + варнинг (а не throw/500)', () => {
    const warn = vi.spyOn(loggerConsole, 'warn').mockImplementation(() => {})

    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new IndexedDBStorage<State>({ name: `idb_${uid++}`, initialState, options: { dbName: `db_${uid++}` } }),
      dispatcher: (s) => new LabelDispatcher(s),
      selectors: (s) => new LabelSelectors(s),
    })
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('p', null, 'loading') })
    cleanups.push(ctx.cleanupSynapse)

    const Provider = ctx.contextSynapse(function Provider() {
      return createElement('span', null, 'x')
    })

    // Не должно кидать. Должно отрендерить loadingComponent (async-стору синхронного SSR нет).
    let html = ''
    expect(() => {
      html = renderToString(createElement(Provider as any))
    }).not.toThrow()
    expect(html).toContain('loading')
    // Должен объяснить причину (не удалось синхронно построить оболочку), а не молча деградировать.
    expect(warn.mock.calls.some((c) => String(c[0]).includes('SSR-оболочку'))).toBe(true)
  })
})

describe('АУДИТ — изоляция засеянной оболочки между параллельными серверными рендерами', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
  })

  // РИСК: composе-фикс сеет dehydratedState в оболочку. Два параллельных запроса с РАЗНЫМИ
  // снапшотами не должны пересечься (каждый провайдер-инстанс строит свою оболочку).
  it('два рендера с разными dehydratedState → изолированный контент', () => {
    // wire не резолвится → всегда путь оболочки (реальный стор не готов на сервере).
    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new MemoryStorage<State>({ name: `iso_${uid++}`, initialState }),
      dispatcher: (s) => new LabelDispatcher(s),
      selectors: (s) => new LabelSelectors(s),
      wire: () => new Promise(() => {}),
    })
    const ctx = createSynapseCtx(handle, { ssr: true, loadingComponent: createElement('p', null, 'loading') })

    const View = ctx.contextSynapse(function View() {
      return createElement('span', null, `label:${useSelector(ctx.useSynapseSelectors().label)}`)
    })

    const a = renderToString(createElement(View as any, { dehydratedState: { label: 'alice' } as State }))
    const b = renderToString(createElement(View as any, { dehydratedState: { label: 'bob' } as State }))

    expect(a).toContain('label:alice')
    expect(a).not.toContain('label:bob')
    expect(b).toContain('label:bob')
    expect(b).not.toContain('label:alice')
  })
})

describe('АУДИТ — object-form fork переносит авто-оболочку', () => {
  it('forked handle тоже умеет buildSyncShell', () => {
    const handle = createSynapse<State, LabelDispatcher, LabelSelectors>({
      storage: () => new MemoryStorage<State>({ name: `fork_${uid++}`, initialState }),
      selectors: (s) => new LabelSelectors(s),
    })
    const forked = handle.fork()
    expect(typeof forked.buildSyncShell).toBe('function')
    expect(forked.buildSyncShell!()!.storage.getStateSync()).toEqual(initialState)
  })
})
