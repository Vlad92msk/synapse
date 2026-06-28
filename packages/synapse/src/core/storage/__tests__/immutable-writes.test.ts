// @vitest-environment jsdom
//
// Регрессы на два бага, найденных при работе над рецептом форм:
//   Баг 1 — вложенный set/remove мутировал общий initialState (ломал reset).
//   Баг 2 — update() оставлял getStateSync() устаревшим для ключей, дописанных
//           middleware во время dispatch.
import { afterEach, describe, expect, it } from 'vitest'

import { LocalStorage } from '../adapters/local-storage.service'
import { MemoryStorage } from '../adapters/memory-storage.service'
import { removeValueByPath, setValueByPath } from '../adapters/path.utils'
import { ISyncStorage } from '../storage.interface'
import { SyncMiddleware } from '../utils/middleware-module'

// ─── Юнит: иммутабельность path-утилит ────────────────────────────────────────

describe('path.utils — immutability', () => {
  it('setValueByPath не мутирует исходный объект и его вложенные узлы', () => {
    const src = { user: { name: 'Ann', age: 20 }, list: [1, 2] }
    const next = setValueByPath(src, 'user.name', 'Bob')

    // исходник нетронут
    expect(src.user.name).toBe('Ann')
    // результат — новый объект с новым узлом на пути
    expect(next).not.toBe(src)
    expect(next.user).not.toBe(src.user)
    expect(next.user.name).toBe('Bob')
    expect(next.user.age).toBe(20)
  })

  it('setValueByPath сохраняет ссылки на нетронутые ветки (structural sharing)', () => {
    const src = { a: { x: 1 }, b: { y: 2 } }
    const next = setValueByPath(src, 'a.x', 9)

    expect(next.a).not.toBe(src.a) // ветка на пути — клон
    expect(next.b).toBe(src.b) // соседняя ветка — та же ссылка
  })

  it('setValueByPath создаёт массивы для числовых сегментов', () => {
    const next = setValueByPath({}, 'items.0.name', 'first')
    expect(Array.isArray(next.items)).toBe(true)
    expect(next.items[0]).toEqual({ name: 'first' })
  })

  it('removeValueByPath не мутирует исходник и сообщает removed', () => {
    const src = { user: { name: 'Ann', age: 20 } }
    const { state, removed } = removeValueByPath(src, 'user.age')

    expect(removed).toBe(true)
    expect(src.user.age).toBe(20) // исходник нетронут
    expect(state.user).not.toBe(src.user)
    expect('age' in state.user).toBe(false)
    expect(state.user.name).toBe('Ann')
  })

  it('removeValueByPath возвращает removed=false и прежнюю ссылку, если пути нет', () => {
    const src = { user: { name: 'Ann' } }
    const { state, removed } = removeValueByPath(src, 'user.missing')
    expect(removed).toBe(false)
    expect(state).toBe(src)
  })
})

// ─── Баг 1: вложенный set/remove + reset ──────────────────────────────────────

type Kind = 'memory' | 'localStorage'
let uid = 0
const make = <T extends Record<string, any>>(kind: Kind, initialState: T): ISyncStorage<T> => {
  const name = `imm_${kind}_${uid++}`
  return (kind === 'memory' ? new MemoryStorage<T>({ name, initialState }) : new LocalStorage<T>({ name, initialState })) as ISyncStorage<T>
}

describe.each<Kind>(['memory', 'localStorage'])('nested write does not corrupt initialState — %s', (kind) => {
  let storage: ISyncStorage<any>
  afterEach(async () => {
    await storage?.destroy().catch(() => {})
  })

  it('вложенный set, затем reset() восстанавливает исходные значения', async () => {
    storage = make(kind, { profile: { name: 'Ann', age: 20 } })
    await storage.initialize()

    storage.set('profile.name', 'Bob')
    expect(storage.getState().profile.name).toBe('Bob')

    storage.reset()
    expect(storage.getState().profile).toEqual({ name: 'Ann', age: 20 })
  })

  it('объект initialState, переданный в конфиг, не мутируется вложенным set', async () => {
    const initial = { profile: { name: 'Ann', age: 20 } }
    storage = make(kind, initial)
    await storage.initialize()

    storage.set('profile.name', 'Bob')

    // ссылка пользователя на initialState осталась прежней
    expect(initial.profile.name).toBe('Ann')
  })

  it('вложенный remove, затем reset() восстанавливает удалённое поле', async () => {
    storage = make(kind, { profile: { name: 'Ann', age: 20 } })
    await storage.initialize()

    storage.remove('profile.age')
    expect(storage.getState().profile).toEqual({ name: 'Ann' })

    storage.reset()
    expect(storage.getState().profile).toEqual({ name: 'Ann', age: 20 })
  })
})

// ─── Баг 2: update() + middleware-сайд-запись → свежий getStateSync() ──────────

// Middleware, которая на запись в `values` дописывает производный `derived` напрямую.
const derivedMiddleware: SyncMiddleware = {
  name: 'derived',
  reducer: (api) => (next) => (action) => {
    const result = next(action)
    const touchesValues = action.type === 'set' ? String(action.key ?? '').split('.')[0] === 'values' : (action.metadata?.changedPaths ?? []).some((p: string) => String(p).split('.')[0] === 'values')
    if (!touchesValues) return result

    const state = api.getState()
    const derived = Object.keys(state.values ?? {}).length
    api.storage.doSet('derived', derived)
    api.storage.notifySubscribers('derived', derived)
    return result
  },
}

describe.each<Kind>(['memory', 'localStorage'])('update() reflects middleware side-writes in getStateSync — %s', (kind) => {
  let storage: ISyncStorage<any>
  afterEach(async () => {
    await storage?.destroy().catch(() => {})
  })

  it('ключ, дописанный middleware во время update(), виден в getStateSync()', async () => {
    const name = `bug2_${kind}_${uid++}`
    storage = (kind === 'memory'
      ? new MemoryStorage<any>({ name, initialState: { values: {}, derived: 0 }, middlewares: () => [derivedMiddleware] })
      : new LocalStorage<any>({ name, initialState: { values: {}, derived: 0 }, middlewares: () => [derivedMiddleware] })) as ISyncStorage<any>
    await storage.initialize()

    storage.update((s) => {
      s.values = { a: 1, b: 2 }
    })

    // raw и sync-вид согласованы: middleware дописала derived=2.
    expect(storage.getState().derived).toBe(2)
    expect(storage.getStateSync().derived).toBe(2)
  })
})
