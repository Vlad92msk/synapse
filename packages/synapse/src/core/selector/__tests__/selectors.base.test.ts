// Этап 3 ROADMAP — class-based `Selectors<TState>` (+ keyed) и `SelectorAPI.$`.
import { Observable } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { MemoryStorage } from '../../storage/adapters/memory-storage.service'
import type { SelectorAPI } from '../selector.interface'
import { SelectorModule } from '../selector.module'
import { Selectors } from '../selectors.base'

// ── Доменные типы ─────────────────────────────────────────────────────────────
interface PostsState extends Record<string, any> {
  list: number[]
  api: { postsRequest: { status: string }; loadMoreRequest: { status: string } }
  byTarget: Record<string, number[]>
}

const initialPosts = (): PostsState => ({
  list: [1, 2, 3],
  api: { postsRequest: { status: 'idle' }, loadMoreRequest: { status: 'idle' } },
  byTarget: { a: [10], b: [20] },
})

interface CoreState extends Record<string, any> {
  profile: { user_info: { id: string } } | null
}

const initialCore = (): CoreState => ({ profile: { user_info: { id: 'u1' } } })

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

// ── Селекторы (этап 3) ──────────────────────────────────────────────────────────
class CoreSelectors extends Selectors<CoreState> {
  readonly profile = this.select((s) => s.profile)
}

class PostsSelectors extends Selectors<PostsState> {
  constructor(
    source: MemoryStorage<PostsState>,
    private readonly core: CoreSelectors,
  ) {
    super(source)
  }

  // промежуточный приватный селектор — используется как зависимость
  private readonly apiSlice = this.select((s) => s.api)

  readonly list = this.select((s) => s.list)
  readonly postsStatus = this.combine([this.apiSlice], (a) => a.postsRequest.status)
  readonly isPostsLoading = this.combine([this.apiSlice], (a) => a.postsRequest.status === 'loading')

  // cross-store
  readonly currentUserId = this.combine([this.core.profile], (p) => p?.user_info?.id ?? null)

  // keyed
  readonly byTarget = this.keyed((key: string) => (s) => s.byTarget[key] ?? [])
}

let uid = 0
let postsStorage: MemoryStorage<PostsState>
let coreStorage: MemoryStorage<CoreState>
let core: CoreSelectors
let selectors: PostsSelectors

beforeEach(async () => {
  postsStorage = new MemoryStorage<PostsState>({ name: `posts_${uid++}`, initialState: initialPosts() })
  coreStorage = new MemoryStorage<CoreState>({ name: `core_${uid++}`, initialState: initialCore() })
  await postsStorage.initialize()
  await coreStorage.initialize()
  core = new CoreSelectors(coreStorage)
  selectors = new PostsSelectors(postsStorage, core)
})

afterEach(async () => {
  selectors.destroy()
  core.destroy()
  await postsStorage.destroy()
  await coreStorage.destroy()
})

describe('eager-материализация полей', () => {
  it('поля — настоящие SelectorAPI сразу после конструирования; select/selectSync/subscribe работают', () => {
    expect(typeof selectors.list.select).toBe('function')
    expect(selectors.list.select()).toEqual([1, 2, 3])
    expect(selectors.list.selectSync()).toEqual([1, 2, 3])
    expect(selectors.postsStatus.select()).toBe('idle')

    const received: number[][] = []
    const unsub = selectors.list.subscribe({ notify: (v) => { received.push(v) } })
    expect(received).toEqual([[1, 2, 3]]) // синхронный снапшот при подписке
    unsub()
  })

  it('combine поверх private-поля работает как зависимость и пересчитывается', async () => {
    const received: string[] = []
    selectors.postsStatus.subscribe({ notify: (v) => { received.push(v) } })
    expect(received).toEqual(['idle'])

    await postsStorage.update((s) => {
      s.api.postsRequest.status = 'loading'
    })
    await tick()

    expect(selectors.postsStatus.selectSync()).toBe('loading')
    expect(selectors.isPostsLoading.selectSync()).toBe(true)
    expect(received).toEqual(['idle', 'loading'])
  })
})

describe('cross-store', () => {
  it('combine([this.core.profile], ...) пересчитывается при изменении чужого стора', async () => {
    expect(selectors.currentUserId.selectSync()).toBe('u1')

    const received: Array<string | null> = []
    selectors.currentUserId.subscribe({ notify: (v) => { received.push(v) } })

    await coreStorage.update((s) => {
      s.profile = { user_info: { id: 'u2' } }
    })
    await tick()

    expect(selectors.currentUserId.selectSync()).toBe('u2')
    expect(received).toEqual(['u1', 'u2'])
  })
})

