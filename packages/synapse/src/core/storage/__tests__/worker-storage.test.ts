// Среда по умолчанию — node: SharedWorker отсутствует, поэтому WorkerCacheStorage
// уходит на in-process фолбэк WorkerChannel (store-mode, local). Это реальный
// фолбэк без моков — round-trip идентичен MemoryStorage.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QueryStorage } from '../../../api/components/query-storage'
import { MemoryStorage } from '../adapters/memory-storage.service'
import { WorkerCacheStorage } from '../adapters/worker-storage.service'
import { StorageFactory } from '../utils/storage-factory.util'
import { StorageKey } from '../utils/storage-key'

let uid = 0
const nextName = (p: string) => `${p}_${uid++}`
const nextChannel = () => `worker_store_ch_${uid++}`

// Хранилища, которые нужно уничтожить после теста.
let toDestroy: Array<{ destroy: () => Promise<void> }> = []
const track = <S extends { destroy: () => Promise<void> }>(s: S): S => {
  toDestroy.push(s)
  return s
}

afterEach(async () => {
  for (const s of toDestroy) {
    try {
      await s.destroy()
    } catch {
      // already destroyed
    }
  }
  toDestroy = []
})

function makeWorker<T extends Record<string, any>>(channelName: string, initialState?: T): WorkerCacheStorage<T> {
  return track(new WorkerCacheStorage<T>({ name: nextName('worker'), initialState, options: { channelName } }))
}

describe('WorkerCacheStorage — базовый round-trip', () => {
  it('constructs без исключений при отсутствии SharedWorker (фолбэк)', () => {
    expect(typeof SharedWorker).toBe('undefined')
    expect(() => makeWorker(nextChannel())).not.toThrow()
  })

  it('type === "worker" и isSync === false', async () => {
    const storage = makeWorker(nextChannel())
    await storage.initialize()
    expect(storage.type).toBe('worker')
    expect(storage.isSync).toBe(false)
  })

  it('set → get, initialState засевается', async () => {
    const storage = makeWorker(nextChannel(), { count: 1 })
    await storage.initialize()

    expect(await storage.get('count')).toBe(1)

    await storage.set('count', 5)
    expect(await storage.get('count')).toBe(5)
  })
})

// ─── Контракт: паритет с MemoryStorage ─────────────────────────────────────────
describe('WorkerCacheStorage — паритет с MemoryStorage', () => {
  interface State extends Record<string, any> {
    count: number
    user: { name: string; age: number }
    list: number[]
  }

  const initial = (): State => ({ count: 0, user: { name: 'Ann', age: 20 }, list: [1, 2, 3] })

  // Одна и та же последовательность операций против обоих хранилищ.
  async function runSequence(s: {
    get: (k: any) => Promise<any>
    set: (k: any, v: any) => Promise<void>
    update: (fn: (st: State) => void) => Promise<void>
    remove: (k: any) => Promise<void>
    has: (k: any) => Promise<boolean>
    keys: () => Promise<string[]>
    getState: () => Promise<State>
  }): Promise<any[]> {
    const out: any[] = []

    await s.set('count', 10)
    out.push(await s.get('count'))

    // вложенный путь
    await s.set('user.name', 'Bob')
    out.push(await s.get('user.name'))
    out.push(await s.get('user'))

    // update
    await s.update((st) => {
      st.count = 42
      st.user.age = 30
    })
    out.push(await s.get('count'))
    out.push(await s.get('user.age'))

    // raw-ключ
    await s.set(new StorageKey('raw.key.with.dots', true), { deep: true })
    out.push(await s.get(new StorageKey('raw.key.with.dots', true)))

    // has
    out.push(await s.has('count'))
    out.push(await s.has('missing'))

    // keys (сортируем — важно содержимое, не порядок)
    out.push((await s.keys()).sort())

    // delete
    await s.remove('list')
    out.push(await s.get('list'))
    out.push(await s.has('list'))

    // whole state
    out.push(await s.getState())

    return out
  }

  it('идентичные результаты Memory vs Worker для полной последовательности', async () => {
    const mem = track(new MemoryStorage<State>({ name: nextName('mem'), initialState: initial() }))
    const worker = makeWorker<State>(nextChannel(), initial())

    await mem.initialize()
    await worker.initialize()

    // MemoryStorage синхронно, но обёртки возвращают значения — оборачиваем в Promise.
    const memAdapter = {
      get: async (k: any) => mem.get(k),
      set: async (k: any, v: any) => mem.set(k, v),
      update: async (fn: any) => mem.update(fn),
      remove: async (k: any) => mem.remove(k),
      has: async (k: any) => mem.has(k),
      keys: async () => mem.keys(),
      getState: async () => mem.getState(),
    }

    const memResults = await runSequence(memAdapter as any)
    const workerResults = await runSequence(worker as any)

    expect(workerResults).toEqual(memResults)
  })

  it('clear() очищает состояние (как Memory)', async () => {
    const worker = makeWorker<State>(nextChannel(), initial())
    await worker.initialize()

    await worker.clear()
    expect(await worker.getState()).toEqual({})
    expect(await worker.keys()).toEqual([])
  })
})

