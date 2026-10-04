/**
 * Семантика потоков ядра при переходе в rxjs через toObservable — то, на что опираются
 * `withLatestFrom(toObservable(otherSynapse.state$))` и подписки в компонентах:
 *
 * - `synapse.state$` и `selector.$` — текущее значение СРАЗУ при подписке (каждому подписчику, в т.ч. позднему);
 * - `dispatcher.action$` — горячий поток без replay: подписчик видит только экшены после подписки.
 */
import { firstValueFrom, Subject } from 'rxjs'
import { take, toArray, withLatestFrom } from 'rxjs/operators'
import { afterEach, describe, expect, it } from 'vitest'

import { MemoryStorage } from '../../../../core/storage/adapters/memory-storage.service'
import { Selectors } from '../../../../core/selector/selectors.base'
import { createSynapse } from '../../../../utils/createSynapse/createSynapse'
import { Dispatcher } from '../../../dispatcher/dispatcher.base'
import { toObservable } from '../toObservable'

interface S {
  n: number
}

class D extends Dispatcher<S> {
  readonly inc = this.action((store) => store.update((s) => (s.n += 1)))
}

class Sel extends Selectors<S> {
  readonly n = this.select((s) => s.n)
}

let uid = 0
const created: Array<{ destroy: () => Promise<void> }> = []
const makeModule = () => {
  const handle = createSynapse({
    storage: () => new MemoryStorage<S>({ name: `tos_${uid++}`, initialState: { n: 0 } }),
    dispatcher: (s) => new D(s),
    selectors: (s) => new Sel(s),
  })
  created.push(handle)
  return handle
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((h) => h.destroy()))
})

describe('toObservable(поток ядра) — семантика replay', () => {
  it('synapse.state$: текущее значение сразу при подписке — и раннему, и позднему подписчику', async () => {
    const mod = makeModule()
    const core$ = toObservable(mod.state$)

    const early: number[] = []
    const sub = core$.subscribe((s) => early.push(s.n))
    expect(early).toEqual([0])

    await mod.dispatcher.inc()
    expect(early).toEqual([0, 1])

    // Поздний подписчик сразу получает актуальное состояние (BehaviorSubject-семантика).
    await expect(firstValueFrom(core$)).resolves.toEqual({ n: 1 })
    sub.unsubscribe()
  })

  it('withLatestFrom(toObservable(state$)): экшен сразу после подписки видит актуальное состояние', async () => {
    const mod = makeModule()
    await mod.dispatcher.inc()

    const trigger = new Subject<string>()
    const seen = firstValueFrom(trigger.pipe(withLatestFrom(toObservable(mod.state$)), take(1)))
    trigger.next('mounted')
    await expect(seen).resolves.toEqual(['mounted', { n: 1 }])
  })

  it('selector.$: текущее значение сразу при подписке', async () => {
    const mod = makeModule()
    await mod.dispatcher.inc()
    await expect(firstValueFrom(toObservable(mod.selectors.n))).resolves.toBe(1)
    await expect(firstValueFrom(toObservable(mod.selectors.n.$))).resolves.toBe(1)
  })

  it('dispatcher.action$: без replay — только экшены после подписки', async () => {
    const mod = makeModule()
    await mod.dispatcher.inc() // до подписки — не увидим

    const types = firstValueFrom(toObservable(mod.dispatcher.action$).pipe(take(1), toArray()))
    await mod.dispatcher.inc()
    const [action] = await types
    expect(action.type).toContain('inc')
    expect(action.payload).toBeUndefined()
  })
})
