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
import { ConfigMergeStrategy } from '../modules/singleton/models'
import { IStorage, StorageStatus } from '../storage.interface'
import { SyncMiddleware } from '../utils/middleware-module'
import { StorageKey } from '../utils/storage-key'

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

  it('destroy() по умолчанию НЕ стирает данные (clearOnDestroy=false)', async () => {
    const a = new LocalStorage<{ count: number }>({ name, initialState: { count: 0 } })
    await a.initialize()
    await a.update((s) => {
      s.count = 42
    })

    // По умолчанию localStorage персистентен: destroy не чистит данные (симметрично IndexedDB).
    await a.destroy()

    const b = new LocalStorage<{ count: number }>({ name })
    await b.initialize()

    expect(await b.getState()).toEqual({ count: 42 })
  })

  it('clearOnDestroy: true стирает данные на destroy()', async () => {
    const a = new LocalStorage<{ count: number }>({ name, initialState: { count: 0 }, clearOnDestroy: true })
    await a.initialize()
    await a.update((s) => {
      s.count = 42
    })

    await a.destroy()

    expect(localStorage.getItem(name)).toBeNull()
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

  it('remove элемента массива: splice по индексу (отдельная ветка doDelete)', async () => {
    const dbName = nextName('db_arr')
    const s = new IndexedDBStorage<{ tags: string[] }>({
      name: 'store',
      initialState: { tags: ['a', 'b', 'c'] },
      options: { dbName },
    })
    await s.initialize()

    await s.remove('tags.1')
    await flush()

    // элемент вырезан (splice), а не оставлен дыркой — длина уменьшилась
    expect(await s.get('tags')).toEqual(['a', 'c'])

    await s.destroy()
  })
})

// ─── Базовый CRUD-контракт (set/get/remove/has/keys/clear/reset) ──────────────
// Прогоняется по всем трём реализациям. Эти операции раньше не проверялись напрямую.
describe.each<Kind>(['memory', 'localStorage', 'indexedDB'])('IStorage CRUD — %s', (kind) => {
  let storage: IStorage<TestState>

  beforeEach(async () => {
    storage = create(kind, makeInitial())
    await storage.initialize()
  })

  afterEach(async () => {
    try {
      await storage.destroy()
    } catch {
      // already destroyed
    }
  })

  it('set/get: запись и чтение одиночного ключа (round-trip)', async () => {
    await storage.set('count', 10)
    expect(await storage.get('count')).toBe(10)

    // новый ключ, которого не было в initialState
    await storage.set('fresh', 'hello')
    expect(await storage.get('fresh')).toBe('hello')
  })

  it('set/get: вложенный путь', async () => {
    await storage.set('user.name', 'Bob')
    expect(await storage.get('user.name')).toBe('Bob')
    // соседнее поле не затронуто
    expect(await storage.get('user.age')).toBe(20)
  })

  it('remove: значение исчезает, has → false', async () => {
    expect(await storage.has('other')).toBe(true)

    await storage.remove('other')

    expect(await storage.has('other')).toBe(false)
    expect(await storage.get('other')).toBeUndefined()
  })

  it('has: true для существующего, false для отсутствующего', async () => {
    expect(await storage.has('count')).toBe(true)
    expect(await storage.has('nope')).toBe(false)
  })

  it('keys: возвращает ключи верхнего уровня', async () => {
    const keys = await storage.keys()
    expect(new Set(keys)).toEqual(new Set(['count', 'user', 'other']))
  })

  it('clear: состояние становится пустым', async () => {
    await storage.clear()
    await flush()

    expect(await storage.getState()).toEqual({})
    expect(storage.getStateSync()).toEqual({})
  })

  it('reset: возврат к initialState после изменений', async () => {
    await storage.update((s) => {
      s.count = 999
    })
    await flush()
    expect((await storage.getState()).count).toBe(999)

    await storage.reset()
    await flush()

    expect(await storage.getState()).toEqual(makeInitial())
  })

  it('subscribe(stringKey, cb): доставка начального значения и обновлений', async () => {
    const values: number[] = []
    const unsub = storage.subscribe('count', (v) => values.push(v))
    await flush()

    expect(values).toEqual([0]) // начальное значение

    await storage.set('count', 7)
    await flush()
    expect(values).toContain(7)

    unsub()
  })

  it('remove: вложенный путь удаляет только лист, соседи целы', async () => {
    await storage.remove('user.name')

    expect(await storage.get('user.name')).toBeUndefined()
    expect(await storage.has('user.name')).toBe(false)
    // соседнее поле и сам объект-родитель сохранились
    expect(await storage.get('user.age')).toBe(20)
    expect(await storage.has('user')).toBe(true)
  })

  it('сырой (unparseable) ключ: set/get/has/remove работают по литеральному ключу', async () => {
    const raw = new StorageKey('api/cache:v1.user', true)

    await storage.set(raw, { hit: true })
    expect(await storage.get(raw)).toEqual({ hit: true })
    expect(await storage.has(raw)).toBe(true)

    // точка в сыром ключе НЕ трактуется как путь — обычный get по пути её не находит
    expect(await storage.get('api/cache:v1')).toBeUndefined()

    await storage.remove(raw)
    expect(await storage.has(raw)).toBe(false)
    expect(await storage.get(raw)).toBeUndefined()
  })

  it('subscribe(selector): отписка реально прекращает уведомления', async () => {
    const values: number[] = []
    const unsub = storage.subscribe(
      (s) => s.count,
      (v) => values.push(v),
    )
    await flush()
    expect(values).toEqual([0])

    unsub()

    await storage.update((s) => {
      s.count = 99
    })
    await flush()

    // после отписки новых значений нет
    expect(values).toEqual([0])
  })

  it('update без реальных изменений → подписчик не уведомляется', async () => {
    let calls = 0
    const unsub = storage.subscribeToAll(() => {
      calls++
    })

    await storage.update(() => {
      // no-op: ничего не меняем
    })
    await flush()
    expect(calls).toBe(0)

    // присвоение того же значения тоже не считается изменением
    await storage.update((s) => {
      s.count = 0
    })
    await flush()
    expect(calls).toBe(0)

    unsub()
  })
})

