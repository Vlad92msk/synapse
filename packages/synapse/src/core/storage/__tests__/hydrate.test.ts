// @vitest-environment jsdom
//
// SSR-гидрация: storage.hydrate(state) засевает/заменяет состояние серверным снапшотом.
import 'fake-indexeddb/auto'

import { afterEach, describe, expect, it } from 'vitest'

import { IndexedDBStorage } from '../adapters/indexed-DB.service'
import { LocalStorage } from '../adapters/local-storage.service'
import { MemoryStorage } from '../adapters/memory-storage.service'
import { IStorage } from '../storage.interface'
import { HYDRATION_META_KEY, stampHydration } from '../utils/hydration-meta.util'

interface State extends Record<string, any> {
  count: number
  user: { name: string }
}

const initial = (): State => ({ count: 0, user: { name: 'default' } })
const server = (): State => ({ count: 42, user: { name: 'from-server' } })

let uid = 0
const nextName = (p: string) => `${p}_hy_${uid++}`
const flush = () => new Promise<void>((r) => setTimeout(r, 10))

type Kind = 'memory' | 'localStorage' | 'indexedDB'

function create(kind: Kind, name: string): IStorage<State> {
  switch (kind) {
    case 'memory':
      return new MemoryStorage<State>({ name, initialState: initial() })
    case 'localStorage':
      return new LocalStorage<State>({ name, initialState: initial() })
    case 'indexedDB':
      return new IndexedDBStorage<State>({ name, initialState: initial(), options: { dbName: nextName('db') } })
  }
}

describe.each<Kind>(['memory', 'localStorage', 'indexedDB'])('hydrate — %s', (kind) => {
  let storage: IStorage<State>
  afterEach(async () => {
    try {
      await storage.destroy()
    } catch {
      /* noop */
    }
  })

  it('hydrate ДО initialize → initialState не перезатирает серверный снапшот', async () => {
    storage = create(kind, nextName(kind))

    await storage.hydrate(server())
    await storage.initialize()
    await flush()

    expect(await storage.getState()).toEqual(server())
  })

  it('hydrate ПОСЛЕ initialize → заменяет состояние и уведомляет подписчиков', async () => {
    storage = create(kind, nextName(kind))
    await storage.initialize()
    await flush()

    const seen: any[] = []
    storage.subscribe('count', (v) => seen.push(v))
    await flush()

    await storage.hydrate(server())
    await flush()

    expect(await storage.getState()).toEqual(server())
    expect(seen.at(-1)).toBe(42)
  })

  it('мердж-по-свежести: снапшот НЕ новее применённого не затирает состояние', async () => {
    storage = create(kind, nextName(kind))
    await storage.initialize()
    await flush()

    // Свежий снапшот (метка 100) применяется.
    await storage.hydrate(stampHydration({ count: 1, user: { name: 'a' } }, 100))
    await flush()
    expect((await storage.getState()).count).toBe(1)

    // Устаревший (метка 50) и равный (метка 100) — игнорируются, состояние не трогается.
    await storage.hydrate(stampHydration({ count: 2, user: { name: 'b' } }, 50))
    await storage.hydrate(stampHydration({ count: 3, user: { name: 'c' } }, 100))
    await flush()
    expect((await storage.getState()).count).toBe(1)

    // Более свежий (метка 150) — применяется.
    await storage.hydrate(stampHydration({ count: 4, user: { name: 'd' } }, 150))
    await flush()
    expect((await storage.getState()).count).toBe(4)
  })

  it('немаркированный снапшот всегда применяется (legacy full-replace)', async () => {
    storage = create(kind, nextName(kind))
    await storage.initialize()
    await flush()

    await storage.hydrate(stampHydration({ count: 1, user: { name: 'a' } }, 100))
    await flush()

    // Без метки — обходит freshness-гейт и заменяет состояние.
    await storage.hydrate({ count: 9, user: { name: 'legacy' } })
    await flush()
    expect((await storage.getState()).count).toBe(9)
  })

  it('служебная метка не протекает в состояние', async () => {
    storage = create(kind, nextName(kind))
    await storage.initialize()
    await flush()

    await storage.hydrate(stampHydration({ count: 7, user: { name: 'x' } }, 100))
    await flush()

    expect(HYDRATION_META_KEY in (await storage.getState())).toBe(false)
  })
})

