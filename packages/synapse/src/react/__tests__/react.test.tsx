// @vitest-environment jsdom
//
// Страховочные тесты React-слоя (этап 0 ROADMAP): useSelector + createSynapseCtx.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SelectorAPI, SelectorModule } from '../../core'
import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { createDispatcher } from '../../reactive/dispatcher/dispatcher.module'
import { defineAction } from '../../reactive/dispatcher/standalone'
import { createSynapse } from '../../utils'
import { useSelector } from '../hooks/useSelector'
import { createSynapseCtx } from '../utils/createSynapseCtx'

interface State extends Record<string, any> {
  count: number
  other: string
}

let uid = 0

async function setup(initial: State = { count: 0, other: 'a' }) {
  const storage = new MemoryStorage<State>({ name: `rc_${uid++}`, initialState: initial })
  await storage.initialize()
  const sm = new SelectorModule<State>(storage)
  return { storage, sm }
}

describe('useSelector', () => {
  it('ререндер только при изменении значения селектора', async () => {
    const { storage, sm } = await setup()
    const sel = sm.createSelector((s) => s.count)

    let renderCount = 0
    function Counter({ s }: { s: SelectorAPI<number> }) {
      renderCount++
      const v = useSelector(s)
      return <div data-testid="v">{v}</div>
    }

    render(<Counter s={sel} />)
    expect(screen.getByTestId('v').textContent).toBe('0')
    const afterMount = renderCount

    // изменение выбранного среза → ререндер
    await act(async () => {
      storage.update((st) => {
        st.count = 5
      })
    })
    expect(screen.getByTestId('v').textContent).toBe('5')
    expect(renderCount).toBeGreaterThan(afterMount)

    // изменение НЕ выбранного среза → нет ререндера
    const beforeUnrelated = renderCount
    await act(async () => {
      storage.update((st) => {
        st.other = 'b'
      })
    })
    expect(renderCount).toBe(beforeUnrelated)
    expect(screen.getByTestId('v').textContent).toBe('5')

    sm.destroy()
    await storage.destroy()
  })

  it('withLoading возвращает { data, isLoading }', async () => {
    const { storage, sm } = await setup({ count: 7, other: 'a' })
    const sel = sm.createSelector((s) => s.count)

    function Comp({ s }: { s: SelectorAPI<number> }) {
      const { data, isLoading } = useSelector(s, { withLoading: true })
      return (
        <div>
          <span data-testid="data">{data}</span>
          <span data-testid="loading">{String(isLoading)}</span>
        </div>
      )
    }

    render(<Comp s={sel} />)
    expect(screen.getByTestId('data').textContent).toBe('7')
    expect(screen.getByTestId('loading').textContent).toBe('false') // storage готов

    sm.destroy()
    await storage.destroy()
  })
})

describe('createSynapseCtx', () => {
  let cleanup: (() => Promise<void>) | null = null

  afterEach(async () => {
    if (cleanup) {
      await cleanup()
      cleanup = null
    }
  })

  it('Provider гейтит детей до готовности, хуки отдают selectors/actions', async () => {
    const storage = new MemoryStorage<State>({ name: `ctx_${uid++}`, initialState: { count: 0, other: 'a' } })

    const synapsePromise = createSynapse<State, { count: SelectorAPI<number> }, any>({
      storage,
      createSelectorsFn: (sm) => ({ count: sm.createSelector((s) => s.count) }),
      createDispatcherFn: (st) =>
        createDispatcher(
          { storage: st },
          {
            increment: defineAction<State>()({
              action: (s, n: number) => {
                s.update((draft) => {
                  draft.count += n
                })
                return n
              },
            }),
          },
        ),
    })

    const ctx = createSynapseCtx(synapsePromise as any, { loadingComponent: <div data-testid="loading">loading</div> })
    cleanup = ctx.cleanupSynapse

    const Inner = ctx.contextSynapse(function Inner() {
      const selectors = ctx.useSynapseSelectors()
      const actions = ctx.useSynapseActions()
      const v = useSelector(selectors.count)
      return (
        <button data-testid="val" onClick={() => actions.increment(1)}>
          {v}
        </button>
      )
    })

    render(<Inner />)

    // до готовности показывается loadingComponent
    expect(screen.getByTestId('loading')).toBeInTheDocument()
    expect(screen.queryByTestId('val')).toBeNull()

    // после готовности — дети с selectors/actions
    await waitFor(() => expect(screen.getByTestId('val')).toBeInTheDocument())
    expect(screen.getByTestId('val').textContent).toBe('0')

    // actions из контекста работают
    await act(async () => {
      fireEvent.click(screen.getByTestId('val'))
    })
    await waitFor(() => expect(screen.getByTestId('val').textContent).toBe('1'))
  })
})
