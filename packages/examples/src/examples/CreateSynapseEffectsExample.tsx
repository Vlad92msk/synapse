import { useState, useEffect } from 'react'
import { MemoryStorage, Selectors } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher, Effects, ofType } from 'synapse-storage/reactive'
import { useSelector } from 'synapse-storage/react'
import { debounceTime, switchMap } from 'rxjs/operators'
import { from } from 'rxjs'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface SearchState {
  query: string
  results: string[]
  isLoading: boolean
  error: string | null
}

const initialState: SearchState = {
  query: '',
  results: [],
  isLoading: false,
  error: null,
}

// Fake API (сервис) — передаётся в эффекты через конструктор
const fakeSearch = (query: string): Promise<string[]> =>
  new Promise((resolve) =>
    setTimeout(() => resolve(query ? [`Result 1 for "${query}"`, `Result 2 for "${query}"`] : []), 600),
  )

// ─── Селекторы ───────────────────────────────────────────────────────────────────

class SearchSelectors extends Selectors<SearchState> {
  readonly query = this.select((s) => s.query)
  readonly results = this.select((s) => s.results)
  readonly isLoading = this.select((s) => s.isLoading)
  readonly error = this.select((s) => s.error)
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────────

class SearchDispatcher extends Dispatcher<SearchState> {
  readonly setQuery = this.action((store, query: string) => {
    store.update((s) => {
      s.query = query
      s.isLoading = query.length > 0
      s.error = null
    })
    return query
  })

  readonly searchSuccess = this.action((store, results: string[]) => {
    store.update((s) => {
      s.results = results
      s.isLoading = false
    })
    return results
  })

  readonly searchError = this.action((store, error: string) => {
    store.update((s) => {
      s.error = error
      s.isLoading = false
      s.results = []
    })
    return error
  })
}

// ─── Effects (class-based) ────────────────────────────────────────────────────────
// Сервисы приходят через конструктор и захватываются в замыкание рецепта.
// Эффекты — поля this.effect((action$, state$, ctx) => action$.pipe(...)).

class SearchEffects extends Effects<SearchState, SearchDispatcher> {
  constructor(private readonly search: typeof fakeSearch) {
    super()
  }

  readonly search$ = this.effect((action$, _state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.setQuery), // фильтр по типу action
      debounceTime(400),
      switchMap((action) => {
        const query = action.payload
        return from(this.search(query)).pipe(
          switchMap(async (results) => {
            try {
              d.searchSuccess(results)
            } catch (e) {
              d.searchError(String(e))
            }
          }),
        )
      }),
    ),
  )
}

// ─── Создание synapse с effects ────────────────────────────────────────────────

const searchSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<SearchState>({ name: 'search-effects', initialState })
  return {
    storage,
    dispatcher: new SearchDispatcher(storage),
    selectors: new SearchSelectors(storage),
    effects: new SearchEffects(fakeSearch),
  }
})

type SearchSynapse = Awaited<typeof searchSynapse>

// ─── Компонент-пример ──────────────────────────────────────────────────────────

export function CreateSynapseEffectsExample() {
  const [store, setStore] = useState<SearchSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    searchSynapse.then((s) => { if (!cancelled) setStore(s) })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing...</div>

  return (
    <div style={cardStyle}>
      <h2>createSynapse (effects)</h2>
      <p>Полная конфигурация: storage + selectors + dispatcher + RxJS effects для side-effects.</p>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`import { createSynapse } from 'synapse-storage/utils'
import { Dispatcher, Effects, ofType } from 'synapse-storage/reactive'
import { debounceTime, switchMap } from 'rxjs/operators'
import { from } from 'rxjs'

// Effects — класс над Effects<State, Dispatcher>; сервисы через конструктор
class SearchEffects extends Effects<SearchState, SearchDispatcher> {
  constructor(private readonly search: SearchApi) { super() }

  readonly search$ = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.setQuery),
      debounceTime(400),
      switchMap((action) => from(this.search(action.payload)).pipe(
        switchMap(async (results) => d.searchSuccess(results)),
      )),
    ),
  )
}

const searchSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<SearchState>({ name: 'search', initialState })
  return {
    storage,
    dispatcher: new SearchDispatcher(storage),
    selectors: new SearchSelectors(storage),
    effects: new SearchEffects(searchApi),   // сервисы — через конструктор
  }
})`}</pre>

      {/* ─── this.effect ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>this.effect</h3>
      <pre style={codeBlock}>{`// this.effect — поле класса; функция принимает потоки и контекст, возвращает Observable
class SearchEffects extends Effects<SearchState, SearchDispatcher> {
  constructor(private readonly api: SearchApi) { super() }

  readonly search$ = this.effect((action$, state$, ctx) => {
    const d = ctx.dispatcher                 // типизированный диспетчер модуля
    return action$.pipe(
      ofType(d.setQuery),                    // фильтр по action
      debounceTime(400),
      switchMap((action) => from(this.api(action.payload)).pipe(
        switchMap(async (results) => d.searchSuccess(results)),
      )),
    )
  })

  // Опционально — освобождение ресурсов
  override onDestroy() { /* close sockets etc. */ }
}

// ctx = { dispatcher, external? } — внешние диспетчеры через 3-й генерик
// class Effects<State, Dispatcher, ExternalDispatchers>`}</pre>

      {/* ─── ofType ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>ofType / ofTypes</h3>
      <pre style={codeBlock}>{`import { ofType, ofTypes } from 'synapse-storage/reactive'

// ofType — фильтрует поток по одному типу action
action$.pipe(
  ofType(d.setQuery),
  // action.type === '[search]setQuery'
)

// ofTypes — фильтрует по нескольким типам
action$.pipe(
  ofTypes([d.setQuery, d.searchError]),
)`}</pre>

      {/* ─── Возвращаемое значение ───────────────────────────────────── */}
      <h3 style={sectionTitle}>Возвращаемое значение</h3>
      <pre style={codeBlock}>{`const store = await searchSynapse

store.storage     // IStorage<SearchState>
store.selectors   // экземпляр SearchSelectors
store.actions     // { setQuery, searchSuccess, searchError }
store.dispatcher  // экземпляр SearchDispatcher
store.state$      // Observable<SearchState> — поток состояния (с effects)

// Effects автоматически стартуют при инициализации модуля`}</pre>

      {/* ─── Живая демо ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Demo</h3>
      <SearchDemo store={store} />
    </div>
  )
}

function SearchDemo({ store }: { store: SearchSynapse }) {
  const query = useSelector(store.selectors.query)
  const results = useSelector(store.selectors.results)
  const isLoading = useSelector(store.selectors.isLoading)
  const error = useSelector(store.selectors.error)

  return (
    <div>
      <input
        type="text"
        value={query ?? ''}
        onChange={(e) => store.actions.setQuery(e.target.value)}
        placeholder="Type to search (debounced 400ms)..."
        style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }}
      />

      {isLoading && <p style={{ color: '#888' }}>Loading...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {results && results.length > 0 && (
        <ul>
          {results.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      <div style={buttonRow} />
    </div>
  )
}
