// @vitest-environment jsdom
//
// Этап 5 ROADMAP — React-слой над class-based API:
//  - createSynapseCtx(handle): ленивый запуск фабрики при первом mount + синглтон;
//  - useObservable / useSubscription.
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { BehaviorSubject, Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { Selectors } from '../../core/selector/selectors.base'
import { Dispatcher } from '../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../../utils'
import { useSelector } from '../hooks/useSelector'
import { useObservable } from '../hooks/useObservable'
import { useSubscription } from '../hooks/useSubscription'
import { createSynapseCtx } from '../utils/createSynapseCtx'

// ── Доменные class-слои ─────────────────────────────────────────────────────
interface State extends Record<string, any> {
  count: number
  other: string
}

const initial = (): State => ({ count: 0, other: 'a' })

let uid = 0
const newStorage = () => new MemoryStorage<State>({ name: `r5_${uid++}`, initialState: initial() })

class TestDispatcher extends Dispatcher<State> {
  readonly increment = this.action((store, n: number) => {
    store.update((s) => {
      s.count += n
    })
    return n
  })
}

class TestSelectors extends Selectors<State> {
  readonly count = this.select((s) => s.count)
  readonly other = this.select((s) => s.other)
}

// ── createSynapseCtx(handle) ─────────────────────────────────────────────────
describe('createSynapseCtx(handle)', () => {
  let cleanup: (() => Promise<void>) | null = null
  afterEach(async () => {
    if (cleanup) {
      await cleanup()
      cleanup = null
    }
  })

  it('фабрика не вызывается на импорте; вызывается при mount; loadingComponent до готовности; дети получают selectors/actions', async () => {
    const factory = vi.fn(() => {
      const storage = newStorage()
      return { storage, dispatcher: new TestDispatcher(storage), selectors: new TestSelectors(storage) }
    })
    const handle = createSynapse(factory)

    const ctx = createSynapseCtx(handle, { loadingComponent: <div data-testid="loading">loading</div> })
    cleanup = ctx.cleanupSynapse

    // импорт/создание контекста фабрику не дёргает
    expect(factory).not.toHaveBeenCalled()

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

    // пока synapse не готов — loadingComponent (фабрика стартует в микротаске после mount)
    expect(screen.getByTestId('loading')).toBeInTheDocument()
    expect(screen.queryByTestId('val')).toBeNull()

    // mount запустил фабрику (ровно один раз)
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('val')).toBeInTheDocument())
    expect(screen.getByTestId('val').textContent).toBe('0')

    // actions из контекста работают (class-dispatcher: поля = dispatch-функции)
    await act(async () => {
      screen.getByTestId('val').click()
    })
    await waitFor(() => expect(screen.getByTestId('val').textContent).toBe('1'))
  })

  it('два Provider\'а одного handle → один запуск фабрики (синглтон)', async () => {
    const factory = vi.fn(() => {
      const storage = newStorage()
      return { storage, selectors: new TestSelectors(storage) }
    })
    const handle = createSynapse(factory)

    const ctx = createSynapseCtx(handle, { loadingComponent: <div>loading</div> })
    cleanup = ctx.cleanupSynapse

    const make = (testid: string) =>
      ctx.contextSynapse(function Inner() {
        const selectors = ctx.useSynapseSelectors()
        const v = useSelector(selectors.count)
        return <span data-testid={testid}>{v}</span>
      })

    const A = make('a')
    const B = make('b')

    render(
      <>
        <A />
        <B />
      </>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('a')).toBeInTheDocument()
      expect(screen.getByTestId('b')).toBeInTheDocument()
    })
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('unmount Provider\'а не убивает синглтон (handle.isReady остаётся true)', async () => {
    const handle = createSynapse(() => {
      const storage = newStorage()
      return { storage, selectors: new TestSelectors(storage) }
    })
    const ctx = createSynapseCtx(handle, { loadingComponent: <div>loading</div> })
    cleanup = ctx.cleanupSynapse

    const Inner = ctx.contextSynapse(function Inner() {
      const selectors = ctx.useSynapseSelectors()
      return <span data-testid="v">{useSelector(selectors.count)}</span>
    })

    const { unmount } = render(<Inner />)
    await waitFor(() => expect(screen.getByTestId('v')).toBeInTheDocument())
    expect(handle.isReady()).toBe(true)

    unmount()
    // unmount только отписывает компонент — синглтон жив, cleanupSynapse не вызывался
    expect(handle.isReady()).toBe(true)
  })

  it('useSelector поверх class-селекторов: ререндер только при изменении значения', async () => {
    const storage = newStorage()
    const handle = createSynapse(() => ({ storage, selectors: new TestSelectors(storage) }))
    const ctx = createSynapseCtx(handle, { loadingComponent: <div>loading</div> })
    cleanup = ctx.cleanupSynapse

    let renders = 0
    const Inner = ctx.contextSynapse(function Inner() {
      const selectors = ctx.useSynapseSelectors()
      const v = useSelector(selectors.count)
      renders++
      return <span data-testid="v">{v}</span>
    })

    render(<Inner />)
    await waitFor(() => expect(screen.getByTestId('v')).toBeInTheDocument())
    const afterReady = renders

    // изменение выбранного среза → ререндер
    await act(async () => {
      storage.update((s) => {
        s.count = 5
      })
    })
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('5'))
    const afterChange = renders
    expect(afterChange).toBeGreaterThan(afterReady)

    // изменение НЕ выбранного среза → нет ререндера
    await act(async () => {
      storage.update((s) => {
        s.other = 'b'
      })
    })
    expect(renders).toBe(afterChange)
  })

  it('пересоздание: cleanupSynapse() сбрасывает handle, повторный mount исполняет фабрику заново', async () => {
    const factory = vi.fn(() => {
      const storage = newStorage()
      return { storage, selectors: new TestSelectors(storage) }
    })
    const handle = createSynapse(factory)
    const ctx = createSynapseCtx(handle, { loadingComponent: <div>loading</div> })

    const Inner = ctx.contextSynapse(function Inner() {
      const selectors = ctx.useSynapseSelectors()
      return <span data-testid="v">{useSelector(selectors.count)}</span>
    })

    const first = render(<Inner />)
    await waitFor(() => expect(screen.getByTestId('v')).toBeInTheDocument())
    expect(factory).toHaveBeenCalledTimes(1)
    first.unmount()

    await ctx.cleanupSynapse()
    expect(handle.isReady()).toBe(false)

    render(<Inner />)
    await waitFor(() => expect(screen.getByTestId('v')).toBeInTheDocument())
    expect(factory).toHaveBeenCalledTimes(2)

    cleanup = ctx.cleanupSynapse
  })

  it('StrictMode: двойной mount не дублирует запуск фабрики', async () => {
    const factory = vi.fn(() => {
      const storage = newStorage()
      return { storage, selectors: new TestSelectors(storage) }
    })
    const handle = createSynapse(factory)
    const ctx = createSynapseCtx(handle, { loadingComponent: <div>loading</div> })
    cleanup = ctx.cleanupSynapse

    const Inner = ctx.contextSynapse(function Inner() {
      const selectors = ctx.useSynapseSelectors()
      return <span data-testid="v">{useSelector(selectors.count)}</span>
    })

    render(
      <StrictMode>
        <Inner />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTestId('v')).toBeInTheDocument())
    expect(factory).toHaveBeenCalledTimes(1)
  })
})

