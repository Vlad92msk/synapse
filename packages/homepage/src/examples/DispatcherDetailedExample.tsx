import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createDispatcher, Dispatcher } from 'synapse-storage/reactive'
import type { IStorage } from 'synapse-storage/core'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример: Dispatcher детально — createAction(), createWatcher(), dispatch, Observable actions
 * Показывает standalone использование Dispatcher без createSynapse
 */

interface CounterState {
  value: number
  step: number
  history: number[]
  lastUpdated: string
}

const initialState: CounterState = {
  value: 0,
  step: 1,
  history: [],
  lastUpdated: new Date().toLocaleTimeString(),
}

let storage: IStorage<CounterState>
let dispatcher: ReturnType<typeof createDispatcher>

const initPromise = (async () => {
  storage = new MemoryStorage<CounterState>({ name: 'dispatcher-detail', initialState })
  await storage.initialize()

  // createDispatcher — standalone (без createSynapse)
  dispatcher = createDispatcher(
    { storage },
    (_storage, { createAction, createWatcher }) => {
      // --- ACTIONS ---

      // Простой action: синхронная логика
      const increment = createAction({
        type: 'increment',
        action: () => {
          const state = storage.getStateSync()
          storage.update((s) => {
            s.value += s.step
            s.history.push(s.value)
            s.lastUpdated = new Date().toLocaleTimeString()
          })
          return state.value + state.step
        },
      })

      const decrement = createAction({
        type: 'decrement',
        action: () => {
          storage.update((s) => {
            s.value -= s.step
            s.history.push(s.value)
            s.lastUpdated = new Date().toLocaleTimeString()
          })
          const state = storage.getStateSync()
          return state.value
        },
      })

      // Action с параметрами
      const setStep = createAction({
        type: 'setStep',
        action: (newStep: number) => {
          storage.set('step', newStep)
          return newStep
        },
      })

      // Action с метаданными
      const reset = createAction({
        type: 'reset',
        action: () => {
          storage.update((s) => {
            s.value = 0
            s.step = 1
            s.history = []
            s.lastUpdated = new Date().toLocaleTimeString()
          })
        },
        meta: { description: 'Reset all state to defaults', dangerous: true },
      })

      // Action с мемоизацией (не вызывается повторно при тех же аргументах)
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

      // --- WATCHERS ---

      // Watcher: реактивно следит за изменением value
      const watchValue = createWatcher({
        type: 'watchValue',
        selector: (state) => state.value,
      })

      // Watcher с shouldTrigger (фильтрует ложные срабатывания)
      const watchBigChanges = createWatcher({
        type: 'watchBigChanges',
        selector: (state) => state.value,
        shouldTrigger: (prev, current) => Math.abs((prev ?? 0) - current) >= 5,
      })

      // Watcher с notifyAfterSubscribe
      const watchStep = createWatcher({
        type: 'watchStep',
        selector: (state) => state.step,
        notifyAfterSubscribe: true,
      })

      return { increment, decrement, setStep, reset, setStepMemoized, watchValue, watchBigChanges, watchStep }
    },
  )
})()

export function DispatcherDetailedExample() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    initPromise.then(() => setReady(true))
  }, [])

  if (!ready) return <div>Initializing Dispatcher...</div>

  return <DispatcherUI />
}

