import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createDispatcher } from 'synapse-storage/reactive'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface CounterState {
  value: number
  step: number
  history: number[]
}

const initialState: CounterState = {
  value: 0,
  step: 1,
  history: [],
}

// ─── Standalone Dispatcher (без createSynapse) ─────────────────────────────────

const storage = new MemoryStorage<CounterState>({ name: 'counter-dispatcher', initialState })

const createCounterDispatcher = () =>
  createDispatcher(
    { storage },
    (_storage, { createAction, createWatcher }) => {
      // Простой action без параметров
      const increment = createAction({
        type: 'increment',
        action: () => {
          storage.update((s) => {
            s.value += s.step
            s.history.push(s.value)
          })
        },
      })

      const decrement = createAction({
        type: 'decrement',
        action: () => {
          storage.update((s) => {
            s.value -= s.step
            s.history.push(s.value)
          })
        },
      })

      // Action с параметром
      const setStep = createAction({
        type: 'setStep',
        action: (newStep: number) => {
          storage.set('step', newStep)
          return newStep
        },
      })

      // Action с meta
      const reset = createAction({
        type: 'reset',
        action: () => {
          storage.update((s) => {
            s.value = 0
            s.step = 1
            s.history = []
          })
        },
        meta: { description: 'Reset to defaults', dangerous: true },
      })

      // Action с мемоизацией — повторный вызов с тем же аргументом не выполняется
      const setStepMemoized = createAction(
        {
          type: 'setStepMemoized',
          action: (step: number) => {
            storage.set('step', step)
            return step
          },
        },
        {
          memoize: (current, previous) => current === previous,
        },
      )

      // Watcher — отслеживает изменение значения
      const watchValue = createWatcher({
        type: 'watchValue',
        selector: (state) => state.value,
      })

      // Watcher с shouldTrigger — только при больших изменениях
      const watchBigChanges = createWatcher({
        type: 'watchBigChanges',
        selector: (state) => state.value,
        shouldTrigger: (prev, current) => Math.abs((prev ?? 0) - current) >= 5,
      })

      // Watcher с notifyAfterSubscribe — вызвать callback сразу
      const watchStep = createWatcher({
        type: 'watchStep',
        selector: (state) => state.step,
        notifyAfterSubscribe: true,
      })

      return { increment, decrement, setStep, reset, setStepMemoized, watchValue, watchBigChanges, watchStep }
    },
  )

let dispatcher: ReturnType<typeof createCounterDispatcher>

const initPromise = (async () => {
  await storage.initialize()
  dispatcher = createCounterDispatcher()
})()

// ─── Компонент-пример ──────────────────────────────────────────────────────────

export function DispatcherDetailedExample() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    initPromise.then(() => setReady(true))
  }, [])

  if (!ready) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>Dispatcher (standalone)</h2>
      <p>createDispatcher можно использовать отдельно от createSynapse. Определяет actions и watchers.</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'
import { createDispatcher } from 'synapse-storage/reactive'

const storage = new MemoryStorage<CounterState>({
  name: 'counter',
  initialState: { value: 0, step: 1, history: [] },
})
await storage.initialize()

const dispatcher = createDispatcher(
  { storage },
  (_storage, { createAction, createWatcher }) => {
    // ... actions и watchers
    return { increment, decrement, setStep, watchValue }
  },
)`}</pre>

      {/* ─── createAction ─────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>createAction</h3>
      <pre style={codeBlock}>{`// Простой action
const increment = createAction({
  type: 'increment',
  action: () => {
    storage.update((s) => { s.value += s.step })
  },
})

// Action с параметром
const setStep = createAction({
  type: 'setStep',
  action: (newStep: number) => {
    storage.set('step', newStep)
    return newStep  // return = payload в action stream
  },
})

// Action с meta — произвольные метаданные
const reset = createAction({
  type: 'reset',
  action: () => { storage.reset() },
  meta: { description: 'Reset to defaults', dangerous: true },
})

// Action с мемоизацией — повторный вызов с тем же аргументом пропускается
const setStepMemo = createAction(
  { type: 'setStepMemo', action: (step: number) => { ... } },
  { memoize: (current, previous) => current === previous },
)`}</pre>

      {/* ─── createWatcher ────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>createWatcher</h3>
      <pre style={codeBlock}>{`// Базовый watcher — следит за значением
