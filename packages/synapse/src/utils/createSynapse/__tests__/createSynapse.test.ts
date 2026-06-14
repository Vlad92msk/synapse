// Страховочные тесты createSynapse(factory) — жизненный цикл и waitForDependencies.
import { firstValueFrom } from 'rxjs'
import { map } from 'rxjs/operators'
import { afterEach, describe, expect, it } from 'vitest'

import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { Selectors } from '../../../core/selector/selectors.base'
import { Dispatcher } from '../../../reactive/dispatcher/dispatcher.base'
import { ofType } from '../../../reactive/effects/effects.module'
import { createSynapse } from '../createSynapse'

interface State extends Record<string, any> {
  count: number
}

let uid = 0
const newStorage = (initialState: State = { count: 0 }) => new MemoryStorage<State>({ name: `cs_${uid++}`, initialState })

class CountDispatcher extends Dispatcher<State> {
  readonly increment = this.action((store, n: number) => {
    store.update((st) => {
      st.count += n
    })
    return n
  })
}

class CountSelectors extends Selectors<State> {
  readonly count = this.select((s) => s.count)
}

const created: Array<{ destroy: () => Promise<void> }> = []
afterEach(async () => {
  for (const s of created.splice(0)) {
    try {
      await s.destroy()
    } catch {
      // ignore
    }
  }
})

describe('createSynapse — полный жизненный цикл', () => {
  it('storage инициализирован, selectors/actions/dispatcher/state$/destroy присутствуют', async () => {
    const storage = newStorage()
    let effectRan = false

    const handle = createSynapse(() => ({
      storage,
      dispatcher: new CountDispatcher(storage),
      selectors: new CountSelectors(storage),
      effects: [
        (action$, _s$, { dispatcher }) =>
          action$.pipe(
            ofType((dispatcher as CountDispatcher).increment),
            map(() => () => {
              effectRan = true
            }),
          ),
      ],
    }))
    created.push(handle)

    const synapse = await handle

    expect(synapse.storage).toBe(storage)
    expect(storage.initStatus.status).toBe('ready')

    expect(synapse.selectors!.count.select()).toBe(0)
    expect(synapse.dispatcher).toBeDefined()
    expect(synapse.actions).toBe(synapse.dispatcher)
    expect(synapse.state$).toBeDefined()

    await synapse.actions!.increment(5)
    expect(storage.getStateSync().count).toBe(5)
    expect(effectRan).toBe(true)

    const stateValue = await firstValueFrom(synapse.state$)
    expect(stateValue.count).toBe(5)
  })

  it('storage-only: есть storage / state$ / destroy, нет dispatcher/selectors', async () => {
    const storage = newStorage()
    const handle = createSynapse(() => ({ storage }))
    created.push(handle)
    const synapse = await handle

    expect(synapse.storage).toBe(storage)
    expect(typeof synapse.destroy).toBe('function')
    expect(synapse.dispatcher).toBeUndefined()
    expect(synapse.selectors).toBeUndefined()
  })

  it('storage+selectors без dispatcher', async () => {
    const storage = newStorage()
    const handle = createSynapse(() => ({ storage, selectors: new CountSelectors(storage) }))
    created.push(handle)
    const synapse = await handle

    expect(synapse.selectors!.count.select()).toBe(0)
    expect(synapse.dispatcher).toBeUndefined()
  })
})

describe('createSynapse — destroy', () => {
  it('destroy() уничтожает storage', async () => {
    const storage = newStorage()
    const handle = createSynapse(() => ({ storage, dispatcher: new CountDispatcher(storage) }))
    await handle.ready()

    await handle.destroy()

    expect(storage.initStatus.status).toBe('idle')
    // доступ после destroy недоступен
    expect(() => storage.getState()).toThrow()
  })
})

describe('createSynapse — waitForDependencies', () => {
  it('поддерживает raw storage, { storage } и Promise<Synapse> как зависимости', async () => {
    // raw storage
    const depStorage = newStorage({ count: 1 })

    // другой synapse-handle
    const depHandle = createSynapse(() => ({ storage: newStorage({ count: 2 }) }))

    const main = createSynapse(() => ({
      storage: newStorage(),
      dependencies: [depStorage, { storage: newStorage({ count: 3 }) }, depHandle],
    }))
    created.push(main)
    created.push(depHandle)

    const synapse = await main

    // зависимости инициализированы
    expect(depStorage.initStatus.status).toBe('ready')
    expect(synapse.storage.initStatus.status).toBe('ready')
  })

  it('таймаут зависимости даёт понятную ошибку', async () => {
    const slow: any = {
      name: 'slow',
      initialize: () => Promise.resolve(),
      waitForReady: () => new Promise(() => {}), // никогда не резолвится
    }

    const handle = createSynapse(() => ({
      storage: newStorage(),
      dependencies: [slow],
      dependencyTimeout: 50,
    }))

    await expect(handle.ready()).rejects.toThrow(/timed out/i)
  })
})