describe('keyed-селекторы', () => {
  it('один SelectorAPI на ключ (кэш по ключу)', () => {
    expect(selectors.byTarget('a')).toBe(selectors.byTarget('a'))
    expect(selectors.byTarget('a')).not.toBe(selectors.byTarget('b'))
    expect(selectors.byTarget('a').selectSync()).toEqual([10])
    expect(selectors.byTarget('b').selectSync()).toEqual([20])
  })

  it('обновление ключа A не уведомляет подписчиков ключа B', async () => {
    const aReceived: number[][] = []
    const bReceived: number[][] = []
    selectors.byTarget('a').subscribe({ notify: (v) => { aReceived.push(v) } })
    selectors.byTarget('b').subscribe({ notify: (v) => { bReceived.push(v) } })

    expect(aReceived).toEqual([[10]])
    expect(bReceived).toEqual([[20]])

    await postsStorage.update((s) => {
      s.byTarget = { ...s.byTarget, a: [10, 11] }
    })
    await tick()

    expect(aReceived).toEqual([[10], [10, 11]]) // A уведомлён
    expect(bReceived).toEqual([[20]]) // B — нет, ссылка прежняя
  })

  it('destroy класса чистит keyed-кэш', () => {
    const before = selectors.byTarget('a')
    selectors.destroy()
    const after = selectors.byTarget('a')
    expect(after).not.toBe(before) // кэш очищен — создан заново
  })
})

