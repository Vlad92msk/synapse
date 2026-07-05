// #8 — РЕАЛЬНЫЙ relay-worker путь (не BroadcastChannel-фолбэк).
//
// R7 (worker-storage-real-path.test.ts) исполняет только STORE-воркер. Relay-скрипт
// (`getWorkerSource`, путь `sharedWorkerMiddleware`/`WorkerChannel` в relay-режиме) не
// исполнялся НИ ОДНИМ тестом — все relay-тесты гоняют BroadcastChannel-фолбэк. Здесь мы
// подсовываем фейковый `SharedWorker`, который РЕАЛЬНО `eval`'ит `getWorkerSource()` и
// прогоняет через него pub/sub по симулированной паре MessagePort. Ловит любой дрейф
// строкового relay-скрипта (синтаксис/переименования), а не только store-скрипта.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { WorkerChannel } from '../utils/worker-channel.util'

// ─── Симуляция среды SharedWorker (как в R7, но для relay) ──────────────────────

class FakeMessagePort {
  onmessage: ((ev: { data: any }) => void) | null = null
  onmessageerror: ((ev: { data: any }) => void) | null = null
  _peer!: FakeMessagePort
  _closed = false

  postMessage(data: any): void {
    if (this._closed) return
    const cloned = structuredClone(data)
    queueMicrotask(() => {
      if (!this._peer._closed) this._peer.onmessage?.({ data: cloned })
    })
  }

  start(): void {}
  close(): void {
    this._closed = true
  }
}

interface FakeWorkerBackend {
  connect(workerPort: FakeMessagePort): void
}

const workerBackends = new Map<string, FakeWorkerBackend>()

function getOrCreateWorkerBackend(url: string, source: string): FakeWorkerBackend {
  let backend = workerBackends.get(url)
  if (!backend) {
    // eval источника в области, где `self` — наш фейковый объект. Relay-скрипт
    // самодостаточен (Map/Set из глобалов), без .toString()-инъекций.
    const workerSelf: { onconnect: ((ev: { ports: FakeMessagePort[] }) => void) | null } = { onconnect: null }
    // eslint-disable-next-line no-new-func
    const factory = new Function('self', source)
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
    const url = `blob:worker-relay-${urlCounter++}`
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
const nextChannel = () => `real_relay_ch_${uid++}`
const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms))

describe('WorkerChannel relay — РЕАЛЬНЫЙ SharedWorker-путь (eval relay-скрипта)', () => {
  it('поднимается в mode=worker на реально заэвал-ленном relay-скрипте', () => {
    expect(typeof SharedWorker).toBe('function')
    const ch = new WorkerChannel(nextChannel())
    expect(ch.transportMode).toBe('worker')
    ch.close()
  })

  it('broadcast из вкладки A доходит до подписчика вкладки B того же канала', async () => {
    const channel = nextChannel()
    const a = new WorkerChannel<any>(channel)
    const b = new WorkerChannel<any>(channel)

    const seen: any[] = []
    b.subscribe((msg) => seen.push(msg))
    await tick()

    a.broadcast('PING', { n: 42 })
    await tick()

    expect(seen.some((m) => m.type === 'PING' && m.payload?.n === 42)).toBe(true)

    a.close()
    b.close()
  })

  it('сообщение НЕ возвращается отправителю (relay исключает свой порт)', async () => {
    const channel = nextChannel()
    const a = new WorkerChannel<any>(channel)
    const b = new WorkerChannel<any>(channel)

    const seenA: any[] = []
    a.subscribe((msg) => seenA.push(msg))
    await tick()

    a.broadcast('SELF', { x: 1 })
    await tick()

    // Свой же broadcast не должен вернуться отправителю.
    expect(seenA.some((m) => m.type === 'SELF')).toBe(false)

    a.close()
    b.close()
  })

  it('разные каналы изолированы (мультиплексирование по channelName)', async () => {
    const a = new WorkerChannel<any>(nextChannel())
    const b = new WorkerChannel<any>(nextChannel())

    const seenB: any[] = []
    b.subscribe((msg) => seenB.push(msg))
    await tick()

    a.broadcast('X', { v: 1 })
    await tick()

    expect(seenB.length).toBe(0)

    a.close()
    b.close()
  })
})
