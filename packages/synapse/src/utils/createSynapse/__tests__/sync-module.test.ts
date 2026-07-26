// @vitest-environment node
//
// Phase C — синхронная конструкция (createSyncSynapseModule через объектную форму БЕЗ wire):
// расцеп конструкции и старта эффектов, синхронный доступ к main-ядру, cross-store DI через
// конструктор (без combineAcross), гейт старта эффектов на ready() после dependencies.
import { EMPTY, mergeMap } from 'rxjs'
import { describe, expect, it } from 'vitest'

import { LocalStorage } from '../../../core/storage/adapters/local-storage.service'
import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { browserStorage } from '../../../core/storage/browser-storage.util'
import { StorageStatus } from '../../../core/storage/storage.interface'
import { Selectors } from '../../../core/selector/selectors.base'
import { Dispatcher } from '../../../reactive/dispatcher/dispatcher.base'
import { Effects } from '../../../reactive/effects/effects.base'
import { ofType } from '../../../reactive/effects/effects.module'
import { createSynapse } from '../createSynapse'

interface CoreState extends Record<string, any> {
  profile: { id: number } | null
}
interface PostsState extends Record<string, any> {
  list: number[]
}

let uid = 0
const nm = (p: string) => `${p}_${uid++}`

class CoreSelectors extends Selectors<CoreState> {
  readonly profile = this.select((s) => s.profile)
}
class CoreDispatcher extends Dispatcher<CoreState> {
  readonly setProfile = this.action((store, profile: CoreState['profile']) => store.update((s) => (s.profile = profile)))
}

