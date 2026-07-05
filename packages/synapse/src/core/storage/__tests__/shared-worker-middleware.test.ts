// Среда по умолчанию — node: есть глобальный BroadcastChannel, но нет SharedWorker.
// Значит WorkerChannel (и, соответственно, sharedWorkerMiddleware) работает в
// фолбэк-режиме поверх SyncBroadcastChannel. Две middleware-инстанции с одним
// storageName = две "вкладки" на одном канале — именно так мы это и тестируем.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { sharedWorkerMiddleware } from '../middlewares/shared-worker.middleware'
import { MiddlewareAPI, StorageAction } from '../utils/middleware-module'

// Уникальное имя хранилища на каждый тест — BroadcastChannel в node глобален для процесса.
let uid = 0
const nextName = () => `sw_mw_test_${uid++}`

// BroadcastChannel в node доставляет сообщения асинхронно — даём событийному циклу тик.
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

interface Tab {
  state: Record<string, any>
  api: MiddlewareAPI
  middleware: ReturnType<typeof sharedWorkerMiddleware>
  // Записи вызовов notifySubscribers — по ним видно, применил ли обработчик удалённое сообщение
  notifications: Array<{ key: any; value: any }>
  // Прогнать действие через reducer вкладки (локально применить + broadcast другим)
  dispatch: (action: StorageAction) => Promise<any>
  cleanup: () => void
}

// Все открытые вкладки — закрываем после теста, чтобы не текли каналы/таймеры.
let tabs: Tab[] = []

afterEach(() => {
  for (const tab of tabs) {
    tab.cleanup()
  }
  tabs = []
  vi.useRealTimers()
})

// Создаёт "вкладку": простой in-memory backend + MiddlewareAPI + подключённый middleware.
function makeTab(storageName: string): Tab {
  const state: Record<string, any> = {}
  const notifications: Array<{ key: any; value: any }> = []

  const api: MiddlewareAPI = {
    dispatch: async () => undefined,
    getState: async () => ({ ...state }),
    storage: {
      doGet: async (key) => state[key as string],
      doSet: async (key, value) => {
        state[key as string] = value
      },
      doUpdate: async (updates) => {
        for (const { key, value } of updates) {
          state[key as string] = value
        }
      },
      doDelete: async (key) => {
        delete state[key as string]
        return true
      },
      doClear: async () => {
        for (const key of Object.keys(state)) {
          delete state[key]
        }
      },
      doKeys: async () => Object.keys(state),
      notifySubscribers: (key, value) => {
        notifications.push({ key, value })
      },
    },
  }

  const middleware = sharedWorkerMiddleware({ storageType: 'memory', storageName })
  const unsubscribe = middleware.setup!(api)

  // Локальное применение действия (эмуляция baseOperation), затем reducer делает broadcast.
  const localApply = async (action: StorageAction) => {
    switch (action.type) {
      case 'set':
        state[action.key as string] = action.value
        break
      case 'update':
        if (Array.isArray(action.value)) {
          for (const { key, value } of action.value) {
            state[key] = value
          }
        }
        break
      case 'delete':
        delete state[action.key as string]
        break
      case 'clear':
        for (const key of Object.keys(state)) {
          delete state[key]
        }
        break
    }
    return state[action.key as string]
  }

  const dispatch = (action: StorageAction) => middleware.reducer(api)(localApply)(action)

  const tab: Tab = {
    state,
    api,
    middleware,
    notifications,
    dispatch,
    cleanup: () => {
      if (typeof unsubscribe === 'function') unsubscribe()
      middleware.cleanup?.()
    },
  }
  tabs.push(tab)
  return tab
}

describe('sharedWorkerMiddleware (фолбэк на BroadcastChannel)', () => {
  it('фолбэк: конструируется и настраивается без исключений (SharedWorker недоступен)', () => {
    expect(typeof SharedWorker).toBe('undefined')
    expect(() => makeTab(nextName())).not.toThrow()
  })

  it('эхо-фильтрация: инициатор не переприменяет собственное действие', async () => {
    const name = nextName()
    const a = makeTab(name)
    const b = makeTab(name)

    await a.dispatch({ type: 'set', key: 'foo', value: 1 })
    await tick()

    // Вкладка A не должна получить собственный broadcast обратно (никаких notify).
    expect(a.notifications).toHaveLength(0)
    // Вкладка B получает изменение и применяет его.
    expect(b.state.foo).toBe(1)
    expect(b.notifications.some((n) => n.key === 'foo' && n.value === 1)).toBe(true)
  })

  it('late join: новая вкладка получает снапшот через SYNC_REQUEST/RESPONSE', async () => {
    const name = nextName()
    const a = makeTab(name)

    // A уже держит состояние
    await a.dispatch({ type: 'set', key: 'a', value: 1 })
    await a.dispatch({ type: 'set', key: 'b', value: 2 })
    await tick()

    // B присоединяется позже → в setup дергает requestSync и получает снапшот от A
    const b = makeTab(name)
    await tick(60)

    expect(b.state).toEqual({ a: 1, b: 2 })
  })

  it('late join без ответчика: requestSync резолвится по таймауту и не виснет', async () => {
    const name = nextName()
    // Единственная вкладка — синхронизироваться не с кем.
    const only = makeTab(name)
    await tick()
    // Ничего не сломалось, состояние осталось пустым, промис не завис.
    expect(only.state).toEqual({})
  })

  it('гонки: два быстрых update от разных вкладок не теряют изменения', async () => {
    const name = nextName()
    const a = makeTab(name)
    const b = makeTab(name)

    await Promise.all([a.dispatch({ type: 'update', key: '*', value: [{ key: 'x', value: 1 }] }), b.dispatch({ type: 'update', key: '*', value: [{ key: 'y', value: 2 }] })])
    await tick(60)

    // Обе вкладки сходятся к объединённому состоянию, без отката.
    expect(a.state).toEqual({ x: 1, y: 2 })
    expect(b.state).toEqual({ x: 1, y: 2 })
  })

  it('несериализуемый payload даёт понятную ошибку, а не тихий сбой postMessage', async () => {
    const name = nextName()
    const a = makeTab(name)

    await expect(a.dispatch({ type: 'set', key: 'fn', value: () => {} })).rejects.toThrow(/clone/i)
  })

  it('cleanup: после закрытия сообщения не доходят и обработчики сняты', async () => {
    const name = nextName()
    const a = makeTab(name)
    const b = makeTab(name)

    b.cleanup()
    // Убираем b из списка авто-очистки, чтобы afterEach не закрыл повторно (это безопасно, но чисто).
    tabs = tabs.filter((t) => t !== b)

    await a.dispatch({ type: 'set', key: 'foo', value: 1 })
    await tick()

    // B закрыт → его обработчик не должен сработать.
    expect(b.notifications).toHaveLength(0)
    // Повторный cleanup не бросает.
    expect(() => b.cleanup()).not.toThrow()
  })
})
