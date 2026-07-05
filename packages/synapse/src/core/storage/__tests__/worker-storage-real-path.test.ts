// R7 — РЕАЛЬНЫЙ worker-путь (не in-process фолбэк).
//
// Все остальные worker-тесты гоняют in-process фолбэк (в node нет SharedWorker), поэтому
// сгенерированный blob-скрипт (строка) НИКОГДА не исполняется — именно там жили баги 1–3.
// Здесь мы подсовываем фейковый `SharedWorker`, который РЕАЛЬНО `eval`'ит источник
// `getStoreWorkerSource()` и гоняет через него RPC по симулированной паре MessagePort.
//
// Дополнительно мы СИМУЛИРУЕМ МИНИФИКАЦИЮ: переименовываем идентификатор функции
// `applyStoreOp` в тексте скрипта (как это сделал бы Terser/esbuild с `.toString()`-выводом),
// оставляя литеральные вызовы/биндинги из шаблонной строки нетронутыми. Если R1 регрессирует
// (инъекция голым объявлением вместо `var applyStoreOp = ...`), вызов внутри скрипта
// перестанет резолвиться → RPC вернёт ошибку → тесты упадут.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { WorkerCacheStorage } from '../adapters/worker-storage.service'

// ─── Симуляция среды SharedWorker ──────────────────────────────────────────────

/** Пара «портов» с асинхронной (structured-clone) доставкой, как настоящий MessagePort. */
class FakeMessagePort {
  onmessage: ((ev: { data: any }) => void) | null = null
  onmessageerror: ((ev: { data: any }) => void) | null = null
  _peer!: FakeMessagePort
  _closed = false

  postMessage(data: any): void {
    if (this._closed) return
    const cloned = structuredClone(data) // как граница воркера — валидирует клонируемость
    queueMicrotask(() => {
      if (!this._peer._closed) this._peer.onmessage?.({ data: cloned })
    })
  }

  start(): void {}
  close(): void {
    this._closed = true
  }
}

/** Бэкенд одного «воркера»: источник `eval`'ится один раз, состояние живёт между портами. */
interface FakeWorkerBackend {
  connect(workerPort: FakeMessagePort): void
}

const workerBackends = new Map<string, FakeWorkerBackend>()

/** Переименовать ТОЛЬКО идентификатор функции (как минификатор с .toString()-выводом). */
function simulateMinification(source: string): string {
  return source.replace(/function applyStoreOp\(/g, 'function __minified_applyStoreOp(')
}

function getOrCreateWorkerBackend(url: string, source: string): FakeWorkerBackend {
  let backend = workerBackends.get(url)
  if (!backend) {
    const minified = simulateMinification(source)
    // eval источника в области, где `self` — наш фейковый объект. Map/Set/Date/JSON/Object/
    // Error берутся из глобалов (доступны внутри Function). Никаких доп. зависимостей у
    // скрипта нет — applyStoreOp самодостаточна.
    const workerSelf: { onconnect: ((ev: { ports: FakeMessagePort[] }) => void) | null } = { onconnect: null }
    // eslint-disable-next-line no-new-func
    const factory = new Function('self', minified)
    factory(workerSelf)
    backend = {
      connect(workerPort: FakeMessagePort) {
        workerSelf.onconnect?.({ ports: [workerPort] })
      },
    }
    workerBackends.set(url, backend)
  }
  return backend
}

class FakeSharedWorker {
  port: FakeMessagePort
  onerror: ((ev: any) => void) | null = null

  constructor(url: string | URL) {
    const key = String(url)
    const source = urlToSource.get(key)
    if (source === undefined) throw new Error(`FakeSharedWorker: no source for url ${key}`)

    const clientPort = new FakeMessagePort()
    const workerPort = new FakeMessagePort()
    clientPort._peer = workerPort
    workerPort._peer = clientPort

    this.port = clientPort
    getOrCreateWorkerBackend(key, source).connect(workerPort)
  }
}

// ─── Перехват blob-источника воркера ────────────────────────────────────────────
// WorkerChannel делает `URL.createObjectURL(new Blob([getStoreWorkerSource()]))`. Мы
// перехватываем Blob (запоминаем текст) и createObjectURL (маппим url → текст), чтобы
// FakeSharedWorker мог получить и заэвалить реальный сгенерированный источник.

const urlToSource = new Map<string, string>()
const blobToSource = new WeakMap<object, string>()

let RealSharedWorker: any
let RealBlob: any
let realCreateObjectURL: any
let realRevokeObjectURL: any
let urlCounter = 0

beforeAll(() => {
  RealBlob = (globalThis as any).Blob
  RealSharedWorker = (globalThis as any).SharedWorker
  realCreateObjectURL = (globalThis as any).URL?.createObjectURL
  realRevokeObjectURL = (globalThis as any).URL?.revokeObjectURL

  class CapturingBlob extends RealBlob {
    constructor(parts: any[], options?: any) {
      super(parts, options)
      try {
        blobToSource.set(this, parts.map((p) => String(p)).join(''))
      } catch {
        // ignore
      }
    }
  }
  ;(globalThis as any).Blob = CapturingBlob
  ;(globalThis as any).URL.createObjectURL = (blob: any) => {
    const url = `blob:worker-store-${urlCounter++}`
    const source = blobToSource.get(blob)
    if (source !== undefined) urlToSource.set(url, source)
    return url
  }
  ;(globalThis as any).URL.revokeObjectURL = () => {}
  ;(globalThis as any).SharedWorker = FakeSharedWorker
})

afterAll(() => {
  ;(globalThis as any).Blob = RealBlob
  ;(globalThis as any).SharedWorker = RealSharedWorker
  if (realCreateObjectURL) (globalThis as any).URL.createObjectURL = realCreateObjectURL
  else delete (globalThis as any).URL.createObjectURL
  if (realRevokeObjectURL) (globalThis as any).URL.revokeObjectURL = realRevokeObjectURL
})

let uid = 0
const nextName = (p: string) => `${p}_${uid++}`
const nextChannel = () => `real_worker_ch_${uid++}`

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
  return track(new WorkerCacheStorage<T>({ name: nextName('rworker'), initialState, options: { channelName } }))
}

