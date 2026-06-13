// Страховочные тесты createSynapse (этап 0 ROADMAP).
import { firstValueFrom } from 'rxjs'
import { map } from 'rxjs/operators'
import { afterEach, describe, expect, it } from 'vitest'

import { SelectorAPI } from '../../../core'
import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { createDispatcher } from '../../../reactive/dispatcher/dispatcher.module'
import { defineAction } from '../../../reactive/dispatcher/standalone'
import { ofType } from '../../../reactive/effects/effects.module'
import { createSynapse } from '../createSynapse'

interface State extends Record<string, any> {
  count: number
}

let uid = 0
const newStorage = (initialState: State = { count: 0 }) => new MemoryStorage<State>({ name: `cs_${uid++}`, initialState })

const makeDispatcher = (storage: any) =>
  createDispatcher(
    { storage },
    {
      increment: defineAction<State>()({
        action: (s, n: number) => {
          s.update((st) => {
            st.count += n
          })
          return n
        },
      }),
    },
  )

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

    const synapse = await createSynapse<State, { count: SelectorAPI<number> }, ReturnType<typeof makeDispatcher>>({
      storage,
      createSelectorsFn: (sm) => ({ count: sm.createSelector((s) => s.count) }),
      createDispatcherFn: makeDispatcher,
      createEffectConfig: () => ({ services: {}, externalStates: {} }),
      effects: [
        (action$, _s$, { dispatcher }) =>
          action$.pipe(
            ofType(dispatcher.dispatch.increment),
            map(() => () => {
              effectRan = true
            }),
          ),
      ],
    })
    created.push(synapse)

    expect(synapse.storage).toBe(storage)
    expect(storage.initStatus.status).toBe('ready')

    expect(synapse.selectors.count.select()).toBe(0)
    expect(synapse.dispatcher).toBeDefined()
    expect(synapse.actions.increment).toBe(synapse.dispatcher.dispatch.increment)
    expect(synapse.state$).toBeDefined()

    await synapse.actions.increment(5)
    expect(storage.getStateSync().count).toBe(5)
    expect(effectRan).toBe(true)

    const stateValue = await firstValueFrom(synapse.state$)
    expect(stateValue.count).toBe(5)
  })

  it('частичный конфиг storage-only: есть storage и destroy, нет actions/state$', async () => {
    const storage = newStorage()
    const synapse = await createSynapse<State, Record<string, never>>({ storage })
    created.push(synapse)

    expect(synapse.storage).toBe(storage)
    expect(typeof synapse.destroy).toBe('function')
    expect('actions' in synapse).toBe(false)
    expect('state$' in synapse).toBe(false)
  })

  it('storage+selectors без dispatcher: state$ отсутствует (создаётся только с эффектами)', async () => {
    const storage = newStorage()
    const synapse = await createSynapse<State, { count: SelectorAPI<number> }>({
      storage,
      createSelectorsFn: (sm) => ({ count: sm.createSelector((s) => s.count) }),
    })
    created.push(synapse)

    expect(synapse.selectors.count.select()).toBe(0)
    expect('state$' in synapse).toBe(false)
  })
})

describe('createSynapse — destroy', () => {
  it('destroy() уничтожает storage', async () => {
    const storage = newStorage()
    const synapse = await createSynapse<State, Record<string, never>>({ storage, createDispatcherFn: makeDispatcher })

    await synapse.destroy()

    expect(storage.initStatus.status).toBe('idle')
    // доступ после destroy недоступен
    expect(() => storage.getState()).toThrow()
  })
})

describe('createSynapse — waitForDependencies', () => {
  it('поддерживает raw storage, { storage } и Promise<Synapse> как зависимости', async () => {
    // raw storage
    const depStorage = newStorage({ count: 1 })

    // Promise<Synapse>
    const depSynapsePromise = createSynapse<State, Record<string, never>>({ storage: newStorage({ count: 2 }) })

    const main = await createSynapse<State, Record<string, never>>({
      storage: newStorage(),
      dependencies: [depStorage, { storage: newStorage({ count: 3 }) }, depSynapsePromise],
    })
    created.push(main)
    created.push(await depSynapsePromise)

    // зависимости инициализированы createSynapse
    expect(depStorage.initStatus.status).toBe('ready')
    expect(main.storage.initStatus.status).toBe('ready')
  })

  it('таймаут зависимости даёт понятную ошибку', async () => {
    const slow: any = {
      name: 'slow',
      initialize: () => Promise.resolve(),
      waitForReady: () => new Promise(() => {}), // никогда не резолвится
    }

    await expect(
      createSynapse<State, Record<string, never>>({
        storage: newStorage(),
        dependencies: [slow],
        dependencyTimeout: 50,
      }),
    ).rejects.toThrow(/timed out/i)
  })
})
