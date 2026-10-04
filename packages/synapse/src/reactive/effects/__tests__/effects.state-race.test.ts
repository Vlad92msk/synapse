// Регресс: экшены, проигранные из pre-start буфера (и живые экшены сразу после старта), терялись
// в эффектах с `withLatestFrom(state$)`. state$ отдавал первое значение через микротаск
// (`Promise.resolve(getState())`), а буфер сливался синхронно — withLatestFrom по контракту RxJS
// молча отбрасывает значения, пришедшие до первой эмиссии второго потока. Плюс `share()` не отдавал
// текущее состояние позднему подписчику.
import 'fake-indexeddb/auto'

import { firstValueFrom } from 'rxjs'
import { map, take, tap, toArray, withLatestFrom } from 'rxjs/operators'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { IndexedDBStorage } from '../../../core/storage/adapters/indexed-DB.service'
import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import type { IStorage } from '../../../core/storage/storage.interface'
import { Dispatcher } from '../../dispatcher/dispatcher.base'
import { EffectsModule, ofType, selectorObject } from '../effects.module'
import { PreStartActionBuffer } from '../preStartActionBuffer'

interface State extends Record<string, any> {
  count: number
}

class TestDispatcher extends Dispatcher<State> {
  readonly mounted = this.action((_s, n: number) => n)
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

let uid = 0
type Kind = 'memory' | 'indexedDB'
function makeStorage(kind: Kind): IStorage<State> {
  const name = `race_${kind}_${uid++}`
  return kind === 'memory'
    ? new MemoryStorage<State>({ name, initialState: { count: 42 } })
    : new IndexedDBStorage<State>({ name, initialState: { count: 42 }, options: { dbName: `race_db_${uid++}` } })
}

/** Эффект как `PostsEffects.mounted` в sn_client: ofType → withLatestFrom(selectorObject(state$)). */
function withStateEffect(seen: Array<[number, number]>) {
  return (action$: any, state$: any, { dispatcher }: any) =>
    action$.pipe(
      ofType(dispatcher.dispatch.mounted),
      withLatestFrom(selectorObject(state$, { count: (s: State) => s.count })),
      tap(([a, { count }]: [{ payload: number }, { count: number }]) => seen.push([a.payload, count])),
    )
}

describe.each<Kind>(['memory', 'indexedDB'])('EffectsModule — state$ и pre-start буфер (%s)', (kind) => {
  let storage: IStorage<State>
  let d: TestDispatcher

  beforeEach(async () => {
    storage = makeStorage(kind)
    await storage.initialize()
    d = new TestDispatcher(storage as any)
  })

  afterEach(async () => {
    await storage.destroy()
  })

  it('экшен до start() доходит до эффекта с withLatestFrom(state$)', async () => {
    const seen: Array<[number, number]> = []
    const buffer = new PreStartActionBuffer(d.actions)
    await d.mounted(1) // маунт-диспатч до старта эффектов → в буфер

    const mod = new EffectsModule(storage, d)
    mod.setPreStartBuffer(buffer)
    mod.add(withStateEffect(seen))
    await mod.start()
    await tick()

    expect(seen).toEqual([[1, 42]])
    mod.stop()
  })

  it('экшен, задиспатченный эффектом во время старта, не теряется, не дублируется и идёт после буфера', async () => {
    const seen: Array<[number, number]> = []
    const buffer = new PreStartActionBuffer(d.actions)
    await d.mounted(1)

    const mod = new EffectsModule(storage, d)
    mod.setPreStartBuffer(buffer)
    mod.add(withStateEffect(seen))
    // Второй эффект диспатчит на первой эмиссии state$ (теперь — синхронно на подписке, внутри
    // start()): живой экшен из окна «подписка на диспетчеры есть, слив буфера ещё идёт».
    mod.add((_a$, state$, { dispatcher }) =>
      state$.pipe(
        take(1),
        tap(() => dispatcher.dispatch.mounted(2)),
        map(() => undefined),
      ),
    )
    await mod.start()
    await tick()

    // Буферный (более ранний) экшен — первым: диспетчер эмитит живой экшен после await, т.е.
    // уже после синхронного слива буфера.
    expect(seen).toEqual([
      [1, 42],
      [2, 42],
    ])
    mod.stop()
  })

  it('эффект на state$ диспатчит на первой эмиссии → доходит до эффекта, подписанного ПОЗЖЕ', async () => {
    // Как `allowlistGate` в sn_client: state$ → filter → dispatch, а слушатель объявлен ниже.
    // state$ теперь эмитит синхронно на подписке — экшен не должен уйти раньше, чем подписан
    // слушатель (гарантия: диспетчер эмитит после await).
    const seen: number[] = []
    const mod = new EffectsModule(storage, d)
    mod.add((_a$, state$, { dispatcher }) =>
      state$.pipe(
        take(1),
        tap((s) => dispatcher.dispatch.mounted(s.count)),
        map(() => undefined),
      ),
    )
    mod.add((action$, _s$, { dispatcher }) =>
      action$.pipe(
        ofType(dispatcher.dispatch.mounted),
        tap((a) => seen.push(a.payload)),
      ),
    )
    await mod.start()
    await tick()

    expect(seen).toEqual([42])
    mod.stop()
  })

  it('поздний подписчик state$ сразу получает текущее состояние', async () => {
    const mod = new EffectsModule(storage, d)
    const early: number[] = []
    const earlySub = mod.state$.subscribe((s) => early.push(s.count))

    let late: number | undefined
    mod.state$.subscribe((s) => (late = s.count)).unsubscribe()

    // Синхронно, без микротаска: значение уже есть.
    expect(early).toEqual([42])
    expect(late).toBe(42)
    earlySub.unsubscribe()
  })

  it('state$ отдаёт актуальное значение после изменения хранилища', async () => {
    const mod = new EffectsModule(storage, d)
    const values = firstValueFrom(
      mod.state$.pipe(
        map((s) => s.count),
        take(2),
        toArray(),
      ),
    )
    await (storage as any).update((s: State) => {
      s.count = 43
    })
    expect(await values).toEqual([42, 43])

    let late: number | undefined
    mod.state$.subscribe((s) => (late = s.count)).unsubscribe()
    expect(late).toBe(43)
  })

  it('stop() → start(): буфер нового цикла снова доходит до withLatestFrom-эффекта', async () => {
    const seen: Array<[number, number]> = []
    const mod = new EffectsModule(storage, d)
    mod.add(withStateEffect(seen))
    await mod.start()
    await d.mounted(1)
    await tick()
    mod.stop()

    mod.setPreStartBuffer(new PreStartActionBuffer(d.actions))
    await d.mounted(2) // до повторного старта → в буфер
    await mod.start()
    await d.mounted(3)
    await tick()

    expect(seen).toEqual([
      [1, 42],
      [2, 42],
      [3, 42],
    ])
    mod.stop()
  })
})
