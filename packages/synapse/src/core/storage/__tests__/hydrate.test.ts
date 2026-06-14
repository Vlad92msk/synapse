// @vitest-environment jsdom
//
// SSR-гидрация: storage.hydrate(state) засевает/заменяет состояние серверным снапшотом.
import 'fake-indexeddb/auto'

import { afterEach, describe, expect, it } from 'vitest'

import { IndexedDBStorage } from '../adapters/indexed-DB.service'
import { LocalStorage } from '../adapters/local-storage.service'
import { MemoryStorage } from '../adapters/memory-storage.service'
import { IStorage } from '../storage.interface'

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
})
