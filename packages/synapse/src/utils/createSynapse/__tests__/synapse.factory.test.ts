// Этап 4 ROADMAP — `createSynapse(factory)` + `SynapseModule`-handle.
import { EMPTY, Observable } from 'rxjs'
import { finalize, map, mergeMap } from 'rxjs/operators'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { Dispatcher } from '../../../reactive/dispatcher/dispatcher.base'
import type { ApiRequestState } from '../../../reactive/dispatcher/standalone'
import { Effects } from '../../../reactive/effects/effects.base'
import { ofType } from '../../../reactive/effects/effects.module'
import { Selectors } from '../../../core/selector/selectors.base'
import { createSynapse } from '../createSynapse'
import type { Synapse, SynapseModule } from '../synapse.types'

// ── Доменные типы ─────────────────────────────────────────────────────────────
interface State extends Record<string, any> {
  count: number
  list: number[]
  api: { loadReq: ApiRequestState }
}

const initial = (): State => ({ count: 0, list: [], api: { loadReq: { status: 'idle', error: null } } })

interface CoreState extends Record<string, any> {
  userId: string | null
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

let uid = 0
const newStorage = (state: State = initial()) => new MemoryStorage<State>({ name: `fac_${uid++}`, initialState: state })
const newCoreStorage = (state: CoreState = { userId: null }) => new MemoryStorage<CoreState>({ name: `core_${uid++}`, initialState: state })

// ── Class-слои ────────────────────────────────────────────────────────────────
class TestDispatcher extends Dispatcher<State> {
  readonly increment = this.action((store, n: number) => {
    store.update((s) => {
      s.count += n
    })
    return n
  })

  readonly loadPosts = this.apiActions<{ ownerId: string }>((s) => s.api.loadReq)