function DispatcherUI() {
  const [state, setState] = useState<CounterState>(initialState)
  const [actionLog, setActionLog] = useState<string[]>([])
  const [watcherLog, setWatcherLog] = useState<string[]>([])

  // Подписка на state
  useEffect(() => {
    const unsub = storage.subscribeToAll(() => {
      setState(storage.getStateSync())
    })
    return unsub
  }, [])

  // Подписка на ВСЕ actions через RxJS Observable
  useEffect(() => {
    const sub = dispatcher.actions.subscribe((action: any) => {
      setActionLog((prev) => [...prev.slice(-6), `${action.type} → payload: ${JSON.stringify(action.payload)}`])
    })
    return () => sub.unsubscribe()
  }, [])

  // Подписка на watchers
  useEffect(() => {
    const sub1 = dispatcher.watchers.watchValue().subscribe((action: any) => {
      setWatcherLog((prev) => [...prev.slice(-4), `[watchValue] value = ${action.payload}`])
    })
    const sub2 = dispatcher.watchers.watchBigChanges().subscribe((action: any) => {
      setWatcherLog((prev) => [...prev.slice(-4), `[watchBigChanges] big change! value = ${action.payload}`])
    })
    const sub3 = dispatcher.watchers.watchStep().subscribe((action: any) => {
      setWatcherLog((prev) => [...prev.slice(-4), `[watchStep] step = ${action.payload}${action.meta?.isInitial ? ' (initial)' : ''}`])
    })
    return () => { sub1.unsubscribe(); sub2.unsubscribe(); sub3.unsubscribe() }
  }, [])

  return (
    <div style={cardStyle}>
      <h2>Dispatcher — детальный пример</h2>

      <div style={{ fontSize: 24, fontFamily: 'monospace', textAlign: 'center', margin: 12 }}>
        {state.value} <span style={{ fontSize: 12, color: '#888' }}>(step: {state.step})</span>
      </div>

      <div style={buttonRow}>
        <button onClick={() => dispatcher.dispatch.increment()}>increment()</button>
        <button onClick={() => dispatcher.dispatch.decrement()}>decrement()</button>
        <button onClick={() => dispatcher.dispatch.setStep(state.step + 1)}>step +1</button>
        <button onClick={() => dispatcher.dispatch.setStep(Math.max(1, state.step - 1))}>step -1</button>
        <button onClick={() => dispatcher.dispatch.reset()}>reset()</button>
      </div>

      <div style={buttonRow}>
        <button onClick={() => dispatcher.dispatch.setStepMemoized(5)}>
          setStepMemoized(5) — повторный вызов не выполнится
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12 }}>
        <div>History: [{state.history.slice(-8).join(', ')}]</div>
        <div>Last updated: {state.lastUpdated}</div>
      </div>

      {/* Action info */}
      <div style={{ marginTop: 8 }}>
        <div style={buttonRow}>
          <button onClick={() => {
            const fn = dispatcher.dispatch.reset
            alert(`actionType: ${fn.actionType}\nmeta: ${JSON.stringify(fn.meta)}`)
          }}>
            Показать actionType + meta
          </button>
          <button onClick={() => {
            const found = dispatcher.findActionByType('increment')
            alert(`findActionByType('increment'): ${found ? found.actionType : 'not found'}`)
          }}>
            findActionByType()
          </button>
        </div>
      </div>

      {/* Logs */}
      {actionLog.length > 0 && (
        <div style={{ background: '#f0f8ff', padding: 8, borderRadius: 4, fontSize: 11, fontFamily: 'monospace', marginTop: 8 }}>
          <strong>dispatcher.actions (Observable):</strong>
          {actionLog.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      )}

      {watcherLog.length > 0 && (
        <div style={{ background: '#f0fff0', padding: 8, borderRadius: 4, fontSize: 11, fontFamily: 'monospace', marginTop: 8 }}>
          <strong>Watchers:</strong>
          {watcherLog.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      )}

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>createDispatcher({'{'} storage {'}'}, (storage, {'{'} createAction, createWatcher {'}'}) =&gt; ...)</code></li>
        <li><code>createAction({'{'} type, action, meta? {'}'})</code> → <code>DispatchFunction&lt;TParams, TResult&gt;</code></li>
        <li><code>createAction(config, {'{'} memoize {'}'}) </code> — мемоизация по аргументам</li>
        <li><code>createWatcher({'{'} type, selector, shouldTrigger?, notifyAfterSubscribe? {'}'})</code></li>
        <li><code>dispatcher.dispatch.actionName(params)</code> → <code>Promise&lt;Result&gt;</code></li>
        <li><code>dispatcher.watchers.watcherName()</code> → <code>Observable&lt;TypedAction&gt;</code></li>
        <li><code>dispatcher.actions</code> → <code>Observable&lt;Action&gt;</code> (все действия)</li>
        <li><code>dispatchFn.actionType</code> — строка типа, используется в <code>ofType()</code></li>
        <li><code>dispatcher.findActionByType(type)</code> — поиск action по строковому типу</li>
      </ul>
    </div>
  )
}
