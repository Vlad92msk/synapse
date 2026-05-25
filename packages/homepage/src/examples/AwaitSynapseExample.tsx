import { useState } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'
import { awaitSynapse, useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

/**
 * Пример: awaitSynapse() — React-утилита для ожидания готовности store
 */

// ─── Интерфейс состояния ────────────────────────────────────────────────────

interface TimerState {
  seconds: number
  isRunning: boolean
  laps: number[]
}

const initialState: TimerState = {
  seconds: 0,
  isRunning: false,
  laps: [],
}

// ─── Создание store с эмуляцией долгой инициализации ────────────────────────

const timerStorePromise = createSynapse({
  createStorageFn: async () => {
    await new Promise((r) => setTimeout(r, 1500))
    const storage = new MemoryStorage<TimerState>({ name: 'timer-await', initialState })
    await storage.initialize()
    return storage
  },

  createSelectorsFn: (sm) => ({
    seconds: sm.createSelector((s) => s.seconds),
    isRunning: sm.createSelector((s) => s.isRunning),
    laps: sm.createSelector((s) => s.laps),
    formattedTime: sm.createSelector((s) => {
      const mins = Math.floor(s.seconds / 60)
      const secs = s.seconds % 60
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }),
  }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction }) => {
      const tick = createAction({
        type: 'tick',
        action: () => { storage.update((s) => { s.seconds++ }) },
      })
      const toggleRunning = createAction({
        type: 'toggleRunning',
        action: () => { storage.update((s) => { s.isRunning = !s.isRunning }) },
      })
      const addLap = createAction({
        type: 'addLap',
        action: () => {
          const state = storage.getStateSync()
          storage.update((s) => { s.laps.push(state.seconds) })
        },
      })
      const reset = createAction({
        type: 'reset',
        action: () => {
          storage.update((s) => { s.seconds = 0; s.isRunning = false; s.laps = [] })
        },
      })
      return { tick, toggleRunning, addLap, reset }
    }),
})

// ─── awaitSynapse — создаём утилиту ожидания ────────────────────────────────

const timerAwaiter = awaitSynapse(timerStorePromise, {
  loadingComponent: <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Инициализация таймера (1.5 сек)...</div>,
  errorComponent: (error) => <div style={{ color: 'red', padding: 20 }}>Ошибка: {error.message}</div>,
})

// ─── Вариант 1: withSynapseReady HOC ───────────────────────────────────────

function TimerComponent() {
  const store = timerAwaiter.getStoreIfReady()!
  const actions = 'actions' in store ? (store as any).actions : null
  const formattedTime = useSelector(store.selectors.formattedTime)
  const isRunning = useSelector(store.selectors.isRunning)
  const laps = useSelector(store.selectors.laps)

  const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null)

  const handleToggle = () => {
    actions.toggleRunning()
    const state = store.storage.getStateSync()
    if (state.isRunning) {
      if (intervalId) { clearInterval(intervalId); setIntervalId(null) }
    } else {
      const id = setInterval(() => actions.tick(), 1000)
      setIntervalId(id)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 32, fontFamily: 'monospace', textAlign: 'center', margin: 16 }}>
        {formattedTime}
      </div>
      <div style={buttonRow}>
        <button onClick={handleToggle}>{isRunning ? 'Stop' : 'Start'}</button>
        <button onClick={() => actions.addLap()} disabled={!isRunning}>Lap</button>
        <button onClick={() => { if (intervalId) clearInterval(intervalId); setIntervalId(null); actions.reset() }}>Reset</button>
      </div>
      {laps && laps.length > 0 && (
        <div style={{ fontSize: 12, marginTop: 8 }}>
          Laps: {laps.map((l, i) => <span key={i} style={{ marginRight: 8 }}>{`${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}`}</span>)}
        </div>
      )}
    </div>
  )
}

const TimerWithReady = timerAwaiter.withSynapseReady(TimerComponent)

// ─── Вариант 2: useSynapseReady hook ───────────────────────────────────────

function TimerStatusPanel() {
  const { isReady, isPending, isError, error } = timerAwaiter.useSynapseReady()

  return (
    <div style={{ fontSize: 12, padding: 8, background: '#f9f9f9', borderRadius: 4, marginTop: 8 }}>
      <strong>useSynapseReady():</strong>
      <div>isReady: {String(isReady)} | isPending: {String(isPending)} | isError: {String(isError)}</div>
      {error && <div style={{ color: 'red' }}>Error: {error.message}</div>}
    </div>
  )
}

// ─── Вариант 3: Programmatic API ───────────────────────────────────────────

function ProgrammaticAccessPanel() {
  const [info, setInfo] = useState<string>('')

  return (
    <div style={{ marginTop: 8 }}>
      <div style={buttonRow}>
        <button onClick={() => setInfo(`isReady(): ${timerAwaiter.isReady()}`)}>
          isReady()
        </button>
        <button onClick={() => setInfo(`getStatus(): ${timerAwaiter.getStatus()}`)}>
          getStatus()
        </button>
        <button onClick={async () => {
          const store = await timerAwaiter.waitForReady()
          const state = store.storage.getStateSync()
          setInfo(`waitForReady() -> state: ${JSON.stringify(state)}`)
        }}>
          await waitForReady()
        </button>
      </div>
      {info && <div style={{ fontSize: 11, fontFamily: 'monospace', marginTop: 4 }}>{info}</div>}
    </div>
  )
}