// ─── Общий кэш (в тесте — общий backend Map по channelName) ─────────────────────
describe('WorkerCacheStorage — общий кэш по channelName', () => {
  it('запись через A видна через B (одинаковый channelName)', async () => {
    const channel = nextChannel()
    const a = makeWorker(channel)
    const b = makeWorker(channel)

    await a.initialize()
    await b.initialize()

    await a.set('foo', { n: 42 })

    // Кросс-табный шеринг в тестовой среде эмулируется общим module-level Map.
    expect(await b.get('foo')).toEqual({ n: 42 })
  })

  it('разные channelName изолированы', async () => {
    const a = makeWorker(nextChannel())
    const b = makeWorker(nextChannel())
    await a.initialize()
    await b.initialize()

    await a.set('foo', 1)
    expect(await b.get('foo')).toBeUndefined()
  })
})

// ─── QueryStorage regressions (риск от core-изменения B2) ──────────────────────
describe('QueryStorage поверх WorkerCacheStorage', () => {
  const cacheConfig = { ttl: 60_000, cleanup: { enabled: false } } as const

  it('isSyncStorage() === false; getCachedResultSync() возвращает undefined (НЕ throw)', async () => {
    const storage = makeWorker(nextChannel())
    const qs = new QueryStorage(storage, cacheConfig as any)
    await qs.initialize()

    expect(qs.isSyncStorage()).toBe(false)
    expect(() => qs.getCachedResultSync('any')).not.toThrow()
    expect(qs.getCachedResultSync('any')).toBeUndefined()

    await qs.destroy()
  })

  it('tagIndex восстанавливается на второй QueryStorage после reconnect (общий backend)', async () => {
    const channel = nextChannel()

    const storageA = makeWorker(channel)
    const qsA = new QueryStorage(storageA, cacheConfig as any)
    await qsA.initialize()

    await qsA.setCachedResult('post_1', { title: 'hi' }, { ttl: 60_000 } as any, {}, ['posts'])
    expect(await qsA.getCachedResult('post_1')).toEqual({ title: 'hi' })

    // Второй QueryStorage на том же channelName — rebuildTagIndex подхватит запись.
    const storageB = makeWorker(channel)
    const qsB = new QueryStorage(storageB, cacheConfig as any)
    await qsB.initialize()

    // Запись видна через B.
    expect(await qsB.getCachedResult('post_1')).toEqual({ title: 'hi' })

    // Инвалидация по тегу через B работает (tagIndex восстановлен на init).
    await qsB.invalidateCacheByTags(['posts'])
    expect(await qsB.getCachedResult('post_1')).toBeUndefined()

    await qsA.destroy()
    await qsB.destroy()
  })
})

// ─── Несериализуемое значение → понятная ошибка ────────────────────────────────
describe('WorkerCacheStorage — structured clone', () => {
  it('несериализуемое значение (Headers) → ошибка про structured clone, не тихая порча', async () => {
    const storage = makeWorker(nextChannel())
    await storage.initialize()

    const bad = typeof Headers !== 'undefined' ? new Headers({ 'x-test': '1' }) : () => {}
    await expect(storage.set('resp', bad as any)).rejects.toThrow(/clone/i)

    // Стор не испорчен — предыдущего значения нет, состояние читается.
    expect(await storage.get('resp')).toBeUndefined()
  })
})

// ─── SSR: ни SharedWorker, ни BroadcastChannel ─────────────────────────────────
describe('WorkerCacheStorage — SSR-safe', () => {
  let savedBC: any

  beforeEach(() => {
    savedBC = (globalThis as any).BroadcastChannel
    delete (globalThis as any).BroadcastChannel
  })

  afterEach(() => {
    ;(globalThis as any).BroadcastChannel = savedBC
  })

  it('без SharedWorker и без BroadcastChannel: конструирование + round-trip не бросают', async () => {
    expect(typeof SharedWorker).toBe('undefined')
    expect(typeof BroadcastChannel).toBe('undefined')

    const storage = makeWorker(nextChannel(), { a: 1 })
    await expect(storage.initialize()).resolves.toBe(storage)

    await storage.set('b', 2)
    expect(await storage.get('a')).toBe(1)
    expect(await storage.get('b')).toBe(2)
  })
})

// ─── StorageType extensibility ─────────────────────────────────────────────────
describe('StorageType extensibility', () => {
  it('type "worker" не ломает StorageFactory (есть default-ветка) и не мешает известным типам', () => {
    // Известный тип по-прежнему создаётся.
    const mem = StorageFactory.create({ type: 'memory', name: nextName('mem') })
    expect(mem.type).toBe('memory')

    // Кастомный 'worker' не зарегистрирован в фабрике → внятная ошибка из default, а не краш.
    expect(() => StorageFactory.create({ type: 'worker', name: nextName('w') } as any)).toThrow(/Unsupported storage type/i)
  })
})