// ─── Middlewares ──────────────────────────────────────────────────────────────
describe('MemoryStorage: middlewares', () => {
  it('shallowCompare: повторный set тем же значением не уведомляет подписчиков', async () => {
    const storage = new MemoryStorage<{ count: number }>({
      name: nextName('mw_shallow'),
      initialState: { count: 0 },
      middlewares: (getDefault) => [getDefault().shallowCompare()],
    })
    await storage.initialize()

    const values: number[] = []
    storage.subscribe('count', (v) => values.push(v))
    await flush()

    await storage.set('count', 5)
    await flush()
    await storage.set('count', 5) // то же значение → должно быть пропущено
    await flush()

    // начальное (0) + одно реальное изменение (5); второй set(5) не уведомляет
    expect(values.filter((v) => v === 5).length).toBe(1)

    await storage.destroy()
  })

  it('batching: серия set по одному ключу склеивается в одну запись, финал консистентен', async () => {
    const storage = new MemoryStorage<{ count: number; other: number }>({
      name: nextName('mw_batch'),
      initialState: { count: 0, other: 0 },
      middlewares: (getDefault) => [getDefault().batching()],
    })
    await storage.initialize()

    // Батчер откладывает реальные записи в микротаск и схлопывает серию set
    // по одному ключу до последнего значения (mergeActions: last-wins per key).
    storage.set('count', 1)
    storage.set('count', 2)
    storage.set('count', 3)
    storage.set('other', 7)
    await flush()

    // Свежее чтение через doGet видит итог слияния: последний set по каждому ключу.
    expect(storage.get('count')).toBe(3)
    expect(storage.get('other')).toBe(7)
    // NB: getStateSync() (кэш _stateCache) при батчинге может быть устаревшим —
    // он обновляется в момент set, до отложенной записи. Здесь не проверяем.

    await storage.destroy()
  })

  it('кастомный middleware из config.middlewares попадает в цепочку', async () => {
    // middleware, удваивающий числовые значения на set
    const doubler: SyncMiddleware = {
      name: 'doubler',
      reducer: () => (next) => (action) => {
        if (action.type === 'set' && typeof action.value === 'number') {
          return next({ ...action, value: action.value * 2 })
        }
        return next(action)
      },
    }

    const storage = new MemoryStorage<{ count: number; label: string }>({
      name: nextName('mw_custom'),
      initialState: { count: 0, label: 'x' },
      middlewares: () => [doubler],
    })
    await storage.initialize()

    await storage.set('count', 5)
    expect(storage.get('count')).toBe(10) // middleware применился

    // не-числовое значение проходит насквозь без изменений
    await storage.set('label', 'hello')
    expect(storage.get('label')).toBe('hello')

    await storage.destroy()
  })
})

