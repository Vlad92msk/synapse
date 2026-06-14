// Aggregated isSourceReady: combined (cross-store) селектор готов только когда готовы
// ВСЕ источники зависимостей, а не только локальный.
import { afterEach, describe, expect, it } from 'vitest'

import { MemoryStorage } from '../../storage/adapters/memory-storage.service'
import { SelectorModule } from '../selector.module'

interface A extends Record<string, any> {
  x: number
}
interface B extends Record<string, any> {
  y: number
}

let uid = 0
const name = (p: string) => `${p}_sr_${uid++}`

describe('aggregated isSourceReady (cross-store combine)', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => {
    for (const fn of cleanup.splice(0)) await fn()
  })

  function setup() {
    const sA = new MemoryStorage<A>({ name: name('a'), initialState: { x: 1 } })
    const sB = new MemoryStorage<B>({ name: name('b'), initialState: { y: 2 } })
    const mA = new SelectorModule<A>(sA)
    const mB = new SelectorModule<B>(sB)
    cleanup.push(async () => {
      mA.destroy()
      mB.destroy()
      await sA.destroy()
      await sB.destroy()
    })
    const selA = mA.createSelector((s) => s.x)
    const selB = mB.createSelector((s) => s.y)
    const combined = mA.createSelector([selA, selB], (a, b) => a + b)
    return { sA, sB, selA, combined }
  }

  it('isSourceReady() === false пока готовы НЕ все источники', async () => {
    const { sA, sB, combined } = setup()

    expect(combined.isSourceReady()).toBe(false)

    await sA.initialize()
    expect(combined.isSourceReady()).toBe(false) // sB ещё не готов

    await sB.initialize()
    expect(combined.isSourceReady()).toBe(true)
  })

  it('простой селектор остаётся привязан только к своему источнику', async () => {
    const { sA, selA } = setup()
    expect(selA.isSourceReady()).toBe(false)
    await sA.initialize()
    expect(selA.isSourceReady()).toBe(true)
  })

  it('onSourceStatusChange агрегирует: true только после готовности всех', async () => {
    const { sA, sB, combined } = setup()
    const seen: boolean[] = []
    combined.onSourceStatusChange((ready) => seen.push(ready))

    expect(seen.every((v) => v === false)).toBe(true)

    await sA.initialize()
    expect(seen.at(-1)).toBe(false)

    await sB.initialize()
    expect(seen.at(-1)).toBe(true)
  })
})
