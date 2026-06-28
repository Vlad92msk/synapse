import { useState } from 'react'
import { useObservable, useSelector, useSubscription } from 'synapse-storage/react'
import { debounceTime, distinctUntilChanged, map, scan } from 'rxjs/operators'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'
import { todoSelectors, todoStorage } from './todo/todo.store'
import { createTodo } from './todo/todo.types'
import { TodoList, useTodoState } from './todo/TodoDemo'

/**
 * Реактивный селектор (selector.$).
 *
 * У каждого поля-селектора есть `.$` — это `Observable<T>`, который эмитит текущее значение
 * при подписке и при каждом реальном изменении. Это позволяет:
 *   1) подписываться вне React (`todoSelectors.x.$.subscribe(...)`);
 *   2) реактивно трансформировать чтение внутри потока (`debounceTime`, `scan`, ...);
 *   3) в компоненте — через `useObservable` (рендер производного значения) и `useSubscription`
 *      (императивный side-effect).
 *
 * Здесь источник — канонический todoStorage / todoSelectors (см. ./todo/todo.store.ts).
 * Полный разбор — в docs/ru/selector-system.md.
 */

export function ReactiveSelectorExample() {
  const state = useTodoState(todoStorage)
  if (!state) return <div>Initializing…</div>

  return (
    <div style={cardStyle}>
      <h2>Реактивный селектор (selector.$)</h2>
      <p>
        Поле <code>selector.$</code> — это <code>Observable&lt;T&gt;</code>. Эмитит текущее значение
        при подписке и при каждом реальном изменении. Можно подписываться вне React и реактивно
        трансформировать чтение прямо в потоке.
      </p>

      <TodoList storage={todoStorage} state={state} />

      <h3 style={sectionTitle}>useObservable / useSubscription в компоненте</h3>
      <ReactivePanel />

      <h3 style={sectionTitle}>Подписка на selector.$ вне React</h3>
      <StandalonePanel />
    </div>
  )
}

// ─── useObservable / useSubscription ────────────────────────────────────────────

function ReactivePanel() {
  // Текущее значение (без трансформации) — обычный useSelector.
  const active = useSelector(todoSelectors.activeCount)

  // Производное значение из ПОТОКА селектора: debounce + distinct.
  // deps пересоздают цепочку (важно для stateful-операторов вроде debounceTime).
  const debouncedActive = useObservable(
    () => todoSelectors.activeCount.$.pipe(debounceTime(300), distinctUntilChanged(), map((n) => `${n}`)),
    '0',
    [],
  )

  // Императивная подписка-side-effect: счётчик distinct-изменений activeCount.
  const [changeCount, setChangeCount] = useState(0)
  useSubscription(
    () =>
      todoSelectors.activeCount.$
        .pipe(distinctUntilChanged(), scan((acc) => acc + 1, -1))
        .subscribe((n) => setChangeCount(Math.max(0, n))),
    [],
  )

  return (
    <div style={{ fontSize: 13, fontFamily: 'monospace' }}>
      <div>activeCount (useSelector): <strong>{active}</strong></div>
      <div>debounced activeCount (useObservable): <strong>{debouncedActive}</strong></div>
      <div>число изменений (useSubscription): <strong>{changeCount}</strong></div>
    </div>
  )
}

// ─── Подписка вне React ─────────────────────────────────────────────────────────

function StandalonePanel() {
  const [log, setLog] = useState<string[]>([])

  const runStandalone = () => {
    setLog((prev) => [...prev, 'Подписались на activeCount.$ (debounceTime 200ms)'])

    // Подписка на реактивный селектор ВНЕ React + трансформация в потоке.
    const sub = todoSelectors.activeCount.$
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((count) => setLog((prev) => [...prev.slice(-5), `activeCount.$ → ${count}`]))

    // Несколько быстрых изменений — debounce схлопнет их в одно.
    for (let i = 0; i < 5; i++) todoStorage.update((s) => { s.todos.push(createTodo(`Авто-задача ${i + 1}`)) })

    setTimeout(() => {
      sub.unsubscribe()
      setLog((prev) => [...prev, 'Отписались'])
    }, 600)
  }

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={runStandalone}>Запустить standalone-подписку на selector.$</button>
      </div>
      {log.length > 0 && <pre style={{ ...codeBlock, fontSize: 11, marginTop: 4 }}>{log.join('\n')}</pre>}
    </div>
  )
}
