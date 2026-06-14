import { useEffect, useState } from 'react'
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher } from 'synapse-storage/reactive'
import { createSynapseCtx, useObservable, useSelector, useSubscription } from 'synapse-storage/react'
import { debounceTime, distinctUntilChanged, map, scan } from 'rxjs/operators'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

/**
 * Реактивный селектор (selector.$).
 *
 * Каждое поле-селектор имеет `.$` — это `Observable<T>`, который эмитит текущее значение
 * при подписке и при каждом реальном изменении. Это позволяет:
 *   1) подписываться вне React (`selectors.x.$.subscribe(...)`);
 *   2) реактивно трансформировать чтение внутри потока (`debounceTime`, `scan`, ...);
 *   3) в компоненте — через `useObservable(() => sel.$.pipe(...), initial, [selectors])`
 *      и императивно через `useSubscription`.
 */

// ─── Типы / состояние ─────────────────────────────────────────────────────────

interface SearchState {
  query: string
  hits: number
}

const initialState: SearchState = { query: '', hits: 0 }

// ─── Selectors / Dispatcher ────────────────────────────────────────────────────

class SearchSelectors extends Selectors<SearchState> {
  readonly query = this.select((s) => s.query)
  readonly hits = this.select((s) => s.hits)
}

class SearchDispatcher extends Dispatcher<SearchState> {
  readonly setQuery = this.action((store, query: string) => {
    store.set('query', query)
    return query
  })
  readonly hit = this.action((store) => {
    store.update((s) => { s.hits++ })
  })
}

const searchSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<SearchState>({ name: 'reactive-selector', initialState })
  return {
    storage,
    dispatcher: new SearchDispatcher(storage),
    selectors: new SearchSelectors(storage),
  }
})

const { contextSynapse, useSynapseSelectors, useSynapseActions } = createSynapseCtx(searchSynapse, {
  loadingComponent: <div style={{ padding: 20 }}>Инициализация...</div>,
})

// ─── Дочерний компонент: useObservable / useSubscription ───────────────────────

function ReactivePanel() {
  const selectors = useSynapseSelectors()
  const actions = useSynapseActions()

  // Текущее значение (без трансформации) — обычный useSelector
  const query = useSelector(selectors.query)

  // Производное значение из ПОТОКА селектора: debounce + distinct + длина строки.
  // Цепочка пересоздаётся при смене deps (важно для stateful-операторов).
  const debouncedLength = useObservable(
    () => selectors.query.$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      map((q) => q.trim().length),
    ),
    0,
    [selectors],
  )

  // Императивная подписка-side-effect (ничего не рендерит): счётчик изменений query.
  const [changeCount, setChangeCount] = useState(0)
  useSubscription(
    () => selectors.query.$.pipe(
      distinctUntilChanged(),
      scan((acc) => acc + 1, 0),
    ).subscribe((n) => setChangeCount(n)),
    [selectors],
  )

  return (
    <div>
      <input
        type="text"
        value={query ?? ''}
        onChange={(e) => actions.setQuery(e.target.value)}
        placeholder="Печатайте — длина обновится с debounce 300ms"
        style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }}
      />
      <div style={{ fontSize: 13, fontFamily: 'monospace' }}>
        <div>query (useSelector): <strong>{query || '(пусто)'}</strong></div>
        <div>debounced length (useObservable): <strong>{debouncedLength}</strong></div>
        <div>число distinct-изменений (useSubscription): <strong>{changeCount}</strong></div>
      </div>
    </div>
  )
}

const ReactivePanelWithCtx = contextSynapse(ReactivePanel)

// ─── Демо standalone-подписки (вне React) ──────────────────────────────────────

function StandalonePanel() {
  const [log, setLog] = useState<string[]>([])

  const runStandalone = async () => {
    const store = await searchSynapse
    setLog((prev) => [...prev, 'Подписались на selectors.hits.$ (debounceTime 200ms)'])

    // Подписка на реактивный селектор ВНЕ React + трансформация в потоке
    const sub = store.selectors.hits.$
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((hits) => setLog((prev) => [...prev.slice(-5), `hits.$ → ${hits}`]))

    // Несколько быстрых изменений — debounce схлопнет их в одно
    for (let i = 0; i < 5; i++) store.actions.hit()

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
      {log.length > 0 && (
        <pre style={{ ...codeBlock, fontSize: 11, marginTop: 4 }}>{log.join('\n')}</pre>
      )}
    </div>
  )
}

// ─── Экспорт ────────────────────────────────────────────────────────────────────

export function ReactiveSelectorExample() {
  return (
    <div style={cardStyle}>
      <h2>Реактивный селектор (selector.$)</h2>
      <p>
        Поле <code>selector.$</code> — это <code>Observable&lt;T&gt;</code>. Эмитит текущее значение при
        подписке и при каждом реальном изменении. Можно подписываться вне React и реактивно
        трансформировать чтение прямо в потоке.
      </p>

      {/* ─── selector.$ вне React ─────────────────────────────────────── */}
      <h3 style={sectionTitle}>selector.$ вне React</h3>
      <pre style={codeBlock}>{`import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

const store = await searchSynapse

// Обычная подписка
const sub = store.selectors.hits.$.subscribe((hits) => console.log(hits))

// С трансформацией прямо в потоке
store.selectors.hits.$
  .pipe(debounceTime(200), distinctUntilChanged())
  .subscribe((hits) => console.log('debounced:', hits))

sub.unsubscribe()`}</pre>

      {/* ─── В эффектах ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>selector.$ в эффектах</h3>
      <pre style={codeBlock}>{`// Внутри Effects реактивный селектор удобно использовать как источник
class SearchEffects extends Effects<SearchState, SearchDispatcher> {
  constructor(private readonly selectors: SearchSelectors) { super() }

  readonly autoSearch = this.effect((_action$, _state$, { dispatcher: d }) =>
    this.selectors.query.$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap((query) => d.search(query)),
    ),
  )
}`}</pre>

      {/* ─── useObservable / useSubscription ──────────────────────────── */}
      <h3 style={sectionTitle}>useObservable / useSubscription в компоненте</h3>
      <pre style={codeBlock}>{`import { useObservable, useSubscription } from 'synapse-storage/react'

function Panel() {
  const selectors = useSynapseSelectors()

  // useObservable — рендерит производное значение из потока селектора.
  // deps пересоздают цепочку (важно для stateful-операторов вроде debounceTime/scan).
  const debouncedLength = useObservable(
    () => selectors.query.$.pipe(debounceTime(300), distinctUntilChanged(), map((q) => q.length)),
    0,
    [selectors],
  )

  // useSubscription — императивный side-effect без возврата в рендер.
  useSubscription(
    () => selectors.query.$.pipe(distinctUntilChanged()).subscribe((q) => console.log('changed:', q)),
    [selectors],
  )

  return <div>length: {debouncedLength}</div>
}`}</pre>

      {/* ─── Живой пример ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Живой пример (useObservable / useSubscription)</h3>
      <ReactivePanelWithCtx />

      <h3 style={sectionTitle}>Живой пример (standalone подписка)</h3>
      <StandalonePanel />
    </div>
  )
}