const watchValue = createWatcher({
  type: 'watchValue',
  selector: (state) => state.value,  // что отслеживать
})

// С shouldTrigger — фильтрует ложные срабатывания
const watchBigChanges = createWatcher({
  type: 'watchBigChanges',
  selector: (state) => state.value,
  shouldTrigger: (prev, current) => Math.abs((prev ?? 0) - current) >= 5,
})

// С notifyAfterSubscribe — вызвать callback сразу при подписке
const watchStep = createWatcher({
  type: 'watchStep',
  selector: (state) => state.step,
  notifyAfterSubscribe: true,
})`}</pre>

      {/* ─── Использование ────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Использование</h3>
      <pre style={codeBlock}>{`// Вызов actions
dispatcher.dispatch.increment()
dispatcher.dispatch.setStep(5)
dispatcher.dispatch.reset()

// Свойства action-функции
dispatcher.dispatch.reset.actionType  // '[counter]reset'
dispatcher.dispatch.reset.meta        // { description: '...', dangerous: true }

// Подписка на watchers (RxJS Observable)
const sub = dispatcher.watchers.watchValue().subscribe((action) => {
  console.log('value:', action.payload)
})
sub.unsubscribe()

// Подписка на ВСЕ actions
dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})

// Поиск action по типу
dispatcher.findActionByType('increment')  // dispatch function или undefined

// Очистка
dispatcher.destroy()`}</pre>

      {/* ─── Живая демо ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Demo</h3>
      <CounterDemo />
    </div>
  )
}

function CounterDemo() {
  const [state, setState] = useState<CounterState>(initialState)
  const [actionLog, setActionLog] = useState<string[]>([])
  const [watcherLog, setWatcherLog] = useState<string[]>([])

  useEffect(() => {
    const unsub = storage.subscribeToAll(() => setState(storage.getStateSync()))
    return unsub
  }, [])

  useEffect(() => {
    const sub = dispatcher.actions.subscribe((action: any) => {
      setActionLog((prev) => [...prev.slice(-5), `${action.type} -> ${JSON.stringify(action.payload)}`])
    })
    return () => sub.unsubscribe()
  }, [])

  useEffect(() => {
    const sub1 = dispatcher.watchers.watchValue().subscribe((a: any) => {
      setWatcherLog((prev) => [...prev.slice(-3), `[watchValue] ${a.payload}`])
    })
    const sub2 = dispatcher.watchers.watchBigChanges().subscribe((a: any) => {
      setWatcherLog((prev) => [...prev.slice(-3), `[watchBigChanges] big change! ${a.payload}`])
    })
    const sub3 = dispatcher.watchers.watchStep().subscribe((a: any) => {
      setWatcherLog((prev) => [...prev.slice(-3), `[watchStep] ${a.payload}`])
    })
    return () => { sub1.unsubscribe(); sub2.unsubscribe(); sub3.unsubscribe() }
  }, [])

  return (
    <div>
      <div style={{ fontSize: 24, fontFamily: 'monospace', textAlign: 'center', margin: 12 }}>
        {state.value} <span style={{ fontSize: 12, color: '#888' }}>(step: {state.step})</span>
      </div>

      <div style={buttonRow}>
        <button onClick={() => dispatcher.dispatch.increment()}>increment()</button>
        <button onClick={() => dispatcher.dispatch.decrement()}>decrement()</button>
        <button onClick={() => dispatcher.dispatch.setStep(state.step + 1)}>step +1</button>
        <button onClick={() => dispatcher.dispatch.reset()}>reset()</button>
      </div>

      <div style={buttonRow}>
        <button onClick={() => dispatcher.dispatch.setStepMemoized(5)}>
          setStepMemoized(5) — repeat won't fire
        </button>
      </div>

      <div style={{ fontSize: 12, marginBottom: 8 }}>
        History: [{state.history.slice(-8).join(', ')}]
      </div>

      {actionLog.length > 0 && (
        <div style={{ background: '#f0f8ff', padding: 8, borderRadius: 4, fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
          <strong>dispatcher.actions:</strong>
          {actionLog.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      )}

      {watcherLog.length > 0 && (
        <div style={{ background: '#f0fff0', padding: 8, borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }}>
          <strong>watchers:</strong>
          {watcherLog.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      )}
    </div>
  )
}