describe('SelectorAPI.$', () => {
  it('эмит текущего значения при подписке + при каждом реальном изменении', async () => {
    expect(selectors.postsStatus.$).toBeInstanceOf(Observable)

    const received: string[] = []
    const sub = selectors.postsStatus.$.subscribe((v) => { received.push(v) })
    expect(received).toEqual(['idle']) // снапшот при подписке

    await postsStorage.update((s) => {
      s.api.postsRequest.status = 'loading'
    })
    await tick()
    await postsStorage.update((s) => {
      s.api.postsRequest.status = 'loading' // то же значение → без эмита
    })
    await tick()
    await postsStorage.update((s) => {
      s.api.postsRequest.status = 'success'
    })
    await tick()

    expect(received).toEqual(['idle', 'loading', 'success'])
    sub.unsubscribe()
  })

  it('совместим с pipe(debounceTime) — задебаунсенное производное прямо из селектора', async () => {
    vi.useFakeTimers()
    try {
      const received: string[] = []
      const sub = selectors.postsStatus.$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((v) => { received.push(v) })

      await postsStorage.update((s) => {
        s.api.postsRequest.status = 'a'
      })
      await postsStorage.update((s) => {
        s.api.postsRequest.status = 'b'
      })
      // быстрые изменения — debounce проглатывает промежуточные
      vi.advanceTimersByTime(300)
      expect(received).toEqual(['b'])

      sub.unsubscribe()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('destroy и владение модулем', () => {
  it('свой модуль (из storage) уничтожается: подписки сняты', async () => {
    const received: number[][] = []
    selectors.list.subscribe({ notify: (v) => { received.push(v) } })
    expect(received).toHaveLength(1)

    selectors.destroy()

    await postsStorage.update((s) => {
      s.list = [9]
    })
    await tick()

    expect(received).toHaveLength(1) // после destroy уведомлений нет
  })

  it('чужой (переданный) модуль не уничтожается; удаляются только свои селекторы', async () => {
    const sharedStorage = new MemoryStorage<PostsState>({ name: `shared_${uid++}`, initialState: initialPosts() })
    await sharedStorage.initialize()
    const sharedModule = new SelectorModule<PostsState>(sharedStorage)

    // независимый селектор на общем модуле — должен пережить destroy класса
    const survivor = sharedModule.createSelector((s) => s.list)
    const survivorReceived: number[][] = []
    survivor.subscribe({ notify: (v) => { survivorReceived.push(v) } })

    class SharedSelectors extends Selectors<PostsState> {
      readonly status = this.select((s) => s.api.postsRequest.status)
    }
    const shared = new SharedSelectors(sharedModule)
    const ownReceived: string[] = []
    shared.status.subscribe({ notify: (v) => { ownReceived.push(v) } })

    shared.destroy()

    await sharedStorage.update((s) => {
      s.list = [42]
      s.api.postsRequest.status = 'loading'
    })
    await tick()

    expect(survivorReceived).toEqual([[1, 2, 3], [42]]) // чужой модуль жив
    expect(ownReceived).toEqual(['idle']) // свой селектор отписан destroy-ем

    sharedModule.destroy()
    await sharedStorage.destroy()
  })
})

describe('SelectorModule.removeSelector', () => {
  it('точечная отписка: остальные селекторы модуля живы', async () => {
    const sm = new SelectorModule<PostsState>(postsStorage)
    const a = sm.createSelector((s) => s.list, { name: 'a' })
    const b = sm.createSelector((s) => s.api.postsRequest.status, { name: 'b' })

    const aReceived: number[][] = []
    const bReceived: string[] = []
    a.subscribe({ notify: (v) => { aReceived.push(v) } })
    b.subscribe({ notify: (v) => { bReceived.push(v) } })

    sm.removeSelector(a.getId())

    await postsStorage.update((s) => {
      s.list = [7]
      s.api.postsRequest.status = 'loading'
    })
    await tick()

    expect(aReceived).toEqual([[1, 2, 3]]) // a удалён — не уведомлён
    expect(bReceived).toEqual(['idle', 'loading']) // b жив

    sm.destroy()
  })
})

describe('совместимость со старым createSynapse(config)', () => {
  it('инстанс класса как результат createSelectorsFn (принимает ISelectorModule)', () => {
    const sm = new SelectorModule<PostsState>(postsStorage)
    // эмуляция вызова createSelectorsFn(selectorModule) старым сборщиком
    const createSelectorsFn = (selectorModule: SelectorModule<PostsState>) => new SharedSelectorsCompat(selectorModule)

    class SharedSelectorsCompat extends Selectors<PostsState> {
      readonly list = this.select((s) => s.list)
    }

    const instance = createSelectorsFn(sm)
    expect(instance.list.select()).toEqual([1, 2, 3])
    sm.destroy()
  })
})

// ── 5.1 — dev-guard: combine с undefined-зависимостью ───────────────────────────
describe('combine: dev-проверка зависимостей (5.1)', () => {
  it('бросает понятную ошибку, если зависимость undefined (ловушка useDefineForClassFields)', () => {
    // Имитируем cross-store селектор, чья зависимость (`this.core.x`) ещё не присвоена —
    // при useDefineForClassFields:true она оказалась бы undefined в инициализаторе поля.
    class Broken extends Selectors<PostsState> {
      readonly oops = this.combine([undefined as unknown as SelectorAPI<number>], (x) => x)
    }

    expect(() => new Broken(postsStorage)).toThrow(/combine\(\): зависимость #0/)
    expect(() => new Broken(postsStorage)).toThrow(/useDefineForClassFields/)
  })

  it('валидные зависимости (включая cross-store) не триггерят guard', () => {
    expect(() => new PostsSelectors(postsStorage, core)).not.toThrow()
  })
})

describe('строгая типизация (компилируемые type-тесты)', () => {
  it('select/combine/keyed возвращают SelectorAPI; combine типизирует зависимости', () => {
    class Typed extends Selectors<PostsState> {
      readonly list = this.select((s) => s.list)
      readonly first = this.combine([this.list], (l) => l[0])
      readonly byKey = this.keyed((k: string) => (s) => s.byTarget[k])
    }
    const t = new Typed(postsStorage)

    expectTypeOf(t.list).toEqualTypeOf<SelectorAPI<number[]>>()
    expectTypeOf(t.first).toEqualTypeOf<SelectorAPI<number>>()
    expectTypeOf(t.byKey).toEqualTypeOf<(key: string) => SelectorAPI<number[]>>()

    t.destroy()
  })

  // Регрессия: внутренние члены базы — hard-private (`#`), поэтому подкласс волен
  // называть селекторы любыми «частыми» именами (раньше `track` был приватным методом
  // базы → TS2415 «incorrectly extends base class» + каскадное схлопывание типа подкласса).
  it('поле-селектор с именем ранее-приватного члена базы (`track`) компилируется и работает', () => {
    class WithTrack extends Selectors<PostsState> {
      readonly track = this.select((s) => s.list)
    }
    const t = new WithTrack(postsStorage)

    // тип НЕ схлопнулся до базового Selectors — поле осталось настоящим SelectorAPI
    expectTypeOf(t.track).toEqualTypeOf<SelectorAPI<number[]>>()
    expect(t.track.select()).toEqual([1, 2, 3])

    t.destroy()
  })
})