describe('createSynapse — синхронная (C) форма', () => {
  it('конструирует ядро СИНХРОННО: selectors/storage доступны до ready()', () => {
    const core = createSynapse({
      storage: () => new MemoryStorage<CoreState>({ name: nm('core'), initialState: { profile: null } }),
      dispatcher: (s) => new CoreDispatcher(s),
      selectors: (s) => new CoreSelectors(s),
    })

    // Синхронный доступ — БЕЗ await/ready.
    expect(core.selectors).toBeInstanceOf(CoreSelectors)
    expect(core.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(core.selectors.profile.selectSync()).toBeNull()
    expect(core.isReady()).toBe(true)
  })

  it('cross-store DI через КОНСТРУКТОР: чужие selectors передаются синхронно (как раньше)', async () => {
    const core = createSynapse({
      storage: () => new MemoryStorage<CoreState>({ name: nm('core'), initialState: { profile: { id: 7 } } }),
      dispatcher: (s) => new CoreDispatcher(s),
      selectors: (s) => new CoreSelectors(s),
    })

    // PostsSelectors принимает core.selectors в конструкторе и делает обычный combine — без combineAcross.
    class PostsSelectors extends Selectors<PostsState> {
      readonly list = this.select((s) => s.list)
      readonly currentUserId = this.combine([this.core.profile], (p) => p?.id ?? null)
      constructor(
        storage: MemoryStorage<PostsState>,
        private readonly core: CoreSelectors,
      ) {
        super(storage)
      }
    }

    const posts = createSynapse({
      storage: () => new MemoryStorage<PostsState>({ name: nm('posts'), initialState: { list: [] } }),
      // Синхронный доступ к чужому стору прямо в конструкторе селекторов.
      selectors: (s) => new PostsSelectors(s, core.selectors),
    })

    expect(posts.selectors.currentUserId.selectSync()).toBe(7)

    // Реактивность cross-store: меняем core → currentUserId пересчитывается.
    const received: (number | null)[] = []
    posts.selectors.currentUserId.subscribe({ notify: (v) => received.push(v) })
    await core.selectors.profile // no-op await для читаемости
    core.actions.setProfile({ id: 99 })
    await new Promise((r) => setTimeout(r, 0))
    expect(posts.selectors.currentUserId.selectSync()).toBe(99)
    expect(received.at(-1)).toBe(99)

    await posts.destroy()
    await core.destroy()
  })

  it('эффекты стартуют ТОЛЬКО на ready() (не на синхронной конструкции)', async () => {
    const started: string[] = []
    class PostsDispatcher extends Dispatcher<PostsState> {
      readonly ping = this.action((store) => store.update((s) => s.list.push(1)))
    }
    class PostsEffects extends Effects<PostsState, PostsDispatcher> {
      readonly boot = this.effect((action$) => {
        started.push('effect-constructed-and-started')
        return action$.pipe(mergeMap(() => EMPTY))
      })
    }

    const posts = createSynapse({
      storage: () => new MemoryStorage<PostsState>({ name: nm('posts'), initialState: { list: [] } }),
      dispatcher: (s) => new PostsDispatcher(s),
      effects: () => new PostsEffects(),
    })

    // Синхронная конструкция — эффекты НЕ стартовали.
    expect(posts.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(started).toEqual([])

    // ready() — main тот же (синхронно построенный), эффекты запущены.
    const ready = await posts.ready()
    expect(ready.storage).toBe(posts.storage) // тот же самый main, не пересобран
    expect(started).toEqual(['effect-constructed-and-started'])

    await posts.destroy()
  })

  it('ready({ withEffects: false }) — серверный прогрев: конструкция без эффектов', async () => {
    const started: string[] = []
    class E extends Effects<PostsState, any> {
      readonly boot = this.effect((a$) => {
        started.push('x')
        return a$.pipe(mergeMap(() => EMPTY))
      })
    }
    const posts = createSynapse({
      storage: () => new MemoryStorage<PostsState>({ name: nm('posts'), initialState: { list: [] } }),
      dispatcher: (s) => new (class extends Dispatcher<PostsState> {})(s),
      effects: () => new E(),
    })
    const s = await posts.ready({ withEffects: false })
    expect(s.storage.getStateSync()).toEqual({ list: [] })
    expect(started).toEqual([])
    await posts.destroy()
  })

  it('async фабрика effects + dependencies: endpoints резолвятся на ready(), после готовности deps', async () => {
    const order: string[] = []

    const core = createSynapse({
      storage: () => new MemoryStorage<CoreState>({ name: nm('core'), initialState: { profile: null } }),
      selectors: (s) => new CoreSelectors(s),
    })

    class PostsDispatcher extends Dispatcher<PostsState> {
      readonly ping = this.action((store) => store.update((s) => s.list.push(1)))
    }
    class PostsEffects extends Effects<PostsState, PostsDispatcher> {
      constructor(private readonly api: { tag: string }) {
        super()
      }
      readonly boot = this.effect((action$) => {
        order.push(`effect-start:${this.api.tag}`)
        return action$.pipe(mergeMap(() => EMPTY))
      })
    }

    const getEndpoints = async () => {
      order.push('resolve-endpoints')
      return { tag: 'posts-api' }
    }

    const posts = createSynapse({
      storage: () => new MemoryStorage<PostsState>({ name: nm('posts'), initialState: { list: [] } }),
      dispatcher: (s) => new PostsDispatcher(s),
      dependencies: [core],
      effects: async () => new PostsEffects(await getEndpoints()),
    })

    // Синхронная конструкция — ни deps-ожидания, ни резолва endpoints, ни старта эффектов.
    expect(posts.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(order).toEqual([])

    await posts.ready()
    // endpoints резолвнуты, эффект запущен (после того как dependency core стал ready).
    expect(order).toEqual(['resolve-endpoints', 'effect-start:posts-api'])

    await posts.destroy()
    await core.destroy()
  })

  it('externalDispatchers (ленивая функция): чужой экшен вливается в action$ эффекта', async () => {
    interface BusState extends Record<string, any> {
      _: number
    }
    class BusDispatcher extends Dispatcher<BusState> {
      readonly ping = this.signal<{ from: string }>()
    }

    // Ленивый: bus-стор НЕ конструируется на импорте — только когда consumer стартует эффекты.
    let busConstructed = false
    const bus = createSynapse({
      storage: () => {
        busConstructed = true
        return new MemoryStorage<BusState>({ name: nm('bus'), initialState: { _: 0 } })
      },
      dispatcher: (s) => new BusDispatcher(s),
    })

    const received: string[] = []
    class ConsumerEffects extends Effects<PostsState, any, { bus: BusDispatcher }> {
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

    const consumer = createSynapse({
      storage: () => new MemoryStorage<PostsState>({ name: nm('consumer'), initialState: { list: [] } }),
      dispatcher: (s) => new (class extends Dispatcher<PostsState> {})(s),
      dependencies: [bus],
      // Функция-форма: резолвится лениво на старте эффектов, не форсит конструкцию bus на импорте.
      externalDispatchers: () => ({ bus: bus.dispatcher }),
      effects: () => new ConsumerEffects(),
    })

    // До ready() consumer'а bus не тронут.
    expect(busConstructed).toBe(false)

    await consumer.ready()
    expect(busConstructed).toBe(true)

    bus.dispatcher.ping({ from: 'producer-A' })
    await new Promise((r) => setTimeout(r, 0))
    expect(received).toEqual(['producer-A'])

    await consumer.destroy()
    await bus.destroy()
  })

  it('server-safe storage: Memory на сервере / Local на клиенте — синхронная конструкция не падает в Node', () => {
    // Паттерн для LocalStorage-модулей: у LocalStorage нет `localStorage` в Node, поэтому фабрика
    // ветвится по окружению. Обе ветки — sync-хранилища одной формы → `StateOf` выводит TState из
    // union'а, синхронная конструкция работает и на сервере (Memory), и на клиенте (Local).
    const isServer = typeof window === 'undefined'
    const prefs = createSynapse({
      storage: () =>
        isServer
          ? new MemoryStorage<PostsState>({ name: nm('prefs'), initialState: { list: [] } })
          : new LocalStorage<PostsState>({ name: nm('prefs'), initialState: { list: [] } }),
      selectors: (s) =>
        new (class extends Selectors<PostsState> {
          readonly list = this.select((st) => st.list)
        })(s),
    })

    // @vitest-environment node → isServer === true → Memory-ветка, конструкция синхронна и безопасна.
    expect(prefs.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(prefs.selectors.list.selectSync()).toEqual([])
  })

  it('postConstruct: синхронный хук после конструкции (storage READY, dispatcher финализирован)', () => {
    class PrefsDispatcher extends Dispatcher<PostsState> {
      // «Транзитный» флаг: имитируем гашение до первого рендера.
      readonly resetTransient = this.action((store) => store.update((s) => (s.list = [])))
    }

    const seen: Array<{ ready: boolean; hasDispatcher: boolean }> = []
    const prefs = createSynapse(
      {
        // initialState с «грязным» транзитом (как persisted-стор после перезагрузки).
        storage: () => new MemoryStorage<PostsState>({ name: nm('prefs'), initialState: { list: [1, 2, 3] } }),
        dispatcher: (s) => new PrefsDispatcher(s),
      },
      {
        // postConstruct — ВТОРОЙ аргумент. Параметр колбэка БЕЗ аннотации: `actions` контекстно
        // типизируется как PrefsDispatcher (проверка #1 под strict — иначе implicit-any не скомпилится).
        postConstruct: ({ storage, actions }) => {
          seen.push({ ready: storage.initStatus.status === StorageStatus.READY, hasDispatcher: !!actions })
          actions.resetTransient() // dispatcher уже финализирован → экшен работает
        },
      },
    )

    // Конструкция ленивая: первый доступ к стору строит main → postConstruct отрабатывает синхронно.
    expect(prefs.storage.getStateSync().list).toEqual([]) // транзит погашен ДО чтения состояния
    // Хук видел READY-storage и финализированный dispatcher.
    expect(seen).toEqual([{ ready: true, hasDispatcher: true }])
  })

  it('postConstruct: ошибка откатывает конструкцию (fail-fast)', () => {
    expect(
      () =>
        createSynapse(
          { storage: () => new MemoryStorage<PostsState>({ name: nm('boom'), initialState: { list: [] } }) },
          {
            postConstruct: () => {
              throw new Error('boom')
            },
          },
        ).storage,
    ).toThrow('boom')
  })

  it('createSynapse.of: явные дженерики без fall-through на legacy-перегрузку (deps/effects ок)', async () => {
    class PrefsDispatcher extends Dispatcher<PostsState> {
      readonly reset = this.action((store) => store.update((s) => (s.list = [])))
    }
    const core = createSynapse({
      storage: () => new MemoryStorage<CoreState>({ name: nm('core'), initialState: { profile: null } }),
      selectors: (s) => new CoreSelectors(s),
    })

    // Явные <State, Disp, Sel> + dependencies + postConstruct — раньше это роняло вызов на wire-конфиг.
    const prefs = createSynapse.of<PostsState, PrefsDispatcher>(
      {
        storage: () => new MemoryStorage<PostsState>({ name: nm('prefs'), initialState: { list: [1, 2] } }),
        dispatcher: (s) => new PrefsDispatcher(s),
        dependencies: [core],
      },
      { postConstruct: ({ actions }) => actions.reset() },
    )

    expect(prefs.storage.getStateSync().list).toEqual([]) // postConstruct отработал
    await prefs.ready()
    await prefs.destroy()
    await core.destroy()
  })

  it('browserStorage: на сервере (node) — Memory-ветвь, client-фабрика не зовётся', () => {
    let clientCalled = false
    const prefs = createSynapse({
      storage: browserStorage<PostsState>(
        { name: nm('prefs'), initialState: { list: [] } },
        {
          client: () => {
            clientCalled = true
            return new LocalStorage<PostsState>({ name: nm('prefs'), initialState: { list: [] } })
          },
        },
      ),
      selectors: (s) =>
        new (class extends Selectors<PostsState> {
          readonly list = this.select((st) => st.list)
        })(s),
    })

    // @vitest-environment node → нет window → Memory-ветвь; LocalStorage (client) не тронут (нет крэша SSR).
    expect(prefs.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(clientCalled).toBe(false)
    expect(prefs.selectors.list.selectSync()).toEqual([])
  })

  it('browserStorage: isServer:()=>false → зовётся client-фабрика, получает переданный config', () => {
    // Реальный LocalStorage в node крешнул бы (нет localStorage), поэтому проверяем ветвление на
    // фейковом client-сторе: важно, что при client-ветке зовётся именно client(config) с тем же config.
    let gotConfig: { name: string } | undefined
    const prefs = createSynapse({
      storage: browserStorage<PostsState>(
        { name: nm('prefs'), initialState: { list: [] } },
        {
          isServer: () => false, // форсим client-ветку в node
          client: (cfg) => {
            gotConfig = cfg
            return new MemoryStorage<PostsState>(cfg) // заглушка вместо LocalStorage
          },
        },
      ),
      selectors: (s) =>
        new (class extends Selectors<PostsState> {
          readonly list = this.select((st) => st.list)
        })(s),
    })

    // Обращение к геттеру строит main лениво → тут и зовётся storage-фабрика (client-ветка).
    expect(prefs.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(gotConfig?.name).toContain('prefs') // client получил исходный config
    expect(prefs.selectors.list.selectSync()).toEqual([])
  })

  it('buildSyncShell — свежее throwaway-ядро, изолированное от main', () => {
    const core = createSynapse({
      storage: () => new MemoryStorage<CoreState>({ name: nm('core'), initialState: { profile: null } }),
      selectors: (s) => new CoreSelectors(s),
    })
    const shell = core.buildSyncShell!()!
    expect(shell.storage).not.toBe(core.storage)
    shell.storage.set('profile', { id: 1 })
    expect(core.storage.getStateSync().profile).toBeNull() // main не затронут
  })
})
