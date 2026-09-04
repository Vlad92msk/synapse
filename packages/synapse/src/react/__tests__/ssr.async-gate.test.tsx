// @vitest-environment jsdom
//
// SSR async-store путь: IndexedDB не готов синхронно (initialize() асинхронный), поэтому первый
// (серверный/синхронный) кадр сводится к гейту загрузки — awaitSynapse рендерит loadingComponent,
// а не крашится и не выдаёт спиннер вместо контента после готовности.
import 'fake-indexeddb/auto'

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { act } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { IndexedDBStorage } from '../../core/storage/adapters/indexed-DB.service'
import { awaitSynapse } from '../utils/awaitSynapse'

interface State extends Record<string, any> {
  user: string
}

let uid = 0

describe('SSR — async-store сводится к гейту загрузки', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
  })

  it('IndexedDB (async) не готов синхронно → серверный HTML = loadingComponent; после готовности — контент', async () => {
    const storage = new IndexedDBStorage<State>({ name: `agate_${uid}`, initialState: { user: 'srv' }, options: { dbName: `agate_db_${uid++}` } })
    cleanups.push(() => storage.destroy())

    // Async-стор: готовность приезжает через Promise, синхронно его нет.
    const ready = storage.initialize().then(() => ({ storage }))
    const gate = awaitSynapse(ready, { loadingComponent: createElement('div', null, 'loading') })

    const View = gate.withSynapseReady(function View() {
      return createElement('span', null, 'content')
    })

    // Серверный синхронный кадр: стор ещё pending → гейт загрузки, без краша.
    const serverHtml = renderToString(createElement(View))
    expect(serverHtml).toContain('loading')
    expect(serverHtml).not.toContain('content')

    // Клиент: после резолва IndexedDB-инициализации гейт пропускает контент.
    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(createElement(View))
      await ready
    })

    expect(container.textContent).toContain('content')
    expect(container.textContent).not.toContain('loading')
  })
})