const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms))

describe('WorkerCacheStorage — РЕАЛЬНЫЙ SharedWorker-путь (eval blob-скрипта)', () => {
  it('реально исполняет сгенерированный blob-скрипт (mode=worker, capabilities.shared=true)', async () => {
    expect(typeof SharedWorker).toBe('function')
    const storage = makeWorker(nextChannel(), { count: 1 })
    await storage.initialize()

    // Если бы это был in-process фолбэк — capabilities.shared был бы false.
    expect(storage.capabilities.shared).toBe(true)
  })

  it('round-trip set/get/keys/delete через eval-нутый воркер (падает, если R1 регрессировал)', async () => {
    const storage = makeWorker(nextChannel(), { count: 0 })
    await storage.initialize()

    await storage.set('count', 7)
    expect(await storage.get('count')).toBe(7)

    await storage.set('user.name', 'Bob')
    expect(await storage.get('user.name')).toBe('Bob')
    expect(await storage.get('user')).toEqual({ name: 'Bob' })

    await storage.update((s) => {
      s.count = 42
    })
    expect(await storage.get('count')).toBe(42)

    expect((await storage.keys()).sort()).toEqual(['count', 'user'])

    expect(await storage.remove('user')).toBeUndefined()
    expect(await storage.get('user')).toBeUndefined()
    expect(await storage.has('count')).toBe(true)
  })

  // R2 на реальном пути: конкурентные записи разных ключей не теряются.
  it('R2 — конкурентные per-key записи из двух вкладок не затирают друг друга', async () => {
    const channel = nextChannel()
    const a = makeWorker<Record<string, any>>(channel)
    const b = makeWorker<Record<string, any>>(channel)
    await a.initialize()
    await b.initialize()

    // "Одновременные" записи разных ключей из разных вкладок.
    await Promise.all([a.set('a', 1), b.set('b', 2), a.set('c', 3)])
    await tick()

    // Обе (все) записи должны выжить — при старом getAll→setAll одна бы потерялась.
    const state = await a.getState()
    expect(state).toEqual({ a: 1, b: 2, c: 3 })
    expect(await b.get('a')).toBe(1)
  })

  // R3 на реальном пути: подписка в вкладке A срабатывает на запись из вкладки B.
  it('R3 — subscribe() в вкладке A будится записью из вкладки B (STORE_MUTATION)', async () => {
    const channel = nextChannel()
    const a = makeWorker<Record<string, any>>(channel)
    const b = makeWorker<Record<string, any>>(channel)
    await a.initialize()
    await b.initialize()

    const seen: any[] = []
    a.subscribe('foo', (v) => seen.push(v))
    await tick()

    await b.set('foo', 42)
    await tick()

    expect(seen).toContain(42)
    expect(await a.get('foo')).toBe(42)
  })

  it('R3 — subscribeToAll в A получает STORE_UPDATE при записи из B', async () => {
    const channel = nextChannel()
    const a = makeWorker<Record<string, any>>(channel)
    const b = makeWorker<Record<string, any>>(channel)
    await a.initialize()
    await b.initialize()

    let events = 0
    a.subscribeToAll(() => {
      events++
    })

    await b.set('x', { n: 1 })
    await tick()

    expect(events).toBeGreaterThan(0)
    expect(await a.get('x')).toEqual({ n: 1 })
  })
})
