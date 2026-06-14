// Страховочные тесты EffectsModule и операторов (этап 0 ROADMAP).
import { EMPTY, lastValueFrom, Observable, of, Subject, throwError } from 'rxjs'
import { catchError, map, take, tap, toArray } from 'rxjs/operators'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { Dispatcher } from '../../dispatcher/dispatcher.base'
import { Effects } from '../effects.base'
import { ApiError, apiResult, EffectsModule, ofType, ofTypes, selectorObject, validateMap } from '../effects.module'
import { fromRequest } from '../utils/fromRequest'

interface State extends Record<string, any> {
  count: number
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

class TestDispatcher extends Dispatcher<State> {
  readonly increment = this.action((_s, n: number) => n)
  readonly ping = this.action(() => 'pong')
}

class ExtDispatcher extends Dispatcher<State> {
  readonly extPing = this.action(() => 'ext')
}

function makeDispatcher(storage: MemoryStorage<State>) {
  return new TestDispatcher(storage)
}

describe('EffectsModule — lifecycle', () => {
  let storage: MemoryStorage<State>
  let d: ReturnType<typeof makeDispatcher>

  beforeEach(async () => {
    storage = new MemoryStorage<State>({ name: `eff_${Math.random()}`, initialState: { count: 0 } })
    await storage.initialize()
    d = makeDispatcher(storage)
  })

  afterEach(async () => {
    await storage.destroy()
  })

  it('эффект вызывается один раз при start() с (action$, state$, context)', async () => {
    const effect = vi.fn(() => EMPTY)
    const mod = new EffectsModule(storage, d)
    mod.add(effect)

    expect(effect).not.toHaveBeenCalled() // не запущен — не вызван

    await mod.start()
    expect(effect).toHaveBeenCalledTimes(1)

    const [action$, state$, ctx] = effect.mock.calls[0]
    expect(action$).toBeInstanceOf(Observable)
    expect(state$).toBeInstanceOf(Observable)
    expect(ctx.dispatcher).toBe(d)

    mod.stop()
  })

  it('экшены основного диспетчера попадают в action$ эффекта', async () => {
    const seen: number[] = []
    const mod = new EffectsModule(storage, d)
    mod.add((action$, _s$, { dispatcher }) => action$.pipe(ofType(dispatcher.dispatch.increment), tap((a) => seen.push(a.payload))))
    await mod.start()

    await d.increment(3)
    await tick()

    expect(seen).toEqual([3])
    mod.stop()
  })

  it('экшены внешнего диспетчера мультиплексируются в общий action$', async () => {
    const storageB = new MemoryStorage<State>({ name: `effB_${Math.random()}`, initialState: { count: 0 } })
    await storageB.initialize()
    const d2 = new ExtDispatcher(storageB)

    const seen: string[] = []
    const mod = new EffectsModule(storage, d, { other: d2 as any })
    mod.add((action$, _s$, { externalDispatchers }) => action$.pipe(ofType(externalDispatchers.other.dispatch.extPing), tap((a) => seen.push(a.payload as string))))
    await mod.start()

    await d2.extPing()
    await tick()

    expect(seen).toEqual(['ext'])
    mod.stop()
    await storageB.destroy()
  })

  it('state$: текущее значение + эмит на каждое изменение storage', async () => {
    const states: number[] = []
    const mod = new EffectsModule(storage, d)
    mod.add((_a$, state$) => state$.pipe(tap((s) => states.push(s.count))))
    await mod.start()
    await tick()

    expect(states[0]).toBe(0)

    await storage.update((s) => {
      s.count = 1
    })
    await tick()
    expect(states).toContain(1)

    mod.stop()
  })

  it('externalStates: IStorage нормализуется в Observable', async () => {
    const storageB = new MemoryStorage<{ val: number }>({ name: `extS_${Math.random()}`, initialState: { val: 1 } })
    await storageB.initialize()

    let isObservable = false
    const extStates: number[] = []
    const mod = new EffectsModule(storage, d, {}, {}, {}, { ext: storageB })
    mod.add((_a$, _s$, { externalStates }) => {
      isObservable = externalStates.ext instanceof Observable
      return externalStates.ext.pipe(tap((s: any) => extStates.push(s.val)))
    })
    await mod.start()
    await tick()

    expect(isObservable).toBe(true)
    expect(extStates).toContain(1)

    mod.stop()
    await storageB.destroy()
  })

  it('Observable эффекта эмитит функцию → она вызывается', async () => {
    let called = false
    const mod = new EffectsModule(storage, d)
    mod.add((action$, _s$, { dispatcher }) => action$.pipe(ofType(dispatcher.dispatch.increment), map(() => () => (called = true))))
    await mod.start()

    await d.increment(1)
    await tick()

    expect(called).toBe(true)
    mod.stop()
  })

  it('непойманная ошибка убивает эффект, остальные продолжают работать (baseline)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const good: number[] = []
    const mod = new EffectsModule(storage, d)
    mod.add((action$, _s$, { dispatcher }) =>
      action$.pipe(
        ofType(dispatcher.dispatch.ping),
        map(() => {
          throw new Error('boom')
        }),
      ),
    )
    mod.add((action$, _s$, { dispatcher }) => action$.pipe(ofType(dispatcher.dispatch.increment), tap((a) => good.push(a.payload))))
    await mod.start()

    await d.ping() // убивает первый эффект
    await tick()
    await d.increment(9) // второй эффект жив
    await tick()

    expect(good).toEqual([9])

    // 5.4 — предупреждение «громкое»: называет эффект и подсказывает resubscribeOnError
    const msg = consoleError.mock.calls.map((c) => String(c[0])).join('\n')
    expect(msg).toMatch(/УПАЛ и больше не будет реагировать/)
    expect(msg).toMatch(/resubscribeOnError/)

    mod.stop()
    consoleError.mockRestore()
  })

  it('5.4 — упавший class-эффект логируется по имени поля', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    class Boom extends Effects<State, TestDispatcher> {
      readonly explode = this.effect((action$, _s$, { dispatcher }) =>
        action$.pipe(
          ofType(dispatcher.dispatch.ping),
          map(() => {
            throw new Error('boom')
          }),
        ),
      )
    }
    const mod = new EffectsModule(storage, d)
    mod.addEffects(new Boom().getEffects() as any)
    await mod.start()

    await d.ping()
    await tick()

    const msg = consoleError.mock.calls.map((c) => String(c[0])).join('\n')
    expect(msg).toMatch(/эффект "explode" УПАЛ/)

    mod.stop()
    consoleError.mockRestore()
  })