// ─── Экспорт ────────────────────────────────────────────────────────────────

export function AwaitSynapseExample() {
  return (
    <div style={cardStyle}>
      <h2>awaitSynapse</h2>
      <p>React-утилита для ожидания готовности Synapse store. HOC + хук + programmatic API.</p>

      {/* ─── Создание awaiter ────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { awaitSynapse } from 'synapse-storage/react'
import { createSynapse } from 'synapse-storage/utils'

// Store может инициализироваться долго (IndexedDB, загрузка с сервера и т.п.)
const storePromise = createSynapse({
  createStorageFn: async () => {
    const data = await fetch('/api/config').then((r) => r.json())
    const storage = new MemoryStorage({ name: 'config', initialState: data })
    await storage.initialize()
    return storage
  },
  createSelectorsFn: (sm) => ({ ... }),
  createDispatcherFn: (storage) => createDispatcher({ storage }, ...),
})

// Создаём awaiter
const awaiter = awaitSynapse(storePromise, {
  loadingComponent: <div>Загрузка...</div>,
  errorComponent: (error) => <div>Ошибка: {error.message}</div>,
})`}</pre>

      {/* ─── withSynapseReady HOC ────────────────────────────────────── */}
      <h3 style={sectionTitle}>withSynapseReady (HOC)</h3>
      <pre style={codeBlock}>{`// HOC: показывает loadingComponent пока store не ready
// Компонент рендерится ТОЛЬКО когда store полностью инициализирован

function MyComponent() {
  // Гарантированно store уже ready — безопасно использовать
  const store = awaiter.getStoreIfReady()!
  const value = useSelector(store.selectors.someValue)

  return <div>{value}</div>
}

// Оборачиваем
const MyComponentWithReady = awaiter.withSynapseReady(MyComponent)

// В JSX — покажет loading, потом компонент:
<MyComponentWithReady />`}</pre>

      {/* ─── useSynapseReady hook ────────────────────────────────────── */}
      <h3 style={sectionTitle}>useSynapseReady (хук)</h3>
      <pre style={codeBlock}>{`// Хук для ручного контроля состояния готовности

function StatusPanel() {
  const { isReady, isPending, isError, store, error } = awaiter.useSynapseReady()

  if (isPending) return <div>Загрузка...</div>
  if (isError)   return <div>Ошибка: {error?.message}</div>
  if (isReady)   return <div>Store ready! State: {JSON.stringify(store.storage.getStateSync())}</div>
}

// Поля возвращаемого объекта:
// isReady:   boolean — store инициализирован
// isPending: boolean — ожидание инициализации
// isError:   boolean — ошибка инициализации
// store:     SynapseStore | undefined
// error:     Error | null`}</pre>

      {/* ─── Programmatic API ────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Programmatic API</h3>
      <pre style={codeBlock}>{`// Можно использовать вне React-компонентов

// Синхронные проверки
awaiter.isReady()         // boolean
awaiter.getStatus()       // 'pending' | 'ready' | 'error'
awaiter.getError()        // Error | null
awaiter.getStoreIfReady() // store | undefined

// Async ожидание
const store = await awaiter.waitForReady()

// Колбэки (возвращают unsubscribe)
const unsub = awaiter.onReady((store) => {
  console.log('Store ready!', store.storage.getStateSync())
})

const unsub2 = awaiter.onError((error) => {
  console.error('Init failed:', error.message)
})

// Если store уже ready — onReady вызовется немедленно

// Очистка
awaiter.destroy()`}</pre>

      {/* ─── Связь с createSynapseAwaiter ────────────────────────────── */}
      <h3 style={sectionTitle}>Связь с createSynapseAwaiter</h3>
      <pre style={codeBlock}>{`// awaitSynapse — React-обёртка поверх createSynapseAwaiter
// Добавляет: withSynapseReady (HOC) и useSynapseReady (хук)
// Проксирует: waitForReady, isReady, getStoreIfReady, onReady, onError, getStatus, getError, destroy

// Для vanilla JS / Node.js / без React — используйте createSynapseAwaiter напрямую:
import { createSynapseAwaiter } from 'synapse-storage/utils'
const awaiter = createSynapseAwaiter(storePromise)
// Тот же programmatic API, но без React-хуков`}</pre>

      {/* ─── Живой пример ─────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Живой пример</h3>
      <p style={{ fontSize: 13, color: '#666' }}>Store инициализируется 1.5 секунды. Обновите страницу чтобы увидеть loading.</p>

      <TimerWithReady />
      <TimerStatusPanel />
      <ProgrammaticAccessPanel />
    </div>
  )
}
