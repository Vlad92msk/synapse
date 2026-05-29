import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher, ofType, createEffect } from 'synapse-storage/reactive'
import { useSelector } from 'synapse-storage/react'
import { debounceTime, switchMap, tap } from 'rxjs/operators'
import { of } from 'rxjs'
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

// Fake API
const fakeSearch = (query: string): Promise<string[]> =>
  new Promise((resolve) =>
    setTimeout(() => resolve(query ? [`Result 1 for "${query}"`, `Result 2 for "${query}"`] : []), 600),
  )

// ─── Создание synapse с effects ────────────────────────────────────────────────

const synapsePromise = createSynapse({
  storage: new MemoryStorage<SearchState>({ name: 'search-effects', initialState }),

  createSelectorsFn: (selectorModule) => ({
    query: selectorModule.createSelector((s) => s.query),
    results: selectorModule.createSelector((s) => s.results),
    isLoading: selectorModule.createSelector((s) => s.isLoading),
    error: selectorModule.createSelector((s) => s.error),
  }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction }) => {
      const setQuery = createAction({
        type: 'setQuery',
        action: (query: string) => {
          storage.update((s) => {
            s.query = query
            s.isLoading = query.length > 0
            s.error = null
          })
          return query
        },
      })

      const searchSuccess = createAction({
        type: 'searchSuccess',
        action: (results: string[]) => {
          storage.update((s) => {
            s.results = results
            s.isLoading = false
          })
          return results
        },
      })

      const searchError = createAction({
        type: 'searchError',
        action: (error: string) => {
          storage.update((s) => {
            s.error = error
            s.isLoading = false
            s.results = []
          })
          return error
        },
      })

      return { setQuery, searchSuccess, searchError }
    }),

  // Конфигурация эффектов — dispatcher передаётся автоматически
  createEffectConfig: () => ({}),

  // Effects — RxJS side-effects
  effects: [
    createEffect((action$, _state$, { dispatcher }) =>
      action$.pipe(
        ofType(dispatcher.dispatch.setQuery),                // фильтр по типу action
        debounceTime(400),                                    // debounce
        switchMap((action) => {
          const query = action.payload as string
          if (!query) {
            return of(null).pipe(tap(() => dispatcher.dispatch.searchSuccess([])))
          }
          return of(query).pipe(
            switchMap(async (q) => {
              try {
                const results = await fakeSearch(q)
                dispatcher.dispatch.searchSuccess(results)
              } catch (e) {
                dispatcher.dispatch.searchError(String(e))
              }
            }),
          )
        }),
      ),
    ),
  ],
})

type SearchSynapse = Awaited<typeof synapsePromise>

// ─── Компонент-пример ──────────────────────────────────────────────────────────

export function CreateSynapseEffectsExample() {
  const [store, setStore] = useState<SearchSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    synapsePromise.then((s) => { if (!cancelled) setStore(s) })
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
import { createDispatcher, ofType, createEffect } from 'synapse-storage/reactive'
import { debounceTime, switchMap, tap } from 'rxjs/operators'
import { of } from 'rxjs'

const synapsePromise = createSynapse({
  storage: new MemoryStorage<SearchState>({ name: 'search', initialState }),

  createSelectorsFn: (sm) => ({ ... }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction }) => {
      const setQuery = createAction({ type: 'setQuery', action: (q: string) => { ... } })
      const searchSuccess = createAction({ type: 'searchSuccess', action: ... })
      return { setQuery, searchSuccess }
    }),

  // Dispatcher передаётся автоматически
  createEffectConfig: () => ({
    // services?: {},            // сервисы (API-клиенты и т.д.)
    // config?: {},              // конфигурация для эффектов
    // externalDispatchers?: {}, // dispatcher'ы из других synapse
  }),

  // Массив эффектов
  effects: [ ... ],
})`}</pre>

      {/* ─── createEffect ─────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>createEffect</h3>
      <pre style={codeBlock}>{`import { createEffect, ofType } from 'synapse-storage/reactive'

// Effect — функция, принимающая потоки и контекст, возвращающая Observable
createEffect((action$, state$, { dispatcher, services, config }) =>
  action$.pipe(
    ofType(dispatcher.dispatch.setQuery),  // фильтр по action
    debounceTime(400),
    switchMap((action) => {
      const query = action.payload as string
      return of(query).pipe(
        switchMap(async (q) => {
          const results = await fetchResults(q)
          dispatcher.dispatch.searchSuccess(results)
        }),
      )
    }),
  ),
)

// Аргументы effect:
// action$  — Observable всех dispatched actions
// state$   — Observable текущего state
// context  — { dispatcher, externalDispatchers, services, config }`}</pre>

      {/* ─── ofType ───────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>ofType / ofTypes</h3>
      <pre style={codeBlock}>{`import { ofType, ofTypes } from 'synapse-storage/reactive'

// ofType — фильтрует поток по одному типу action
action$.pipe(
  ofType(dispatchers.main.dispatch.setQuery),
  // action.type === '[search]setQuery'
)

// ofTypes — фильтрует по нескольким типам
action$.pipe(
  ofTypes([
    dispatchers.main.dispatch.setQuery,
    dispatchers.main.dispatch.searchError,
  ]),
)`}</pre>

      {/* ─── Возвращаемое значение ───────────────────────────────────── */}
      <h3 style={sectionTitle}>Возвращаемое значение</h3>
      <pre style={codeBlock}>{`const store = await synapsePromise

store.storage     // IStorage<SearchState>
store.selectors   // { query, results, isLoading, error }
store.actions     // { setQuery, searchSuccess, searchError }
store.dispatcher  // Dispatcher
store.state$      // Observable<SearchState> — поток состояния (только с effects!)
store.destroy()   // () => Promise<void>

// Effects автоматически стартуют при инициализации`}</pre>

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
    </div>
  )
}