  readonly applyPosts = this.action((store, items: number[]) =>
    store.update((s) => {
      s.list = items
    }),
  )
}

class TestSelectors extends Selectors<State> {
  readonly count = this.select((s) => s.count)
  readonly list = this.select((s) => s.list)
}

class CoreDispatcher extends Dispatcher<CoreState> {
  readonly setUser = this.action((store, id: string | null) =>
    store.update((s) => {
      s.userId = id
    }),
  )
  readonly logout = this.signal<void>()
}

const created: Array<{ destroy: () => Promise<void> }> = []
afterEach(async () => {
  for (const h of created.splice(0)) {
    try {
      await h.destroy()
    } catch {
      // ignore
    }
  }
})

// ── Перегрузка ────────────────────────────────────────────────────────────────
describe('форма createSynapse(factory)', () => {
  it('синхронная и async-фабрика обе резолвятся в synapse', async () => {
    const syncHandle = createSynapse(() => {
      const storage = newStorage()
      return { storage, selectors: new TestSelectors(storage) }
    })
    created.push(syncHandle)
    const syncSynapse = await syncHandle
    expect(syncSynapse.selectors!.count.select()).toBe(0)

    const asyncHandle = createSynapse(async () => ({ storage: newStorage(), selectors: undefined }))
    created.push(asyncHandle)
    const asyncSynapse = await asyncHandle
    expect(asyncSynapse.storage.getStateSync().count).toBe(0)
  })

  it('типы: фабричная форма выводит SynapseModule с полным типом dispatcher/selectors', () => {
    const handle = createSynapse(() => ({
      storage: newStorage(),
      dispatcher: new TestDispatcher(newStorage()),
      selectors: new TestSelectors(newStorage()),
    }))
    expectTypeOf(handle).toMatchTypeOf<SynapseModule<State, TestDispatcher, TestSelectors>>()
    expectTypeOf(handle.ready()).resolves.toMatchTypeOf<Synapse<State, TestDispatcher, TestSelectors>>()
  })
})

// ── Ленивость / мемоизация ──────────────────────────────────────────────────
describe('ленивость', () => {
  it('фабрика НЕ исполняется до первого ready()/await', async () => {
    const factory = vi.fn(() => ({ storage: newStorage() }))
    const handle = createSynapse(factory)
    created.push(handle)

    expect(factory).not.toHaveBeenCalled()
    expect(handle.isReady()).toBe(false)

    await handle.ready()
    expect(factory).toHaveBeenCalledTimes(1)
    expect(handle.isReady()).toBe(true)
  })

  it('исполняется ровно один раз при параллельных await', async () => {
    const factory = vi.fn(async () => {
      await tick()
      return { storage: newStorage() }
    })
    const handle = createSynapse(factory)
    created.push(handle)

    const [a, b, c] = await Promise.all([handle.ready(), handle.ready(), handle])
    expect(factory).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})

// ── Форма результата ──────────────────────────────────────────────────────────
describe('результат synapse', () => {
  it('содержит storage / state$ (всегда) / dispatcher / actions(=dispatcher) / selectors / destroy', async () => {
    const dispatcher = new TestDispatcher(newStorage())
    const handle = createSynapse(() => {
      const storage = newStorage()
      return { storage, dispatcher: new TestDispatcher(storage), selectors: new TestSelectors(storage) }
    })
    created.push(handle)

    const s = await handle
    expect(s.storage).toBeDefined()
    expect(s.state$).toBeInstanceOf(Observable)
    expect(s.dispatcher).toBeInstanceOf(TestDispatcher)
    expect(s.actions).toBe(s.dispatcher)
    expect(s.selectors).toBeInstanceOf(TestSelectors)
    expect(typeof s.destroy).toBe('function')
    void dispatcher
  })

  it('state$ есть даже без эффектов и эмитит текущее + изменения', async () => {
    const handle = createSynapse(() => {
      const storage = newStorage()
      return { storage, dispatcher: new TestDispatcher(storage) }
    })
    created.push(handle)
    const s = await handle

    const seen: number[] = []
    const sub = s.state$.subscribe((st) => seen.push(st.count))
    expect(seen).toEqual([0]) // текущее при подписке

    await s.dispatcher!.increment(5)
    await tick()
    expect(seen).toEqual([0, 5])
    sub.unsubscribe()
  })
})

// ── Частичные конфиги ──────────────────────────────────────────────────────────
describe('частичные конфиги', () => {
  it('storage-only', async () => {
    const handle = createSynapse(() => ({ storage: newStorage() }))
    created.push(handle)
    const s = await handle
    expect(s.dispatcher).toBeUndefined()
    expect(s.selectors).toBeUndefined()
    expect(s.state$).toBeInstanceOf(Observable)
  })

  it('storage + selectors (без dispatcher)', async () => {
    const handle = createSynapse(() => {
      const storage = newStorage()
      return { storage, selectors: new TestSelectors(storage) }
    })
    created.push(handle)
    const s = await handle
    expect(s.selectors!.count.select()).toBe(0)
    expect(s.dispatcher).toBeUndefined()
  })

  it('storage + dispatcher (без эффектов)', async () => {
    const handle = createSynapse(() => {
      const storage = newStorage()
      return { storage, dispatcher: new TestDispatcher(storage) }
    })
    created.push(handle)
    const s = await handle
    await s.dispatcher!.increment(3)
    expect(s.storage.getStateSync().count).toBe(3)
  })
})

// ── Зависимости в обе стороны ───────────────────────────────────────────────
describe('dependencies', () => {
  it('handle как зависимость другого handle', async () => {
    const depHandle = createSynapse(() => ({ storage: newCoreStorage() }))
    created.push(depHandle)

    const handle = createSynapse(() => ({
      storage: newStorage(),
      dependencies: [depHandle],
    }))
    created.push(handle)
    const synapse = await handle

    expect(depHandle.isReady()).toBe(true) // await зависимости запустил фабрику
    expect(synapse.storage.getStateSync().count).toBe(0)
  })

  it('raw storage и { storage }-обёртка как зависимости', async () => {
    const rawDep = newCoreStorage()
    await rawDep.initialize()

    const handle = createSynapse(() => ({
      storage: newStorage(),
      dependencies: [rawDep, { storage: newCoreStorage() }],
    }))
    created.push(handle)

    const s = await handle
    expect(s.storage.getStateSync().count).toBe(0)
    expect(rawDep.initStatus.status).toBe('ready')
  })
})

// ── Fail-fast ──────────────────────────────────────────────────────────────────
describe('fail-fast', () => {
  it('ошибка в фабрике → rejection ready(), без тихой инициализации', async () => {
    const handle = createSynapse(() => {
      throw new Error('boom-factory')
    })
    await expect(handle.ready()).rejects.toThrow('boom-factory')
    expect(handle.isReady()).toBe(false)
  })

  it('ошибка в storage.initialize → rejection + откат (storage.destroy не оставляет хвостов)', async () => {
    const storage = newStorage()
    vi.spyOn(storage, 'initialize').mockRejectedValueOnce(new Error('boom-init'))
    const handle = createSynapse(() => ({ storage }))

    await expect(handle.ready()).rejects.toThrow('boom-init')
    expect(handle.isReady()).toBe(false)
  })

  it('ошибка при старте эффектов → rejection + откат уже созданного (dispatcher/storage destroy)', async () => {
    const storage = newStorage()
    const dispatcher = new TestDispatcher(storage)
    const dispatcherDestroy = vi.spyOn(dispatcher, 'destroy')
    const storageDestroy = vi.spyOn(storage, 'destroy')

    class BadEffects extends Effects<State, TestDispatcher> {
      readonly bad = this.effect(() => {
        throw new Error('boom-effect')
      })
    }

    // Ошибка бросается в момент подписки (start → subscribeToEffect ловит её внутри,
    // поэтому смоделируем падение через waitForReady старта).
    vi.spyOn(storage, 'waitForReady').mockRejectedValueOnce(new Error('boom-start'))

    const handle = createSynapse(() => ({ storage, dispatcher, effects: new BadEffects() }))

    await expect(handle.ready()).rejects.toThrow('boom-start')
    // Откат: уже созданные ресурсы разрушены.
    expect(dispatcherDestroy).toHaveBeenCalled()
    expect(storageDestroy).toHaveBeenCalled()
  })

  it('после провала ready() можно повторить попытку (мемоизация сброшена)', async () => {
    let attempt = 0
    const factory = vi.fn(() => {
      attempt++
      if (attempt === 1) throw new Error('first-fails')
      return { storage: newStorage() }
    })
    const handle = createSynapse(factory)
    created.push(handle)

    await expect(handle.ready()).rejects.toThrow('first-fails')
    const s = await handle.ready()
    expect(factory).toHaveBeenCalledTimes(2)
    expect(s.storage.getStateSync().count).toBe(0)
  })
})

// ── LIFO-teardown ──────────────────────────────────────────────────────────────
describe('LIFO-teardown', () => {
  it('порядок: stop effects → onDestroy → destroy dispatcher → selectors → storage', async () => {
    const order: string[] = []
    const storage = newStorage()
    const dispatcher = new TestDispatcher(storage)
    const selectors = new TestSelectors(storage)

    vi.spyOn(dispatcher, 'destroy').mockImplementation(() => {
      order.push('dispatcher')
    })
    vi.spyOn(selectors, 'destroy').mockImplementation(() => {
      order.push('selectors')
    })
    vi.spyOn(storage, 'destroy').mockImplementation(async () => {
      order.push('storage')
    })

    class TeardownEffects extends Effects<State, TestDispatcher> {
      readonly keepAlive = this.effect((action$) =>
        action$.pipe(
          finalize(() => order.push('effects-stop')),
          mergeMap(() => EMPTY),
        ),
      )
      override onDestroy = vi.fn(() => {
        order.push('onDestroy')
      })
    }

    const handle = createSynapse(() => ({ storage, dispatcher, selectors, effects: new TeardownEffects() }))
    const s = await handle
    await s.destroy()

    expect(order).toEqual(['effects-stop', 'onDestroy', 'dispatcher', 'selectors', 'storage'])
  })
})

// ── Пересоздание ────────────────────────────────────────────────────────────────
describe('пересоздание после destroy', () => {
  it('destroy() → ready() заново исполняет фабрику; старые подписки мертвы', async () => {
    const factory = vi.fn(() => {
      const storage = newStorage()
      return { storage, dispatcher: new TestDispatcher(storage) }
    })
    const handle = createSynapse(factory)

    const first = await handle.ready()
    const firstSeen: number[] = []
    const firstSub = first.state$.subscribe((st) => firstSeen.push(st.count))

    await handle.destroy()
    expect(handle.isReady()).toBe(false)

    const second = await handle.ready()
    expect(factory).toHaveBeenCalledTimes(2)
    expect(second).not.toBe(first)
    expect(second.storage).not.toBe(first.storage)

    // Новый стор живёт; старая подписка не получает изменений нового стора.
    const seenBefore = firstSeen.length
    await second.dispatcher!.increment(7)
    await tick()
    expect(second.storage.getStateSync().count).toBe(7)
    expect(firstSeen.length).toBe(seenBefore)

    firstSub.unsubscribe()
    created.push(handle)
  })
})

// ── Интеграция: posts + core ────────────────────────────────────────────────
describe('интеграция posts+core', () => {
  it('эффект реагирует на core.state$ и на чужой экшен (externalDispatchers)', async () => {
    // CORE
    const coreHandle = createSynapse(() => {
      const storage = newCoreStorage()
      return { storage, dispatcher: new CoreDispatcher(storage) }
    })
    created.push(coreHandle)
    const core = await coreHandle

    // POSTS — эффекты на чужой стор и чужой экшен
    const userIds: Array<string | null> = []

    class PostsEffects extends Effects<State, TestDispatcher, { core: CoreDispatcher }> {
      constructor(private readonly core$: Observable<CoreState>) {
        super()
      }

      readonly trackUser = this.effect(() =>
        this.core$.pipe(
          map((c) => {
            userIds.push(c.userId)
            return EMPTY
          }),
          mergeMap(() => EMPTY),
        ),
      )

      readonly onLogout = this.effect((action$, _s$, { dispatcher: d, external }) =>
        action$.pipe(
          ofType(external.core.logout),
          mergeMap(() => {
            d.applyPosts([])
            return EMPTY
          }),
        ),
      )
    }

    const postsHandle = createSynapse(() => {
      const storage = newStorage({ ...initial(), list: [1, 2, 3] })
      return {
        storage,
        dispatcher: new TestDispatcher(storage),
        effects: new PostsEffects(core.state$),
        externalDispatchers: { core: core.dispatcher! },
      }
    })
    created.push(postsHandle)
    const posts = await postsHandle
    await tick()

    expect(userIds).toEqual([null]) // текущее значение чужого стора при подписке

    await core.dispatcher!.setUser('u-1')
    await tick()
    expect(userIds).toEqual([null, 'u-1'])

    expect(posts.storage.getStateSync().list).toEqual([1, 2, 3])
    await core.dispatcher!.logout()
    await tick()
    expect(posts.storage.getStateSync().list).toEqual([]) // чужой экшен дошёл до эффекта
  })
})

// ── Интеграция: шина событий ────────────────────────────────────────────────
describe('интеграция шина (event-bus)', () => {
  it('два модуля общаются через bus-синапс (externalDispatchers)', async () => {
    interface BusState extends Record<string, any> {
      _: number
    }
    class BusDispatcher extends Dispatcher<BusState> {
      readonly ping = this.signal<{ from: string }>()
    }

    const busHandle = createSynapse(() => {
      const storage = new MemoryStorage<BusState>({ name: `bus_${uid++}`, initialState: { _: 0 } })
      return { storage, dispatcher: new BusDispatcher(storage) }
    })
    created.push(busHandle)
    const bus = await busHandle

    const received: string[] = []

    class ConsumerEffects extends Effects<State, TestDispatcher, { bus: BusDispatcher }> {
      readonly onPing = this.effect((action$, _s$, { external }) =>
        action$.pipe(
          ofType(external.bus.ping),
          mergeMap((a) => {
            received.push(a.payload.from)
            return EMPTY
          }),
        ),
      )
    }

    const consumerHandle = createSynapse(() => {
      const storage = newStorage()
      return {
        storage,
        dispatcher: new TestDispatcher(storage),
        effects: new ConsumerEffects(),
        externalDispatchers: { bus: bus.dispatcher! },
      }
    })
    created.push(consumerHandle)
    await consumerHandle

    await bus.dispatcher!.ping({ from: 'producer-A' })
    await tick()
    expect(received).toEqual(['producer-A'])
  })
})