// ─── Singleton ──────────────────────────────────────────────────────────────
describe('Singleton (MemoryStorage.create)', () => {
  it('два create с одним именем и enabled → один и тот же инстанс', async () => {
    const name = nextName('singleton')
    const a = MemoryStorage.create<{ count: number }>({ name, singleton: { enabled: true }, initialState: { count: 0 } })
    const b = MemoryStorage.create<{ count: number }>({ name, singleton: { enabled: true }, initialState: { count: 0 } })

    expect(b).toBe(a)

    await a.destroy()
  })

  it('без singleton.enabled каждый create — новый инстанс', async () => {
    const name = nextName('no_singleton')
    const a = MemoryStorage.create<{ count: number }>({ name, initialState: { count: 0 } })
    const b = MemoryStorage.create<{ count: number }>({ name, initialState: { count: 0 } })

    expect(b).not.toBe(a)

    await a.destroy()
    await b.destroy()
  })

  it('FIRST_WINS: конфликтующий initialState не бросает, побеждает первый', async () => {
    const name = nextName('singleton_fw')
    const a = MemoryStorage.create<{ count: number }>({
      name,
      singleton: { enabled: true, mergeStrategy: ConfigMergeStrategy.FIRST_WINS, warnOnConflict: false },
      initialState: { count: 0 },
    })
    await a.initialize()

    // второй create с другим initialState не должен бросать и возвращает тот же инстанс
    const b = MemoryStorage.create<{ count: number }>({
      name,
      singleton: { enabled: true, mergeStrategy: ConfigMergeStrategy.FIRST_WINS, warnOnConflict: false },
      initialState: { count: 999 },
    })
    expect(b).toBe(a)
    // состояние осталось от первого конфига
    expect(a.getStateSync()).toEqual({ count: 0 })

    await a.destroy()
  })

  it('STRICT: конфликт конфигурации бросает', async () => {
    const name = nextName('singleton_strict')
    const a = MemoryStorage.create<{ count: number }>({ name, singleton: { enabled: true }, initialState: { count: 0 } })

    expect(() =>
      MemoryStorage.create<{ count: number }>({
        name,
        singleton: { enabled: true, mergeStrategy: ConfigMergeStrategy.STRICT },
        initialState: { count: 5 },
      }),
    ).toThrow()

    await a.destroy()
  })

  it('destroy убирает singleton из реестра → следующий create даёт новый инстанс', async () => {
    const name = nextName('singleton_destroy')
    const a = MemoryStorage.create<{ count: number }>({ name, singleton: { enabled: true }, initialState: { count: 0 } })
    await a.initialize()
    await a.destroy()

    const b = MemoryStorage.create<{ count: number }>({ name, singleton: { enabled: true }, initialState: { count: 0 } })
    expect(b).not.toBe(a)

    await b.destroy()
  })
})

// ─── Lifecycle / ошибки ───────────────────────────────────────────────────────
describe('Lifecycle и ошибки (MemoryStorage)', () => {
  it('доступ до READY бросает (ensureReady)', () => {
    const storage = new MemoryStorage<TestState>({ name: nextName('not_ready') })
    // initialize не вызван → статус IDLE
    expect(() => storage.get('count')).toThrow()
    expect(() => storage.set('count', 1)).toThrow()
  })

  it('провал doInitialize → статус ERROR, waitForReady реджектит', async () => {
    class BrokenStorage extends MemoryStorage<TestState> {
      protected async doInitialize(): Promise<this> {
        throw new Error('boom')
      }
    }
    const storage = new BrokenStorage({ name: nextName('broken') })

    await expect(storage.initialize()).rejects.toThrow('boom')
    expect(storage.initStatus.status).toBe(StorageStatus.ERROR)
    await expect(storage.waitForReady()).rejects.toThrow('boom')
  })
})
