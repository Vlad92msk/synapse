// @vitest-environment jsdom
//
// Реактивное чтение хранилища с контролем ререндеров (STORAGE_REACTIVE_AUDIT):
//  - useStorageSubscribe:  опция equals (мемоизация снапшота)
//  - useStorageObservable: мемоизирующая обёртка над toObservable+useObservable
//  - toObservable(storage, selector): поток среза с distinctUntilChanged
import { act, renderHook } from '@testing-library/react'
import { firstValueFrom, toArray } from 'rxjs'
import { take } from 'rxjs/operators'
import { describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { toObservable } from '../../reactive/effects/utils/toObservable'
import { useStorageObservable } from '../hooks/useStorageObservable'
import { useStorageSubscribe } from '../hooks/useStorageSubscribe'

interface State extends Record<string, any> {
  count: number
  other: string
  todos: string[]
}

let uid = 0
async function makeStorage(initial: Partial<State> = {}) {
  const storage = new MemoryStorage<State>({
    name: `rs_${uid++}`,
    initialState: { count: 0, other: 'a', todos: [], ...initial },
  })
  await storage.initialize()
  return storage
}

// ── useStorageSubscribe: equals ───────────────────────────────────────────────
describe('useStorageSubscribe equals', () => {
  it('без equals: ререндер при изменении выбранного примитивного среза', async () => {
    const storage = await makeStorage()

    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useStorageSubscribe(storage, (s) => s.count)
    })
    const afterMount = renders

    act(() => {
      storage.update((s) => {
        s.count = 9
      })
    })
    // примитив изменился → ререндер (useSyncExternalStore сравнивает по Object.is)
    expect(renders).toBe(afterMount + 1)
    expect(result.current).toBe(9)

    await storage.destroy()
  })

  it('с equals: нет ререндера, когда выбранный срез не изменился', async () => {
    const storage = await makeStorage()

    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useStorageSubscribe(storage, (s) => s.count, { equals: (a, b) => a === b })
    })
    const afterMount = renders

    // меняется other, но count тот же → equals спасает от ререндера
    act(() => {
      storage.update((s) => {
        s.other = 'b'
      })
    })
    expect(renders).toBe(afterMount)
    expect(result.current).toBe(0)

    // меняется count → ререндер
    act(() => {
      storage.update((s) => {
        s.count = 3
      })
    })
    expect(renders).toBe(afterMount + 1)
    expect(result.current).toBe(3)

    await storage.destroy()
  })

  it('equals для объектного среза: стабильная ссылка снапшота', async () => {
    const storage = await makeStorage({ todos: ['a'] })

    let renders = 0
    const { result } = renderHook(() => {
      renders++
      // селектор возвращает новый объект каждый раз — equals по содержимому
      return useStorageSubscribe(storage, (s) => ({ list: s.todos }), {
        equals: (a, b) => a.list === b.list,
      })
    })
    const afterMount = renders
    const firstSnapshot = result.current

    act(() => {
      storage.update((s) => {
        s.other = 'changed'
      })
    })
    // срез todos по ссылке не изменился → тот же снапшот, нет ререндера
    expect(renders).toBe(afterMount)
    expect(result.current).toBe(firstSnapshot)

    await storage.destroy()
  })
})

// ── useStorageObservable ──────────────────────────────────────────────────────
describe('useStorageObservable', () => {
  it('возвращает всё состояние и обновляется на изменение', async () => {
    const storage = await makeStorage({ count: 1 })
    const { result } = renderHook(() => useStorageObservable(storage))
    expect(result.current.count).toBe(1)

    act(() => {
      storage.update((s) => {
        s.count = 2
      })
    })
    expect(result.current.count).toBe(2)

    await storage.destroy()
  })

  it('со селектором эмитит только изменения среза (distinctUntilChanged)', async () => {
    const storage = await makeStorage({ count: 0 })

    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useStorageObservable(storage, (s) => s.count)
    })
    const afterMount = renders

    act(() => {
      storage.update((s) => {
        s.other = 'b' // count не меняется → нет нового эмита
      })
    })
    expect(renders).toBe(afterMount)
    expect(result.current).toBe(0)

    act(() => {
      storage.update((s) => {
        s.count = 5
      })
    })
    expect(result.current).toBe(5)

    await storage.destroy()
  })

  it('не пере-подписывается на каждый рендер (мемоизация observable)', async () => {
    const storage = await makeStorage()
    const subSpy = vi.spyOn(storage, 'subscribeToAll')

    const { rerender } = renderHook(() => useStorageObservable(storage, (s) => s.count))
    const callsAfterMount = subSpy.mock.calls.length

    rerender()
    rerender()
    expect(subSpy.mock.calls.length).toBe(callsAfterMount)

    subSpy.mockRestore()
    await storage.destroy()
  })
})

// ── toObservable(storage, selector) ───────────────────────────────────────────
describe('toObservable с селектором', () => {
  it('эмитит начальный срез сразу', async () => {
    const storage = await makeStorage({ count: 42 })
    const first = await firstValueFrom(toObservable(storage, (s) => s.count))
    expect(first).toBe(42)
    await storage.destroy()
  })

  it('пропускает повторы среза (distinctUntilChanged по умолчанию)', async () => {
    const storage = await makeStorage({ count: 0 })

    const collected = firstValueFrom(toObservable(storage, (s) => s.count).pipe(take(3), toArray()))

    // дать подписке оформиться, затем серия изменений
    await Promise.resolve()
    storage.update((s) => {
      s.count = 1
    })
    storage.update((s) => {
      s.other = 'x' // count=1 не меняется → не эмитит
    })
    storage.update((s) => {
      s.count = 2
    })

    expect(await collected).toEqual([0, 1, 2])
    await storage.destroy()
  })

  it('кастомный equals подавляет «равные» срезы', async () => {
    const storage = await makeStorage({ count: 0 })

    // equals: считаем равными значения одной чётности
    const collected = firstValueFrom(toObservable(storage, (s) => s.count, (a, b) => a % 2 === b % 2).pipe(take(2), toArray()))

    await Promise.resolve()
    storage.update((s) => {
      s.count = 2 // та же чётность что и 0 → подавлено
    })
    storage.update((s) => {
      s.count = 3 // другая чётность → эмит
    })

    expect(await collected).toEqual([0, 3])
    await storage.destroy()
  })
})
