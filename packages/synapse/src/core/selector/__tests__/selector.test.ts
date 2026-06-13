// Страховочные тесты SelectorModule (этап 0 ROADMAP).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../storage/adapters/memory-storage.service'
import { deepEquals, SelectorModule } from '../selector.module'

interface State extends Record<string, any> {
  count: number
  user: { name: string; age: number }
  x: number
  y: number
}

const initial = (): State => ({ count: 0, user: { name: 'Ann', age: 20 }, x: 1, y: 2 })

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

async function setup() {
  const storage = new MemoryStorage<State>({ name: `sel_${Math.random()}`, initialState: initial() })
  await storage.initialize()
  const sm = new SelectorModule<State>(storage)
  return { storage, sm }
}

describe('SelectorModule — simple selector', () => {
  let storage: MemoryStorage<State>
  let sm: SelectorModule<State>

  beforeEach(async () => {
    ;({ storage, sm } = await setup())
  })

  afterEach(async () => {
    sm.destroy()
    await storage.destroy()
  })

  it('мемоизация по ссылке стейта: пересчёт только при изменении стейта', async () => {
    const spy = vi.fn((s: State) => s.count)
    const sel = sm.createSelector(spy)

    expect(sel.select()).toBe(0)
    expect(sel.select()).toBe(0)
    expect(spy).toHaveBeenCalledTimes(1) // вторая select() — кеш по ссылке стейта

    await storage.update((s) => {
      s.count = 5
    })

    expect(sel.select()).toBe(5)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('changedPaths-фильтрация: пересчёт только при изменении затронутых top-level ключей', async () => {
    const sel = sm.createSelector((s) => s.user.name)
    const received: string[] = []
    sel.subscribe({ notify: (v) => received.push(v) })

    expect(received).toEqual(['Ann']) // синхронное начальное значение

    // изменение НЕ затронутого ключа — подписчик не уведомляется
    await storage.update((s) => {
      s.count = 99
    })
    expect(received).toEqual(['Ann'])

    // изменение затронутого ключа со сменой значения — уведомление
    await storage.update((s) => {
      s.user.name = 'Bob'
    })
    expect(received).toEqual(['Ann', 'Bob'])
  })

  it('результат, равный предыдущему (equals), сохраняет старую ссылку — подписчики не уведомляются', async () => {
    const sel = sm.createSelector((s) => s.user.name)
    const received: string[] = []
    sel.subscribe({ notify: (v) => received.push(v) })

    expect(received).toEqual(['Ann'])

    // меняем user.age (тот же top-level 'user' → пересчёт), но name не меняется
    await storage.update((s) => {
      s.user.age = 99
    })

    // значение селектора не изменилось → подписчик НЕ уведомлён
    expect(received).toEqual(['Ann'])
  })

  it('subscribe шлёт текущее значение синхронно при подписке', () => {
    const sel = sm.createSelector((s) => s.count)
    const received: number[] = []
    sel.subscribe({ notify: (v) => received.push(v) })
    expect(received).toEqual([0]) // синхронно, без await
  })

  it('именованный селектор кэшируется: повторный createSelector с тем же name → тот же API', () => {
    const a = sm.createSelector((s) => s.count, { name: 'shared' })
    const b = sm.createSelector((s) => s.count * 2, { name: 'shared' })
    expect(b).toBe(a)
  })

  it('custom equals (deepEquals): структурно равный результат не уведомляет подписчиков', async () => {
    const withDefault = sm.createSelector((s) => ({ even: s.count % 2 === 0 }))
    const withDeep = sm.createSelector((s) => ({ even: s.count % 2 === 0 }), { equals: deepEquals })

    const defReceived: any[] = []
    const deepReceived: any[] = []
    withDefault.subscribe({ notify: (v) => defReceived.push(v) })
    withDeep.subscribe({ notify: (v) => deepReceived.push(v) })

    expect(defReceived).toHaveLength(1)
    expect(deepReceived).toHaveLength(1)

    // count 0 → 2: оба чётные → результат структурно одинаков, но новая ссылка
    await storage.update((s) => {
      s.count = 2
    })

    expect(defReceived).toHaveLength(2) // === видит новую ссылку → уведомил
    expect(deepReceived).toHaveLength(1) // deepEquals: структурно равно → не уведомил
  })

  it('destroy() модуля: подписки на storage сняты', async () => {
    const sel = sm.createSelector((s) => s.count)
    const received: number[] = []
    sel.subscribe({ notify: (v) => received.push(v) })
    expect(received).toEqual([0])

    sm.destroy()

    await storage.update((s) => {
      s.count = 123
    })

    expect(received).toEqual([0]) // после destroy уведомлений нет
  })
})

describe('SelectorModule — combined selector', () => {
  let storage: MemoryStorage<State>
  let sm: SelectorModule<State>

  beforeEach(async () => {
    ;({ storage, sm } = await setup())
  })

  afterEach(async () => {
    sm.destroy()
    await storage.destroy()
  })

  it('reselect-мемоизация по ссылкам аргументов', async () => {
    const x = sm.createSelector((s) => s.x)
    const y = sm.createSelector((s) => s.y)
    const resultFn = vi.fn((xv: number, yv: number) => xv + yv)
    const sum = sm.createSelector([x, y], resultFn)

    expect(sum.select()).toBe(3)
    expect(sum.select()).toBe(3)
    expect(resultFn).toHaveBeenCalledTimes(1) // аргументы по ссылке не менялись
  })

  it('microtask-батчинг: залп изменений двух зависимостей → одно уведомление', async () => {
    const x = sm.createSelector((s) => s.x)
    const y = sm.createSelector((s) => s.y)
    const sum = sm.createSelector([x, y], (xv, yv) => xv + yv)

    const received: number[] = []
    sum.subscribe({ notify: (v) => received.push(v) })
    expect(received).toEqual([3]) // начальное

    await storage.update((s) => {
      s.x = 10
      s.y = 20
    })
    await tick()

    expect(received).toEqual([3, 30]) // одно уведомление на залп
  })

  it('combined поверх SelectorAPI из ДРУГОГО модуля (cross-store) реактивен', async () => {
    const storageB = new MemoryStorage<{ b: number }>({ name: `selB_${Math.random()}`, initialState: { b: 100 } })
    await storageB.initialize()
    const smB = new SelectorModule<{ b: number }>(storageB)

    const selA = sm.createSelector((s) => s.count)
    const selB = smB.createSelector((s) => s.b)
    const combined = sm.createSelector([selA, selB], (a, b) => a + b)

    const received: number[] = []
    combined.subscribe({ notify: (v) => received.push(v) })
    expect(received).toEqual([100])

    await storageB.update((s) => {
      s.b = 200
    })
    await tick()

    expect(received).toEqual([100, 200])

    smB.destroy()
    await storageB.destroy()
  })
})
