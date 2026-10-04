import { combineLatest, firstValueFrom, from, Observable } from 'rxjs'
import { take, toArray } from 'rxjs/operators'
import { describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../storage/adapters/memory-storage.service'
import { shareStream, SimpleObservable, SimpleSubject } from '../interop-observable'
import { storageStream } from '../storage-stream'

describe('SimpleObservable', () => {
  it('холодный: producer на каждую подписку, teardown на отписке', () => {
    const teardown = vi.fn()
    const producer = vi.fn((o: { next: (v: number) => void }) => {
      o.next(1)
      return teardown
    })
    const obs = new SimpleObservable<number>(producer)
    const values: number[] = []
    const sub1 = obs.subscribe((v) => values.push(v))
    const sub2 = obs.subscribe({ next: (v) => values.push(v * 10) })
    expect(values).toEqual([1, 10])
    expect(producer).toHaveBeenCalledTimes(2)
    sub1.unsubscribe()
    sub1.unsubscribe()
    expect(teardown).toHaveBeenCalledTimes(1)
    sub2.unsubscribe()
    expect(teardown).toHaveBeenCalledTimes(2)
  })

  it('после complete значения не доходят, teardown вызван', () => {
    const teardown = vi.fn()
    let emit!: (v: number) => void
    let done!: () => void
    const obs = new SimpleObservable<number>((o) => {
      emit = o.next
      done = o.complete
      return teardown
    })
    const values: number[] = []
    const complete = vi.fn()
    obs.subscribe({ next: (v) => values.push(v), complete })
    emit(1)
    done()
    emit(2)
    expect(values).toEqual([1])
    expect(complete).toHaveBeenCalledTimes(1)
    expect(teardown).toHaveBeenCalledTimes(1)
  })

  it('ошибка обработчика подписчика не роняет источник', () => {
    const subject = new SimpleSubject<number>()
    const seen: number[] = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    subject.asObservable().subscribe(() => {
      throw new Error('boom')
    })
    subject.asObservable().subscribe((v) => seen.push(v))
    expect(() => subject.next(1)).not.toThrow()
    expect(seen).toEqual([1])
    errorSpy.mockRestore()
  })

  it('rxjs interop: from()/combineLatest принимают поток ядра', async () => {
    const subject = new SimpleSubject<number>()
    const obs = subject.asObservable()
    expect(from(obs)).toBeInstanceOf(Observable)

    const result = firstValueFrom(combineLatest([obs, from([10])]).pipe(take(1)))
    subject.next(1)
    await expect(result).resolves.toEqual([1, 10])
  })
})

describe('SimpleSubject', () => {
  it('multicast + complete поздним подписчикам', () => {
    const subject = new SimpleSubject<string>()
    const a: string[] = []
    const b: string[] = []
    subject.asObservable().subscribe((v) => a.push(v))
    subject.asObservable().subscribe((v) => b.push(v))
    subject.next('x')
    subject.complete()
    subject.next('y')
    expect(a).toEqual(['x'])
    expect(b).toEqual(['x'])
    const late = vi.fn()
    subject.asObservable().subscribe({ complete: late })
    expect(late).toHaveBeenCalledTimes(1)
  })
})

describe('shareStream', () => {
  it('одна подписка на источник на всех; отписка последнего — снимает источник; переподключение', () => {
    const teardown = vi.fn()
    const producer = vi.fn(() => teardown)
    const shared = shareStream(new SimpleObservable<number>(producer))

    const s1 = shared.subscribe(() => {})
    const s2 = shared.subscribe(() => {})
    expect(producer).toHaveBeenCalledTimes(1)
    s1.unsubscribe()
    expect(teardown).not.toHaveBeenCalled()
    s2.unsubscribe()
    expect(teardown).toHaveBeenCalledTimes(1)

    shared.subscribe(() => {}).unsubscribe()
    expect(producer).toHaveBeenCalledTimes(2)
  })

  it('ошибка источника доходит до ВСЕХ подписчиков', () => {
    let fail!: (e: unknown) => void
    const shared = shareStream(
      new SimpleObservable<number>((o) => {
        fail = o.error
      }),
    )
    const e1 = vi.fn()
    const e2 = vi.fn()
    shared.subscribe({ error: e1 })
    shared.subscribe({ error: e2 })
    fail('x')
    expect(e1).toHaveBeenCalledWith('x')
    expect(e2).toHaveBeenCalledWith('x')
  })

  it('синхронно завершившийся источник не оставляет висячую подписку', () => {
    const shared = shareStream(
      new SimpleObservable<number>((o) => {
        o.next(1)
        o.complete()
      }),
    )
    const values: number[] = []
    shared.subscribe((v) => values.push(v))
    shared.subscribe((v) => values.push(v * 10))
    expect(values).toEqual([1, 10])
  })
})

describe('storageStream', () => {
  it('текущее состояние при подписке + каждое изменение; отписка снимает слушателя', async () => {
    const storage = new MemoryStorage<{ n: number }>({ name: `ss_${Math.random()}`, initialState: { n: 0 } })
    await storage.initialize()
    const values = firstValueFrom(from(storageStream(storage)).pipe(take(3), toArray()))
    await storage.update((s) => {
      s.n = 1
    })
    await storage.update((s) => {
      s.n = 2
    })
    await expect(values).resolves.toEqual([{ n: 0 }, { n: 1 }, { n: 2 }])
    await storage.destroy()
  })
})
