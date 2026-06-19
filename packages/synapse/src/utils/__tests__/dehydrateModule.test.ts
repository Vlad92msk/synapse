// @vitest-environment node
//
// Server-safe dehydrateModule: per-request fork-изоляция снапшота + прогрев main handle при ssr.
import { EMPTY } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StorageStatus } from '../../core'
import { MemoryStorage } from '../../core/storage/adapters/memory-storage.service'
import { Dispatcher } from '../../reactive/dispatcher/dispatcher.base'
import { Effects } from '../../reactive/effects/effects.base'
import { createSynapse } from '../createSynapse'
import { dehydrateModule } from '../dehydrateModule'

interface State extends Record<string, any> {
  count: number
  label: string
}

let uid = 0

const makeHandle = (initial: State = { count: 0, label: 'init' }) =>
  createSynapse<State, undefined, undefined>(() => ({
    storage: new MemoryStorage<State>({ name: `dh_${uid++}`, initialState: initial }),
  }))

class NoopDispatcher extends Dispatcher<State> {
  readonly bump = this.action((store) =>
    store.update((s) => {
      s.count += 1
    }),
  )
}

// Хэндл с эффектом-спаем: spy вызывается в момент подписки на эффект (effectsModule.start()),
// поэтому по нему видно, стартовали эффекты или нет.
const makeHandleWithEffect = (spy: () => void, initial: State = { count: 0, label: 'init' }) =>
  createSynapse(() => {
    const storage = new MemoryStorage<State>({ name: `dh_${uid++}`, initialState: initial })
    class ProbeEffects extends Effects<State, NoopDispatcher> {
      readonly probe = this.effect(() => {
        spy()
        return EMPTY
      })
    }
    return { storage, dispatcher: new NoopDispatcher(storage), effects: new ProbeEffects() }
  })

describe('dehydrateModule', () => {
  const created: Array<{ destroy(): Promise<void> }> = []
  afterEach(async () => {
    while (created.length) await created.pop()!.destroy()
  })

  it('частичный state накладывается поверх initialState (непереданные поля сохраняются)', async () => {
    const handle = makeHandle({ count: 0, label: 'init' })
    created.push(handle)

    const snapshot = await dehydrateModule(handle, { state: { count: 42 } })
    expect(snapshot.count).toBe(42)
    // label не передавали — берётся из initialState форка, а не зануляется
    expect(snapshot.label).toBe('init')
  })

  it('форк изолирован: main handle НЕ прогрет без ssr', async () => {
    const handle = makeHandle()
    created.push(handle)
    await handle.ready()

    await dehydrateModule(handle, { state: { count: 7 } })

    // Без ssr основной стор остаётся на initialState (снапшот снят с форка, не с main).
    expect(handle.getSnapshot()?.storage.getStateSync().count).toBe(0)
  })

  it('ssr: true прогревает main handle тем же снапшотом', async () => {
    const handle = makeHandle()
    created.push(handle)

    const snapshot = await dehydrateModule(handle, { state: { count: 99 }, ssr: true })
    expect(snapshot.count).toBe(99)

    // После ssr-прогрева getSnapshot() main отдаёт READY-стор с залитыми данными —
    // ради этого awaiter синхронно отдаёт стор на первом серверном рендере.
    const main = handle.getSnapshot()
    expect(main?.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(main?.storage.getStateSync().count).toBe(99)
  })

  it('НЕ стартует эффекты: ни на форке, ни при ssr-прогреве main handle', async () => {
    const effectStarted = vi.fn()
    const handle = makeHandleWithEffect(effectStarted)
    created.push(handle)

    const snapshot = await dehydrateModule(handle, { state: { count: 5 }, ssr: true })

    // Эффект-спай не вызван — ни форк (снапшот), ни main (ssr-прогрев) эффекты не стартовали.
    expect(effectStarted).not.toHaveBeenCalled()
    // При этом снапшот снят и SSR-seed доехал: main отдаёт READY-стор с данными.
    expect(snapshot.count).toBe(5)
    const main = handle.getSnapshot()
    expect(main?.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(main?.storage.getStateSync().count).toBe(5)
  })

  it('после ready({ withEffects: false }) честный ready() того же handle стартует эффекты (мемо-апгрейд)', async () => {
    const effectStarted = vi.fn()
    const handle = makeHandleWithEffect(effectStarted)
    created.push(handle)

    // Серверный прогрев — эффекты не стартуют.
    await handle.ready({ withEffects: false })
    expect(effectStarted).not.toHaveBeenCalled()

    // Честный ready() поверх прогрева пересобирает стор с эффектами — инвариант соблюдён.
    await handle.ready()
    expect(effectStarted).toHaveBeenCalledTimes(1)
  })

  it('апгрейд: прогретый стор не утекает и уничтожается ровно раз на destroy()', async () => {
    const destroyed: string[] = []
    let n = 0
    const handle = createSynapse<State, undefined, undefined>(() => {
      const name = `up_${n++}`
      const storage = new MemoryStorage<State>({ name, initialState: { count: 0, label: 'init' } })
      const orig = storage.destroy.bind(storage)
      storage.destroy = async () => {
        destroyed.push(name)
        await orig()
      }
      return { storage }
    })

    await handle.ready({ withEffects: false }) // прогрев up_0
    await handle.ready() // апгрейд → up_1, up_0 вытеснен, но ещё жив (мог утечь в рендер)
    expect(destroyed).toEqual([])

    await handle.destroy()
    // оба стора (вытесненный прогретый + текущий) уничтожены ровно по разу
    expect([...destroyed].sort()).toEqual(['up_0', 'up_1'])
  })
})
