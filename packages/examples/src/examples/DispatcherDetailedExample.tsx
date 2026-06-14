import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { Dispatcher } from 'synapse-storage/reactive'
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
// Класс Dispatcher работает и автономно: первый вызов экшена или обращение к
// dispatch/watchers лениво финализирует инстанс (назначает имена из имён полей).

const storage = new MemoryStorage<CounterState>({ name: 'counter-dispatcher', initialState })

class CounterDispatcher extends Dispatcher<CounterState> {
  // Простой экшен без параметров
  readonly increment = this.action((store) => {
    store.update((s) => {
      s.value += s.step
      s.history.push(s.value)
    })
  })

  readonly decrement = this.action((store) => {
    store.update((s) => {
      s.value -= s.step
      s.history.push(s.value)
    })
  })

  // Экшен с параметром
  readonly setStep = this.action((store, newStep: number) => {
    store.set('step', newStep)
    return newStep
  })

  // Экшен с meta
  readonly reset = this.action(
    (store) => {
      store.update((s) => {
        s.value = 0
        s.step = 1
        s.history = []
      })
    },
    { meta: { description: 'Reset to defaults', dangerous: true } },
  )

  // Экшен с мемоизацией — повторный вызов с тем же аргументом не выполняется
  readonly setStepMemoized = this.action(
    (store, step: number) => {
      store.set('step', step)
      return step
    },
    { memoize: (current, previous) => current === previous },
  )

  // Чистый сигнал (намерение без записи в стор) — payload пробрасывается дальше
  readonly pinged = this.signal<number>('Ручной пинг')

  // Watcher — отслеживает изменение значения
  readonly watchValue = this.watcher({
    selector: (state) => state.value,
  })

  // Watcher с shouldTrigger — только при больших изменениях
  readonly watchBigChanges = this.watcher({
    selector: (state) => state.value,
    shouldTrigger: (prev, current) => Math.abs((prev ?? 0) - current) >= 5,
  })

  // Watcher с notifyAfterSubscribe — вызвать callback сразу
  readonly watchStep = this.watcher({
    selector: (state) => state.step,
    notifyAfterSubscribe: true,
  })
}

let dispatcher: CounterDispatcher

const initPromise = (async () => {
  await storage.initialize()
  dispatcher = new CounterDispatcher(storage)
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
      <p>Класс Dispatcher можно использовать отдельно от createSynapse. Определяет actions и watchers; имя экшена = имя поля.</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'
import { Dispatcher } from 'synapse-storage/reactive'

const storage = new MemoryStorage<CounterState>({
  name: 'counter',
  initialState: { value: 0, step: 1, history: [] },
})
await storage.initialize()

// Экшены и watchers — поля класса. Standalone: первый вызов финализирует инстанс.
class CounterDispatcher extends Dispatcher<CounterState> {
  readonly increment = this.action((store) => store.update((s) => { s.value += s.step }))
  readonly watchValue = this.watcher({ selector: (s) => s.value })
}
const dispatcher = new CounterDispatcher(storage)`}</pre>

      {/* ─── this.action ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>this.action</h3>
      <pre style={codeBlock}>{`class CounterDispatcher extends Dispatcher<CounterState> {
  // Простой экшен
  readonly increment = this.action((store) => {
    store.update((s) => { s.value += s.step })
  })

  // Экшен с параметром (return = payload в action stream)
  readonly setStep = this.action((store, newStep: number) => {
    store.set('step', newStep)
    return newStep
  })

  // Экшен с meta — произвольные метаданные (2-й аргумент this.action)
  readonly reset = this.action(
    (store) => { store.reset() },
    { meta: { description: 'Reset to defaults', dangerous: true } },
  )

  // Экшен с мемоизацией — повторный вызов с тем же аргументом пропускается
  readonly setStepMemo = this.action(
    (store, step: number) => { store.set('step', step) },
    { memoize: (current, previous) => current === previous },
  )
}`}</pre>

      {/* ─── this.signal / this.apiActions ────────────────────────────── */}
      <h3 style={sectionTitle}>this.signal / this.apiActions</h3>
      <pre style={codeBlock}>{`class CounterDispatcher extends Dispatcher<CounterState> {
  // signal — чистое намерение: (_store, payload) => payload, ничего не пишет
  readonly pinged = this.signal<number>('Ручной пинг')

  // apiActions — вызываемая группа жизненного цикла API-запроса
  // d.load(params)        = init (намерение, статус → idle)
  // d.load.loading()      статус → loading
  // d.load.success()      статус → success
  // d.load.failure(msg)   статус → error
  // d.load.reset()        статус → reset
  readonly load = this.apiActions<{ page: number }>((s) => s.api.listRequest)
}

// ВАЖНО: ofType(d.load) ловит ТОЛЬКО init.
// Чтобы среагировать на результат — ofType(d.load.success).`}</pre>

      {/* ─── this.watcher ─────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>this.watcher</h3>
      <pre style={codeBlock}>{`class CounterDispatcher extends Dispatcher<CounterState> {
  // Базовый watcher — следит за значением
  readonly watchValue = this.watcher({ selector: (state) => state.value })

  // С shouldTrigger — фильтрует ложные срабатывания
  readonly watchBigChanges = this.watcher({
    selector: (state) => state.value,
    shouldTrigger: (prev, current) => Math.abs((prev ?? 0) - current) >= 5,
  })

  // С notifyAfterSubscribe — вызвать callback сразу при подписке
  readonly watchStep = this.watcher({
    selector: (state) => state.step,
    notifyAfterSubscribe: true,
  })
}`}</pre>

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
        <button onClick={() => dispatcher.increment()}>increment()</button>
        <button onClick={() => dispatcher.decrement()}>decrement()</button>
        <button onClick={() => dispatcher.setStep(state.step + 1)}>step +1</button>
        <button onClick={() => dispatcher.reset()}>reset()</button>
      </div>

      <div style={buttonRow}>
        <button onClick={() => dispatcher.setStepMemoized(5)}>
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