// ── useObservable ────────────────────────────────────────────────────────────
describe('useObservable', () => {
  it('возвращает initialValue до первого эмита, затем значения потока', async () => {
    const subject = new Subject<number>()
    const { result } = renderHook(() => useObservable(subject, -1))

    expect(result.current).toBe(-1) // до эмита

    await act(async () => {
      subject.next(10)
    })
    expect(result.current).toBe(10)

    await act(async () => {
      subject.next(20)
    })
    expect(result.current).toBe(20)
  })

  it('синхронный эмит BehaviorSubject подхватывается сразу после подписки', async () => {
    const subject = new BehaviorSubject<number>(7)
    const { result } = renderHook(() => useObservable(subject, 0))
    await waitFor(() => expect(result.current).toBe(7))
  })

  it('фабрика с debounceTime: эмитит только финальное значение (fake timers)', async () => {
    vi.useFakeTimers()
    try {
      const subject = new Subject<number>()
      const { result } = renderHook(() => useObservable(() => subject.pipe(debounceTime(100)), 0, []))

      act(() => {
        subject.next(1)
        subject.next(2)
        subject.next(3)
      })
      // до истечения debounce значение ещё initial
      expect(result.current).toBe(0)

      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(result.current).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('смена deps пересоздаёт цепочку (переподписка на новый источник)', async () => {
    const a = new BehaviorSubject<number>(1)
    const b = new BehaviorSubject<number>(2)

    const { result, rerender } = renderHook(({ src, k }: { src: BehaviorSubject<number>; k: number }) => useObservable(() => src, 0, [k]), {
      initialProps: { src: a, k: 0 },
    })

    await waitFor(() => expect(result.current).toBe(1))

    // смена deps → пересборка цепочки на новый источник
    rerender({ src: b, k: 1 })
    await waitFor(() => expect(result.current).toBe(2))
  })

  it('отписка на unmount', async () => {
    const subject = new Subject<number>()
    const { unmount } = renderHook(() => useObservable(subject, 0))
    expect(subject.observed).toBe(true)
    unmount()
    expect(subject.observed).toBe(false)
  })
})

// ── useSubscription ──────────────────────────────────────────────────────────
describe('useSubscription', () => {
  it('side-effect вызывается; отписка на unmount', async () => {
    const subject = new Subject<number>()
    const seen: number[] = []

    const { unmount } = renderHook(() => useSubscription(() => subject.subscribe((v) => seen.push(v)), []))

    expect(subject.observed).toBe(true)

    await act(async () => {
      subject.next(1)
      subject.next(2)
    })
    expect(seen).toEqual([1, 2])

    unmount()
    expect(subject.observed).toBe(false)

    // после unmount side-effect не вызывается
    subject.next(3)
    expect(seen).toEqual([1, 2])
  })

  it('смена deps пересоздаёт подписку', async () => {
    const subject = new Subject<number>()
    const factory = vi.fn(() => subject.subscribe())

    const { rerender } = renderHook(({ k }: { k: number }) => useSubscription(factory, [k]), { initialProps: { k: 0 } })
    expect(factory).toHaveBeenCalledTimes(1)

    rerender({ k: 1 })
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
