import { useState } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher } from 'synapse-storage/reactive'
import { awaitSynapse, useSelector } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример: awaitSynapse() — withSynapseReady HOC + useSynapseReady hook
 * Удобный паттерн для ожидания готовности store перед рендером компонентов
 */

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

// Эмулируем "тяжёлую" инициализацию (например, загрузка из IndexedDB)
const timerStorePromise = createSynapse({
  createStorageFn: async () => {
    // Имитация задержки инициализации (загрузка из БД, миграция данных и т.п.)
    await new Promise((r) => setTimeout(r, 1500))
    const storage = new MemoryStorage<TimerState>({ name: 'timer-await', initialState })
    await storage.initialize()
    return storage
  },

  createSelectorsFn: (sm) => ({
    seconds: sm.createSelector((s) => s.seconds),
    isRunning: sm.createSelector((s) => s.isRunning),
    laps: sm.createSelector((s) => s.laps),
    formattedTime: sm.createSelector(
      (s) => {
        const mins = Math.floor(s.seconds / 60)
        const secs = s.seconds % 60
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      },
    ),
    lapsCount: sm.createSelector((s) => s.laps.length),
  }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction }) => {
      const tick = createAction({
        type: 'tick',
        action: () => {
          storage.update((s) => { s.seconds++ })
        },
      })

      const toggleRunning = createAction({
        type: 'toggleRunning',
        action: () => {
          storage.update((s) => { s.isRunning = !s.isRunning })
        },
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
          storage.update((s) => {
            s.seconds = 0
            s.isRunning = false
            s.laps = []
          })
        },
      })

      return { tick, toggleRunning, addLap, reset }
    }),
})

// awaitSynapse — создаёт утилиты для ожидания готовности
const timerAwaiter = awaitSynapse(timerStorePromise, {
  loadingComponent: <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Инициализация таймера (1.5 сек)...</div>,
  errorComponent: (error) => <div style={{ color: 'red', padding: 20 }}>Ошибка: {error.message}</div>,
})

// --- Вариант 1: withSynapseReady HOC ---

function TimerComponent() {
  // Гарантированно store уже ready — можно безопасно использовать
  const store = timerAwaiter.getStoreIfReady()!
  const actions = 'actions' in store ? (store as any).actions : null
  const formattedTime = useSelector(store.selectors.formattedTime)
  const isRunning = useSelector(store.selectors.isRunning)
  const laps = useSelector(store.selectors.laps)

  // Запускаем/останавливаем таймер
  const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null)

  const handleToggle = () => {
    actions.toggleRunning()
    const state = store.storage.getStateSync()
    if (state.isRunning) {
      // Уже запущен — останавливаем
      if (intervalId) { clearInterval(intervalId); setIntervalId(null) }
    } else {
      // Запускаем
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

// HOC — оборачивает компонент, показывая loading/error пока store не готов
const TimerWithReady = timerAwaiter.withSynapseReady(TimerComponent)

// --- Вариант 2: useSynapseReady hook ---

function TimerStatusPanel() {
  // Хук для получения состояния готовности
  const { isReady, isPending, isError, error } = timerAwaiter.useSynapseReady()

  return (
    <div style={{ fontSize: 12, padding: 8, background: '#f9f9f9', borderRadius: 4, marginTop: 8 }}>
      <strong>useSynapseReady():</strong>
      <div>isReady: {String(isReady)} | isPending: {String(isPending)} | isError: {String(isError)}</div>
      {error && <div style={{ color: 'red' }}>Error: {error.message}</div>}
    </div>
  )
}

// --- Вариант 3: Programmatic API ---

function ProgrammaticAccessPanel() {
  const [info, setInfo] = useState<string>('')

  return (
    <div style={{ marginTop: 8 }}>
      <div style={buttonRow}>
        <button onClick={() => setInfo(`isReady(): ${timerAwaiter.isReady()}`)}>
          awaiter.isReady()
        </button>
        <button onClick={() => setInfo(`getStatus(): ${timerAwaiter.getStatus()}`)}>
          awaiter.getStatus()
        </button>
        <button onClick={async () => {
          const store = await timerAwaiter.waitForReady()
          const state = store.storage.getStateSync()
          setInfo(`waitForReady() → state: ${JSON.stringify(state)}`)
        }}>
          await waitForReady()
        </button>
      </div>
      {info && <div style={{ fontSize: 11, fontFamily: 'monospace', marginTop: 4 }}>{info}</div>}
    </div>
  )
}

export function AwaitSynapseExample() {
  return (
    <div style={cardStyle}>
      <h2>awaitSynapse() — ожидание готовности store</h2>

      {/* withSynapseReady — показывает loading компонент пока store не инициализирован */}
      <TimerWithReady />

      {/* useSynapseReady — хук для ручного контроля */}
      <TimerStatusPanel />

      {/* Programmatic — для использования вне React */}
      <ProgrammaticAccessPanel />

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>awaitSynapse(storePromise, {'{'} loadingComponent, errorComponent {'}'})</code></li>
        <li><code>withSynapseReady(Component)</code> — HOC, рендерит loading пока не ready</li>
        <li><code>useSynapseReady()</code> → <code>{'{'} isReady, isPending, isError, store, error {'}'}</code></li>
        <li><code>awaiter.waitForReady()</code> → <code>Promise&lt;Store&gt;</code></li>
        <li><code>awaiter.isReady()</code> / <code>getStatus()</code> / <code>getStoreIfReady()</code></li>
        <li><code>awaiter.onReady(cb)</code> / <code>onError(cb)</code> — подписки на события</li>
        <li>Использует <code>createSynapseAwaiter()</code> внутри (framework-agnostic)</li>
      </ul>
    </div>
  )
}
