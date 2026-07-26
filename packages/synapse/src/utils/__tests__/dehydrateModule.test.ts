// @vitest-environment node
//
// Server-safe dehydrateModule: per-request fork-изоляция снапшота (main не трогается).
import { EMPTY } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

const makeHandle = (initial: State = { count: 0, label: 'init' }) => createSynapse({ storage: () => new MemoryStorage<State>({ name: `dh_${uid++}`, initialState: initial }) })

class NoopDispatcher extends Dispatcher<State> {
  readonly bump = this.action((store) =>
    store.update((s) => {
      s.count += 1
    }),
  )
}

// Хэндл с эффектом-спаем: spy вызывается в момент подписки на эффект (effectsModule.start()),
// поэтому по нему видно, стартовали эффекты или нет.
const makeHandleWithEffect = (spy: () => void, initial: State = { count: 0, label: 'init' }) => {
  class ProbeEffects extends Effects<State, NoopDispatcher> {
    readonly probe = this.effect(() => {
      spy()
      return EMPTY
    })
  }
  return createSynapse({
    storage: () => new MemoryStorage<State>({ name: `dh_${uid++}`, initialState: initial }),
    dispatcher: (s) => new NoopDispatcher(s),
    effects: () => new ProbeEffects(),
  })
}

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

  it('форк изолирован: main handle не мутируется дегидрацией', async () => {
    const handle = makeHandle()
    created.push(handle)
    await handle.ready()

    await dehydrateModule(handle, { state: { count: 7 } })

    // Снапшот снят с форка, не с main — основной стор остаётся на initialState.
    expect(handle.getSnapshot()?.storage.getStateSync().count).toBe(0)
  })

  it('НЕ стартует эффекты: снапшот снимается с форка без запуска эффектов', async () => {
    const effectStarted = vi.fn()
    const handle = makeHandleWithEffect(effectStarted)
    created.push(handle)

    const snapshot = await dehydrateModule(handle, { state: { count: 5 } })

    expect(effectStarted).not.toHaveBeenCalled()
    expect(snapshot.count).toBe(5)
  })

  it('после ready({ withEffects: false }) честный ready() того же handle стартует эффекты', async () => {
    const effectStarted = vi.fn()
    const handle = makeHandleWithEffect(effectStarted)
    created.push(handle)

    // Серверный прогрев — конструкция без старта эффектов.
    await handle.ready({ withEffects: false })
    expect(effectStarted).not.toHaveBeenCalled()

    // Честный ready() стартует эффекты на том же main.
    await handle.ready()
    expect(effectStarted).toHaveBeenCalledTimes(1)
  })
})
