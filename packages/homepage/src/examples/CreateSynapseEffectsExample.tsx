import { useState, useEffect } from 'react'
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher, ofType, createEffect } from 'synapse-storage/reactive'
import { useSelector } from 'synapse-storage/react'
import { tap, debounceTime, map, switchMap, delay } from 'rxjs/operators'
import { of } from 'rxjs'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример: createSynapse() — полный вариант с effects (RxJS side-effects)
 */

interface SearchState {
  query: string
  results: string[]
  isLoading: boolean
  history: string[]
  error: string | null
}

const initialState: SearchState = {
  query: '',
  results: [],
  isLoading: false,
  history: [],
  error: null,
}

// Имитация API-запроса
const fakeSearch = (query: string): Promise<string[]> =>
  new Promise((resolve) =>
    setTimeout(() => {
      resolve(
        query
          ? [`Результат 1 для "${query}"`, `Результат 2 для "${query}"`, `Результат 3 для "${query}"`]
          : [],
      )
    }, 800),
  )

const synapsePromise = createSynapse({
  storage: new MemoryStorage<SearchState>({ name: 'search-effects', initialState }),

  createSelectorsFn: (selectorModule) => {
    const query = selectorModule.createSelector((s) => s.query)
    const results = selectorModule.createSelector((s) => s.results)
    const isLoading = selectorModule.createSelector((s) => s.isLoading)
    const history = selectorModule.createSelector((s) => s.history)
    const error = selectorModule.createSelector((s) => s.error)
    return { query, results, isLoading, history, error }
  },

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction, createWatcher }) => {
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

      const addToHistory = createAction({
        type: 'addToHistory',
        action: (query: string) => {
          storage.update((s) => {
            if (query && !s.history.includes(query)) {
              s.history = [query, ...s.history].slice(0, 5)
            }
          })
          return query
        },
      })

      const clearHistory = createAction({
        type: 'clearHistory',
        action: (_: void) => {
          storage.set('history', [])
        },
      })

      // Watcher для отслеживания query
      const watchQuery = createWatcher({
        type: 'watchQuery',
        selector: (state) => state.query,
      })

      return { setQuery, searchSuccess, searchError, addToHistory, clearHistory, watchQuery }
    }),

  // Конфигурация для effects — связывает dispatcher с effects module
  createEffectConfig: (dispatcher) => ({
    dispatchers: { main: dispatcher },
  }),

  // Effects — RxJS-based side effects
  effects: [
    // Effect 1: Debounced search — реагирует на setQuery action
    createEffect((action$, _state$, _ext, dispatchers) =>
      action$.pipe(
        ofType(dispatchers.main.dispatch.setQuery),
        debounceTime(400),
        switchMap((action) => {
          const query = action.payload as string
          if (!query) {
            return of(null).pipe(
              tap(() => dispatchers.main.dispatch.searchSuccess([])),
            )
          }
          return of(query).pipe(
            delay(0),
            switchMap(async (q) => {
              try {
                const results = await fakeSearch(q)
                dispatchers.main.dispatch.searchSuccess(results)
                dispatchers.main.dispatch.addToHistory(q)
              } catch (e) {
                dispatchers.main.dispatch.searchError(String(e))
              }
            }),
          )
        }),
      ),
    ),
  ],
})

type SearchSynapse = Awaited<typeof synapsePromise>

export function CreateSynapseEffectsExample() {
  const [store, setStore] = useState<SearchSynapse | null>(null)

  useEffect(() => {
    let cancelled = false
    synapsePromise.then((s) => { if (!cancelled) setStore(s) })
    return () => { cancelled = true }
  }, [])

  if (!store) return <div>Initializing createSynapse (with effects)...</div>

  return <SearchUI store={store} />
}

function SearchUI({ store }: { store: SearchSynapse }) {
  const query = useSelector(store.selectors.query)
  const results = useSelector(store.selectors.results)
  const isLoading = useSelector(store.selectors.isLoading)
  const history = useSelector(store.selectors.history)
  const error = useSelector(store.selectors.error)

  return (
    <div style={cardStyle}>
      <h2>createSynapse() — с effects (RxJS side-effects)</h2>

      <input
        type="text"
        value={query ?? ''}
        onChange={(e) => store.actions.setQuery(e.target.value)}
        placeholder="Введите поисковый запрос..."
        style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }}
      />

      {isLoading && <p style={{ color: '#888' }}>Загрузка...</p>}
      {error && <p style={{ color: 'red' }}>Ошибка: {error}</p>}

      {results && results.length > 0 && (
        <ul>
          {results.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {history && history.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={buttonRow}>
            <strong style={{ fontSize: 12 }}>История:</strong>
            <button onClick={() => store.actions.clearHistory()} style={{ fontSize: 11 }}>Очистить</button>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {history.map((h) => (
              <button key={h} onClick={() => store.actions.setQuery(h)} style={{ fontSize: 11, padding: '2px 6px' }}>
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>createEffectConfig: (dispatcher) =&gt; ({'{'} dispatchers: {'{'} main: dispatcher {'}'} {'}'})</code></li>
        <li><code>effects: [createEffect((action$, state$, ext, dispatchers, services, config) =&gt; ...)]</code></li>
        <li><code>ofType(dispatchers.main.dispatch.setQuery)</code> — фильтрация действий по типу</li>
        <li><code>store.state$</code> — Observable потока состояния (доступен при наличии effects)</li>
        <li>Effects автоматически стартуют при инициализации synapse</li>
      </ul>
    </div>
  )
}