  it('stop()/start(): пересоздание action$, эффекты переподписываются, старые подписки сняты', async () => {
    const seen: number[] = []
    const mod = new EffectsModule(storage, d)
    mod.add((action$, _s$, { dispatcher }) => action$.pipe(ofType(dispatcher.dispatch.increment), tap((a) => seen.push(a.payload))))

    await mod.start()
    await d.increment(1)
    await tick()
    expect(seen).toEqual([1])

    mod.stop()
    await d.increment(2) // модуль остановлен — не доходит
    await tick()
    expect(seen).toEqual([1])

    await mod.start()
    await d.increment(3) // переподписка
    await tick()
    expect(seen).toEqual([1, 3])

    mod.stop()
  })

  it('горячий add() на запущенном модуле подписывает эффект сразу', async () => {
    const seen: number[] = []
    const mod = new EffectsModule(storage, d)
    await mod.start()

    mod.add((action$, _s$, { dispatcher }) => action$.pipe(ofType(dispatcher.dispatch.increment), tap((a) => seen.push(a.payload))))

    await d.increment(1)
    await tick()
    expect(seen).toEqual([1])

    mod.stop()
  })
})

describe('операторы эффектов', () => {
  let storage: MemoryStorage<State>
  let d: ReturnType<typeof makeDispatcher>

  beforeEach(async () => {
    storage = new MemoryStorage<State>({ name: `op_${Math.random()}`, initialState: { count: 0 } })
    await storage.initialize()
    d = makeDispatcher(storage)
  })

  afterEach(async () => {
    await storage.destroy()
  })

  it('ofType фильтрует по actionType', async () => {
    const inc = d.dispatch.increment
    const result = await lastValueFrom(
      of({ type: inc.actionType, payload: 5 }, { type: 'other', payload: 9 }, { type: inc.actionType, payload: 6 }).pipe(ofType(inc), toArray()),
    )
    expect(result.map((a) => a.payload)).toEqual([5, 6])
  })

  it('ofTypes фильтрует по нескольким actionType', async () => {
    const inc = d.dispatch.increment
    const ping = d.dispatch.ping
    const result = await lastValueFrom(
      of({ type: inc.actionType, payload: 1 }, { type: ping.actionType, payload: 'pong' }, { type: 'x', payload: 0 }).pipe(ofTypes([inc, ping]), toArray()),
    )
    expect(result).toHaveLength(2)
  })

  it('validateMap: валидация ок → apiCall; loadingAction перед вызовом', async () => {
    const loading = vi.fn()
    const result = await lastValueFrom(
      of(5).pipe(
        validateMap({
          validator: (v) => ({ conditions: [v > 0], skipAction: 'skipped' }),
          loadingAction: loading,
          apiCall: (v) => of(`called:${v}`),
        }),
      ),
    )
    expect(result).toBe('called:5')
    expect(loading).toHaveBeenCalledTimes(1)
  })

  it('validateMap: валидация не пройдена → skipAction', async () => {
    const result = await lastValueFrom(
      of(-1).pipe(
        validateMap({
          validator: (v) => ({ conditions: [v > 0], skipAction: 'skipped' }),
          apiCall: () => of('called'),
        }),
      ),
    )
    expect(result).toBe('skipped')
  })

  it('validateMap: валидация не пройдена и skipAction не задан → ничего не эмитит (5.3)', async () => {
    const apiCall = vi.fn(() => of('called'))
    const result = await lastValueFrom(
      of(-1).pipe(
        validateMap({
          validator: (v) => ({ conditions: [v > 0] }),
          apiCall,
        }),
        toArray(),
      ),
    )
    expect(result).toEqual([])
    expect(apiCall).not.toHaveBeenCalled()
  })

  it('validateMap: ошибка apiCall ловится errorAction', async () => {
    const onError = vi.fn()
    const result = await lastValueFrom(
      of(1).pipe(
        validateMap({
          errorAction: (err) => onError(String(err)),
          apiCall: () => throwError(() => new Error('fail')),
        }),
        toArray(),
      ),
    )
    expect(result).toEqual([]) // EMPTY после errorAction
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('apiResult: ok → onSuccess; !ok → бросает ApiError', async () => {
    const ok = await lastValueFrom(of({ ok: true, data: 'D', status: 200, headers: new Headers() }).pipe(apiResult((data, meta) => `got:${data}:${meta.status}`)))
    expect(ok).toBe('got:D:200')

    let caught: unknown
    await lastValueFrom(
      of({ ok: false, error: 'E' }).pipe(
        apiResult((data) => data),
        catchError((err) => {
          caught = err
          return of('handled')
        }),
      ),
    )
    expect(caught).toBeInstanceOf(ApiError)
  })

  it('selectorObject строит именованный объект из state$', async () => {
    const result = await lastValueFrom(selectorObject(of({ a: 1, b: 2 }), { sa: (s) => s.a, sb: (s) => s.b }).pipe(take(1)))
    expect(result).toEqual({ sa: 1, sb: 2 })
  })

  it('fromRequest: abort вызывается при отписке до завершения', () => {
    const abort = vi.fn()
    const req: any = { wait: () => new Promise(() => {}), abort } // никогда не резолвится
    const sub = fromRequest(req).subscribe()
    sub.unsubscribe()
    expect(abort).toHaveBeenCalledTimes(1)
  })

  it('fromRequest: при завершённом запросе abort НЕ вызывается', async () => {
    const abort = vi.fn()
    const req: any = { wait: () => Promise.resolve({ ok: true, data: 1 }), abort }
    const value = await lastValueFrom(fromRequest(req))
    expect(value).toEqual({ ok: true, data: 1 })
    expect(abort).not.toHaveBeenCalled()
  })
})
