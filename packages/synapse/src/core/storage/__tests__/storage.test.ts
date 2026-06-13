// @vitest-environment jsdom
//
// Страховочные тесты общего контракта IStorage.
// Прогоняются по трём реализациям: MemoryStorage, LocalStorage, IndexedDBStorage.
// Цель — зафиксировать ТЕКУЩЕЕ поведение ядра до рефакторинга (этап 0 ROADMAP).
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { IndexedDBStorage } from '../adapters/indexed-DB.service'
import { LocalStorage } from '../adapters/local-storage.service'
import { MemoryStorage } from '../adapters/memory-storage.service'
import { IStorage, StorageStatus } from '../storage.interface'

interface TestState extends Record<string, any> {
  count: number
  user: { name: string; age: number }
  other: string
}

const makeInitial = (): TestState => ({
  count: 0,
  user: { name: 'Ann', age: 20 },
  other: 'x',
})

// Универсальный flush: переживает и синхронные нотификации, и асинхронный
// initial-callback async-хранилищ (IndexedDB через fake-indexeddb).
const flush = () => new Promise<void>((r) => setTimeout(r, 10))

let uid = 0
const nextName = (prefix: string) => `${prefix}_${uid++}`

type Kind = 'memory' | 'localStorage' | 'indexedDB'

function create(kind: Kind, initialState?: TestState): IStorage<TestState> {
  const name = nextName(kind)
  switch (kind) {
    case 'memory':
      return new MemoryStorage<TestState>({ name, initialState })
    case 'localStorage':
      return new LocalStorage<TestState>({ name, initialState })
    case 'indexedDB':
      return new IndexedDBStorage<TestState>({ name, initialState, options: { dbName: nextName('db') } })
  }
}

describe.each<Kind>(['memory', 'localStorage', 'indexedDB'])('IStorage contract — %s', (kind) => {
  let storage: IStorage<TestState>

  beforeEach(async () => {
    storage = create(kind, makeInitial())
  })

  afterEach(async () => {
    try {
      await storage.destroy()
    } catch {
      // already destroyed
    }
  })

  it('initialize() → waitForReady() резолвится; initStatus отражает готовность', async () => {
    expect(storage.initStatus.status).toBe(StorageStatus.IDLE)

    await storage.initialize()

    expect(storage.initStatus.status).toBe(StorageStatus.READY)
    await expect(storage.waitForReady()).resolves.toBe(storage)
  })

  it('getState/getStateSync возвращают initialState до изменений', async () => {
    await storage.initialize()

    expect(await storage.getState()).toEqual(makeInitial())
    expect(storage.getStateSync()).toEqual(makeInitial())
  })

  it('update(fn) иммутабелен: старая ссылка не мутирует; changedPaths корректны', async () => {
    await storage.initialize()

    const events: Array<{ changedPaths?: string[] }> = []
    storage.subscribeToAll((e) => events.push(e))

    const before = (await storage.getState()) as TestState

    await storage.update((s) => {
      s.user.name = 'Bob'
    })
    await flush()

    // старая ссылка не мутировала
    expect(before.user.name).toBe('Ann')

    const after = (await storage.getState()) as TestState
    expect(after).not.toBe(before)
    expect(after.user.name).toBe('Bob')

    // changedPaths содержат затронутый путь
    const allPaths = events.flatMap((e) => e.changedPaths ?? [])
    expect(allPaths).toContain('user.name')
  })

  it('subscribe(selector, cb) дёргается только при изменении выбранного среза', async () => {
    await storage.initialize()

    const countValues: number[] = []
    const unsub = storage.subscribe(
      (s) => s.count,
      (v) => countValues.push(v),
    )
    await flush()

    // начальное значение доставлено
    expect(countValues).toEqual([0])

    await storage.update((s) => {
      s.count = 5
    })
    await flush()
    expect(countValues).toEqual([0, 5])

    // изменение другого среза НЕ уведомляет подписчика на count
    await storage.update((s) => {
      s.other = 'changed'
    })
    await flush()
    expect(countValues).toEqual([0, 5])

    unsub()
  })

  it('subscribeToAll: уведомление на любое изменение; отписка работает', async () => {
    await storage.initialize()

    let calls = 0
    const unsub = storage.subscribeToAll(() => {
      calls++
    })

    await storage.update((s) => {
      s.count = 1
    })
    await flush()
    expect(calls).toBeGreaterThan(0)

    const afterFirst = calls
    unsub()

    await storage.update((s) => {
      s.count = 2
    })
    await flush()
    expect(calls).toBe(afterFirst)
  })

  it('два update подряд → подписчик получает консистентный финальный снапшот', async () => {
    await storage.initialize()

    await storage.update((s) => {
      s.count = 1
    })
    await storage.update((s) => {
      s.user.age = 30
    })
    await flush()

    const state = (await storage.getState()) as TestState
    expect(state.count).toBe(1)
    expect(state.user.age).toBe(30)
    expect(storage.getStateSync().count).toBe(1)
  })

  it('destroy(): повторные вызовы безопасны; доступ после destroy бросает', async () => {
    await storage.initialize()

    await expect(storage.destroy()).resolves.toBeUndefined()
    await expect(storage.destroy()).resolves.toBeUndefined()

    expect(storage.initStatus.status).toBe(StorageStatus.IDLE)

    // getState после destroy недоступен (и для sync-throw, и для async-reject)
    await expect((async () => storage.getState())()).rejects.toThrow()
  })
})

describe('LocalStorage: персистентность между «сессиями»', () => {
  const name = nextName('persist_ls')

  afterEach(() => {
    localStorage.removeItem(name)
  })

  it('новый инстанс с тем же name читает ранее записанные данные', async () => {
    const a = new LocalStorage<{ count: number }>({ name, initialState: { count: 0 } })
    await a.initialize()
    await a.update((s) => {
      s.count = 42
    })

    // НЕ вызываем a.destroy() — он чистит localStorage. Эмулируем новую сессию.
    const b = new LocalStorage<{ count: number }>({ name })
    await b.initialize()

    expect(await b.getState()).toEqual({ count: 42 })
  })
})

describe('IndexedDBStorage (fake-indexeddb)', () => {
  it('асинхронная инициализация и персистентность между инстансами', async () => {
    const dbName = nextName('db_persist')
    const name = 'store'

    const a = new IndexedDBStorage<{ count: number }>({ name, initialState: { count: 0 }, options: { dbName } })
    await a.initialize()
    expect(a.initStatus.status).toBe(StorageStatus.READY)

    await a.update((s) => {
      s.count = 7
    })

    // persistent storage: destroy НЕ чистит данные
    await a.destroy()

    const b = new IndexedDBStorage<{ count: number }>({ name, options: { dbName } })
    await b.initialize()
    expect(await b.getState()).toEqual({ count: 7 })

    await b.destroy()
  })

  it('параллельные update по разным ключам не теряются', async () => {
    const dbName = nextName('db_parallel')
    const s = new IndexedDBStorage<{ a: number; b: number; c: number }>({
      name: 'store',
      initialState: { a: 0, b: 0, c: 0 },
      options: { dbName },
    })
    await s.initialize()

    await Promise.all([
      s.update((d) => {
        d.a = 1
      }),
      s.update((d) => {
        d.b = 2
      }),
      s.update((d) => {
        d.c = 3
      }),
    ])
    await flush()

    expect(await s.getState()).toEqual({ a: 1, b: 2, c: 3 })

    await s.destroy()
  })
})
