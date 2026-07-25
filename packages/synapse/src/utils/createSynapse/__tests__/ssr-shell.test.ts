// @vitest-environment node
//
// SSR-оболочка: синхронная сборка «пустого» стора из initialState в обход async-фабрики
// (createSynapse ssrShell → SynapseModule.buildSyncShell → storage.initializeSync).
import { describe, expect, it } from 'vitest'

import { IndexedDBStorage } from '../../../core/storage/adapters/indexed-DB.service'
import { MemoryStorage } from '../../../core/storage/adapters/memory-storage.service'
import { StorageStatus } from '../../../core/storage/storage.interface'
import { Selectors } from '../../../core/selector/selectors.base'
import { Dispatcher } from '../../../reactive/dispatcher/dispatcher.base'
import { createSynapse } from '../createSynapse'

interface State extends Record<string, any> {
  user: string
  count: number
}

const initialState: State = { user: 'anon', count: 0 }

class CounterDispatcher extends Dispatcher<State> {
  readonly inc = this.action((store) => store.update((s) => (s.count += 1)))
}
class CounterSelectors extends Selectors<State> {
  readonly user = this.select((s) => s.user)
  readonly count = this.select((s) => s.count)
}

let uid = 0
const uniqueName = () => `shell_${uid++}`

// Async-фабрика, которая НИКОГДА не резолвится синхронно (эмулирует await getCoreSynapse()).
const makeBackgroundSynapse = (withShell = true) => {
  const name = uniqueName()
  return createSynapse<State, CounterDispatcher, CounterSelectors>(
    async () => {
      await new Promise((r) => setTimeout(r, 10_000))
      const storage = new MemoryStorage<State>({ name, initialState })
      return { storage, dispatcher: new CounterDispatcher(storage), selectors: new CounterSelectors(storage) }
    },
    withShell
      ? {
          ssrShell: () => {
            const storage = new MemoryStorage<State>({ name: `${name}_shell`, initialState })
            return { storage, dispatcher: new CounterDispatcher(storage), selectors: new CounterSelectors(storage) }
          },
        }
      : undefined,
  )
}

describe('storage.initializeSync', () => {
  it('доводит sync-хранилище до READY синхронно, без await', () => {
    const storage = new MemoryStorage<State>({ name: uniqueName(), initialState })
    expect(storage.initStatus.status).toBe(StorageStatus.IDLE)

    const returned = storage.initializeSync()

    expect(returned).toBe(storage)
    expect(storage.initStatus.status).toBe(StorageStatus.READY)
    expect(storage.getStateSync()).toEqual(initialState)
  })

  it('идемпотентен: повторный вызов на READY-хранилище — no-op', () => {
    const storage = new MemoryStorage<State>({ name: uniqueName(), initialState })
    storage.initializeSync()
    storage.set('count', 5)

    storage.initializeSync() // не должен сбросить состояние
    expect(storage.getStateSync().count).toBe(5)
  })

  it('async-хранилище (IndexedDB) бросает понятную ошибку', () => {
    const storage = new IndexedDBStorage<State>({ name: uniqueName(), initialState, options: { dbName: `db_${uid++}` } })
    expect(() => (storage as unknown as { initializeSync: () => void }).initializeSync()).toThrow(/синхронную инициализацию/)
  })
})

describe('SynapseModule.buildSyncShell', () => {
  it('возвращает READY-стор синхронно из ssrShell, хотя async-фабрика ещё не готова', () => {
    const handle = makeBackgroundSynapse()

    expect(handle.getSnapshot()).toBeUndefined() // async-стор не собран
    const shell = handle.buildSyncShell()

    expect(shell).toBeDefined()
    expect(shell!.storage.initStatus.status).toBe(StorageStatus.READY)
    expect(shell!.storage.getStateSync()).toEqual(initialState)
    expect(shell!.selectors).toBeDefined()
    expect(shell!.actions).toBeDefined()
  })

  it('без ssrShell возвращает undefined', () => {
    const handle = makeBackgroundSynapse(false)
    expect(handle.buildSyncShell()).toBeUndefined()
  })

  it('каждый вызов — новый изолированный инстанс (request-изоляция)', () => {
    const handle = makeBackgroundSynapse()
    const a = handle.buildSyncShell()!
    const b = handle.buildSyncShell()!

    expect(a).not.toBe(b)
    expect(a.storage).not.toBe(b.storage)

    a.storage.set('user', 'alice')
    expect(a.storage.getStateSync().user).toBe('alice')
    expect(b.storage.getStateSync().user).toBe('anon') // b не задет
  })

  it('destroy() оболочки чистит стор', async () => {
    const handle = makeBackgroundSynapse()
    const shell = handle.buildSyncShell()!
    await shell.destroy()
    expect(shell.storage.initStatus.status).not.toBe(StorageStatus.READY)
  })

  it('async-storage в ssrShell → понятная ошибка', () => {
    const handle = createSynapse<State, undefined, undefined>(
      async () => {
        const storage = new MemoryStorage<State>({ name: uniqueName(), initialState })
        return { storage }
      },
      {
        ssrShell: () => {
          const storage = new IndexedDBStorage<State>({ name: uniqueName(), initialState, options: { dbName: `db_${uid++}` } })
          return { storage }
        },
      },
    )
    expect(() => handle.buildSyncShell()).toThrow(/синхронным/)
  })

  it('fork() сохраняет ssrShell', () => {
    const forked = makeBackgroundSynapse().fork()
    const shell = forked.buildSyncShell()
    expect(shell?.storage.getStateSync()).toEqual(initialState)
  })
})