// Keyed-кэш модуль: hydrateStrategy: 'merge' — засев ключей снапшота без затирания живых ключей.
interface KeyedState extends Record<string, any> {
  byKey: Record<string, string>
}

const keyedInitial = (): KeyedState => ({ byKey: {} })

function createKeyed(kind: Kind, name: string): IStorage<KeyedState> {
  const opts = { name, initialState: keyedInitial(), hydrateStrategy: 'merge' as const }
  switch (kind) {
    case 'memory':
      return new MemoryStorage<KeyedState>(opts)
    case 'localStorage':
      return new LocalStorage<KeyedState>(opts)
    case 'indexedDB':
      return new IndexedDBStorage<KeyedState>({ ...opts, options: { dbName: nextName('kdb') } })
  }
}

describe.each<Kind>(['memory', 'localStorage', 'indexedDB'])('hydrate merge-стратегия — %s', (kind) => {
  let storage: IStorage<KeyedState>
  afterEach(async () => {
    try {
      await storage.destroy()
    } catch {
      /* noop */
    }
  })

  it('merge не затирает верхнеуровневые ключи вне снапшота', async () => {
    storage = createKeyed(kind, nextName(kind))
    await storage.initialize()
    await flush()

    // Живой клиентский ключ (напр. media:*), которого нет в серверном снапшоте.
    await storage.update((s) => {
      s.byKey = { 'media:1': 'client' }
    })
    await flush()

    // Серверный снапшот несёт другой ключ верхнего уровня.
    await storage.hydrate(stampHydration({ extra: 'from-server' } as any, 100))
    await flush()

    const state = await storage.getState()
    // Ключ снапшота добавлен, живой ключ byKey остался.
    expect((state as any).extra).toBe('from-server')
    expect(state.byKey).toEqual({ 'media:1': 'client' })
  })

  it('merge: свежесть считается ПО КЛЮЧУ — устаревший ключ не блокирует свежий', async () => {
    storage = createKeyed(kind, nextName(kind))
    await storage.initialize()
    await flush()

    await storage.hydrate(stampHydration({ a: 'a1', b: 'b1' } as any, 100))
    await flush()

    // Тот же timestamp: 'a' устарел (<=100) и НЕ применяется, но новый ключ 'c' проходит.
    await storage.hydrate(stampHydration({ a: 'a2', c: 'c1' } as any, 100))
    await flush()

    const state = await storage.getState() as any
    expect(state.a).toBe('a1') // не перезаписан устаревшим
    expect(state.b).toBe('b1')
    expect(state.c).toBe('c1') // свежий ключ применён

    // Строго новее — ключ 'a' обновляется.
    await storage.hydrate(stampHydration({ a: 'a3' } as any, 200))
    await flush()
    expect((await storage.getState() as any).a).toBe('a3')
  })

  it('merge нотифицирует подписчиков только по реально изменившимся ключам', async () => {
    storage = createKeyed(kind, nextName(kind))
    await storage.initialize()
    await flush()

    await storage.hydrate(stampHydration({ a: 'a1', b: 'b1' } as any, 100))
    await flush()

    const seenA: any[] = []
    const seenB: any[] = []
    storage.subscribe('a', (v) => seenA.push(v))
    storage.subscribe('b', (v) => seenB.push(v))
    await flush()
    seenA.length = 0
    seenB.length = 0

    // 'a' не меняется (то же значение, новее метка), 'b' меняется.
    await storage.hydrate(stampHydration({ a: 'a1', b: 'b2' } as any, 200))
    await flush()

    expect(seenB.at(-1)).toBe('b2')
    expect(seenA).toEqual([]) // без изменения значения — без нотификации
  })
})
