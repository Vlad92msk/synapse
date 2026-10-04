/**
 * Сценарии замера. Каждый сценарий — это «код потребителя»: какие экспорты он импортирует.
 * Все импортированные значения складываются в globalThis.__keep, чтобы бандлер не выкинул их
 * как неиспользуемые (ровно так ведёт себя реальное приложение, которое эти экспорты вызывает).
 *
 * react / react-dom всегда external — это общая база любого React-приложения, её не считаем ни нам,
 * ни конкурентам. rxjs считается (у нас это peer-зависимость, которую потребитель обязан поставить),
 * но отдельно показывается и «собственный код без rxjs».
 */

/** imports: { 'модуль': ['имя', ...] | '*' } */
const s = (id, group, label, imports, note) => ({ id, group, label, imports, note })

export const synapse = [
  // ── Хранилища (vanilla) ──
  s('syn-memory', 'storage', 'MemoryStorage', { 'synapse-storage': ['MemoryStorage'] }),
  s('syn-memory-core', 'storage', 'MemoryStorage (из synapse-storage/core)', { 'synapse-storage/core': ['MemoryStorage'] }),
  s('syn-local', 'storage', 'LocalStorage', { 'synapse-storage': ['LocalStorage'] }),
  s('syn-idb', 'storage', 'IndexedDBStorage', { 'synapse-storage': ['IndexedDBStorage'] }),
  s('syn-worker', 'storage', 'WorkerCacheStorage', { 'synapse-storage': ['WorkerCacheStorage'] }),
  s('syn-browser', 'storage', 'browserStorage (SSR-фабрика)', { 'synapse-storage': ['browserStorage'] }),
  s('syn-all-storages', 'storage', 'Все 4 адаптера', {
    'synapse-storage': ['MemoryStorage', 'LocalStorage', 'IndexedDBStorage', 'WorkerCacheStorage'],
  }),
  s('syn-memory-mw', 'storage', 'MemoryStorage + sync-middlewares (logger, broadcast)', {
    'synapse-storage': ['MemoryStorage', 'syncLoggerMiddleware', 'syncBroadcastMiddleware'],
  }),

  // ── Селекторы ──
  s('syn-memory-selector', 'selector', 'MemoryStorage + Selectors', { 'synapse-storage': ['MemoryStorage', 'Selectors'] }),

  // ── API ──
  s('syn-api', 'api', 'ApiClient', { 'synapse-storage': ['ApiClient'] }),
  s('syn-api-memory', 'api', 'ApiClient + MemoryStorage', { 'synapse-storage': ['ApiClient', 'MemoryStorage'] }),

  // ── Бизнес-логика без rxjs ──
  s('syn-dispatcher', 'reactive', 'Dispatcher', { 'synapse-storage': ['Dispatcher'] }),
  s('syn-module-norx', 'module', 'createSynapse + MemoryStorage + Selectors + Dispatcher (без эффектов, без rxjs)', {
    'synapse-storage': ['createSynapse', 'MemoryStorage', 'Selectors', 'Dispatcher'],
  }),
  s('syn-eventbus', 'reactive', 'createEventBus', { 'synapse-storage': ['createEventBus'] }),

  // ── Эффекты (rxjs) ──
  s('syn-dispatcher-effects', 'reactive', 'Dispatcher + Effects + ofType/validateMap/mutationMap/fromRequest/apiResult', {
    'synapse-storage': ['Dispatcher'], 'synapse-storage/reactive': ['Effects', 'ofType', 'validateMap', 'mutationMap', 'fromRequest', 'apiResult'],
  }),
  s('syn-createSynapse', 'module', 'createSynapse + MemoryStorage + Selectors + Dispatcher + Effects + ofType', {
    'synapse-storage': ['createSynapse', 'MemoryStorage', 'Selectors', 'Dispatcher'], 'synapse-storage/reactive': ['Effects', 'ofType'],
  }),
  s('syn-createSynapse-api', 'module', '…то же + ApiClient + validateMap/fromRequest/apiResult', {
    'synapse-storage': ['createSynapse', 'MemoryStorage', 'Selectors', 'Dispatcher', 'ApiClient'],
    'synapse-storage/reactive': ['Effects', 'ofType', 'validateMap', 'mutationMap', 'fromRequest', 'apiResult'],
  }),

  // ── React ──
  s('syn-react-storage', 'react', 'MemoryStorage + useStorageSubscribe', { 'synapse-storage': ['MemoryStorage'], 'synapse-storage/react': ['useStorageSubscribe'] }),
  s('syn-react-selector', 'react', 'MemoryStorage + Selectors + useSelector', { 'synapse-storage': ['MemoryStorage', 'Selectors'], 'synapse-storage/react': ['useSelector'] }),
  s('syn-react-api', 'react', 'ApiClient + MemoryStorage + useApiQuery/useApiMutation', {
    'synapse-storage': ['ApiClient', 'MemoryStorage'], 'synapse-storage/react': ['useApiQuery', 'useApiMutation'],
  }),
  s('syn-react-module-norx', 'react', 'createSynapse-модуль без эффектов + createSynapseCtx + useSelector (без rxjs)', {
    'synapse-storage': ['createSynapse', 'MemoryStorage', 'Selectors', 'Dispatcher'], 'synapse-storage/react': ['createSynapseCtx', 'useSelector'],
  }),
  s('syn-react-ctx', 'react', 'createSynapse-модуль с эффектами + createSynapseCtx', {
    'synapse-storage': ['createSynapse', 'MemoryStorage', 'Selectors', 'Dispatcher'], 'synapse-storage/react': ['createSynapseCtx'], 'synapse-storage/reactive': ['Effects', 'ofType'],
  }),
  s('syn-typical-norx', 'react', 'Приложение без rxjs: модуль + Ctx + ApiClient + хуки + LocalStorage', {
    'synapse-storage': ['createSynapse', 'MemoryStorage', 'LocalStorage', 'Selectors', 'Dispatcher', 'ApiClient'],
    'synapse-storage/react': ['createSynapseCtx', 'useApiQuery', 'useApiMutation', 'useSelector'],
  }),
  s('syn-typical', 'react', 'Типичное приложение: модуль + эффекты + Ctx + ApiClient + хуки + LocalStorage', {
    'synapse-storage': ['createSynapse', 'MemoryStorage', 'LocalStorage', 'Selectors', 'Dispatcher', 'ApiClient'],
    'synapse-storage/react': ['createSynapseCtx', 'useApiQuery', 'useApiMutation', 'useSelector', 'useObservable'],
    'synapse-storage/reactive': ['Effects', 'ofType', 'validateMap', 'mutationMap', 'fromRequest', 'apiResult'],
  }),

  // ── Максимум ──
  s('syn-full-core', 'full', 'Весь корень (import * from synapse-storage) — без react/rxjs', { 'synapse-storage': '*' }),
  s('syn-full', 'full', 'Всё: корень + /react + /reactive', { 'synapse-storage': '*', 'synapse-storage/react': '*', 'synapse-storage/reactive': '*' }),
]

const rxOps = ['map', 'switchMap', 'mergeMap', 'catchError', 'filter', 'from', 'of', 'takeUntil', 'withLatestFrom']

export const competitors = [
  // ── State, vanilla ──
  s('redux', 'state', 'redux (createStore, combineReducers)', { redux: ['legacy_createStore', 'combineReducers', 'applyMiddleware'] }),
  s('rtk', 'state', 'RTK: configureStore + createSlice', { '@reduxjs/toolkit': ['configureStore', 'createSlice'] }),
  s('rtk-full', 'state', 'RTK: + createAsyncThunk, createEntityAdapter, createSelector, createListenerMiddleware', {
    '@reduxjs/toolkit': ['configureStore', 'createSlice', 'createAsyncThunk', 'createEntityAdapter', 'createSelector', 'createListenerMiddleware'],
  }),
  s('zustand-vanilla', 'state', 'zustand/vanilla (createStore)', { 'zustand/vanilla': ['createStore'] }),
  s('jotai-vanilla', 'state', 'jotai/vanilla (atom, createStore)', { 'jotai/vanilla': ['atom', 'createStore'] }),
  s('valtio-vanilla', 'state', 'valtio/vanilla (proxy, subscribe)', { 'valtio/vanilla': ['proxy', 'subscribe', 'snapshot'] }),
  s('mobx', 'state', 'mobx (makeAutoObservable, autorun, computed)', { mobx: ['makeAutoObservable', 'autorun', 'computed', 'reaction'] }),
  s('effector', 'state', 'effector (createStore, createEvent, createEffect, sample)', { effector: ['createStore', 'createEvent', 'createEffect', 'sample', 'combine'] }),
  s('reselect', 'state', 'reselect (createSelector)', { reselect: ['createSelector'] }),

  // ── State + React ──
  s('redux-react', 'state-react', 'redux + react-redux', { redux: ['legacy_createStore', 'combineReducers'], 'react-redux': ['Provider', 'useSelector', 'useDispatch'] }),
  s('rtk-react', 'state-react', 'RTK + react-redux', { '@reduxjs/toolkit': ['configureStore', 'createSlice'], 'react-redux': ['Provider', 'useSelector', 'useDispatch'] }),
  s('rtk-full-react', 'state-react', 'RTK (полный core) + react-redux', {
    '@reduxjs/toolkit': ['configureStore', 'createSlice', 'createAsyncThunk', 'createEntityAdapter', 'createSelector', 'createListenerMiddleware'],
    'react-redux': ['Provider', 'useSelector', 'useDispatch'],
  }),
  s('zustand', 'state-react', 'zustand (create)', { zustand: ['create'] }),
  s('zustand-mw', 'state-react', 'zustand + persist/devtools/subscribeWithSelector/immer-less', {
    zustand: ['create'], 'zustand/middleware': ['persist', 'devtools', 'subscribeWithSelector', 'createJSONStorage'],
  }),
  s('jotai', 'state-react', 'jotai (atom, useAtom, Provider)', { jotai: ['atom', 'useAtom', 'useAtomValue', 'Provider'] }),
  s('valtio', 'state-react', 'valtio (proxy, useSnapshot)', { valtio: ['proxy', 'useSnapshot', 'subscribe'] }),
  s('mobx-react', 'state-react', 'mobx + mobx-react-lite', { mobx: ['makeAutoObservable', 'autorun', 'computed'], 'mobx-react-lite': ['observer', 'useLocalObservable'] }),
  s('effector-react', 'state-react', 'effector + effector-react', { effector: ['createStore', 'createEvent', 'createEffect', 'sample'], 'effector-react': ['useUnit', 'Provider'] }),

  // ── Persist ──
  s('redux-persist', 'persist', 'redux-persist (persistStore, persistReducer, storage)', {
    'redux-persist': ['persistStore', 'persistReducer'], 'redux-persist/es/storage': ['default'],
  }),

  // ── API / data fetching ──
  s('rtkq', 'api', 'RTK Query (createApi + fetchBaseQuery, без React) + configureStore', {
    '@reduxjs/toolkit/query': ['createApi', 'fetchBaseQuery'], '@reduxjs/toolkit': ['configureStore'],
  }),
  s('rtkq-react', 'api', 'RTK Query React (хуки) + configureStore + react-redux', {
    '@reduxjs/toolkit/query/react': ['createApi', 'fetchBaseQuery'], '@reduxjs/toolkit': ['configureStore'], 'react-redux': ['Provider'],
  }),
  s('query-core', 'api', '@tanstack/query-core (QueryClient)', { '@tanstack/query-core': ['QueryClient', 'QueryObserver', 'MutationObserver'] }),
  s('react-query', 'api', '@tanstack/react-query (QueryClient, useQuery, useMutation)', {
    '@tanstack/react-query': ['QueryClient', 'QueryClientProvider', 'useQuery', 'useMutation'],
  }),
  s('swr', 'api', 'swr (useSWR + useSWRMutation)', { swr: ['default'], 'swr/mutation': ['default'] }),
  s('axios', 'api', 'axios', { axios: ['default'] }),
  s('ky', 'api', 'ky', { ky: ['default'] }),

  // ── Side effects ──
  s('rxjs-ops', 'effects', `rxjs (Observable, Subject + ${rxOps.length} операторов)`, { rxjs: ['Observable', 'Subject', 'BehaviorSubject', ...rxOps] }),
  s('redux-observable', 'effects', 'redux-observable + rxjs (те же операторы)', {
    'redux-observable': ['createEpicMiddleware', 'combineEpics', 'ofType'], rxjs: ['Observable', 'Subject', 'BehaviorSubject', ...rxOps],
  }),
  s('redux-saga', 'effects', 'redux-saga (+ effects)', { 'redux-saga': ['default'], 'redux-saga/effects': ['takeLatest', 'call', 'put', 'select', 'fork', 'all'] }),

  // ── Стэки ──
  s('stack-rtk-rtkq', 'stack', 'RTK + react-redux + RTK Query React', {
    '@reduxjs/toolkit': ['configureStore', 'createSlice', 'createSelector'], '@reduxjs/toolkit/query/react': ['createApi', 'fetchBaseQuery'],
    'react-redux': ['Provider', 'useSelector', 'useDispatch'],
  }),
  s('stack-rtk-full', 'stack', 'RTK + react-redux + RTK Query React + redux-observable + rxjs + redux-persist', {
    '@reduxjs/toolkit': ['configureStore', 'createSlice', 'createSelector', 'createAsyncThunk', 'createEntityAdapter'],
    '@reduxjs/toolkit/query/react': ['createApi', 'fetchBaseQuery'], 'react-redux': ['Provider', 'useSelector', 'useDispatch'],
    'redux-observable': ['createEpicMiddleware', 'combineEpics', 'ofType'], rxjs: ['Observable', 'Subject', 'BehaviorSubject', ...rxOps],
    'redux-persist': ['persistStore', 'persistReducer'], 'redux-persist/es/storage': ['default'],
  }),
  s('stack-rtk-saga', 'stack', 'RTK + react-redux + RTK Query React + redux-saga + redux-persist', {
    '@reduxjs/toolkit': ['configureStore', 'createSlice', 'createSelector'], '@reduxjs/toolkit/query/react': ['createApi', 'fetchBaseQuery'],
    'react-redux': ['Provider', 'useSelector', 'useDispatch'], 'redux-saga': ['default'], 'redux-saga/effects': ['takeLatest', 'call', 'put', 'select'],
    'redux-persist': ['persistStore', 'persistReducer'], 'redux-persist/es/storage': ['default'],
  }),
  s('stack-zustand-rq', 'stack', 'zustand + middleware + @tanstack/react-query', {
    zustand: ['create'], 'zustand/middleware': ['persist', 'devtools', 'createJSONStorage'],
    '@tanstack/react-query': ['QueryClient', 'QueryClientProvider', 'useQuery', 'useMutation'],
  }),
  s('stack-zustand-rq-axios', 'stack', 'zustand + middleware + react-query + axios', {
    zustand: ['create'], 'zustand/middleware': ['persist', 'devtools', 'createJSONStorage'],
    '@tanstack/react-query': ['QueryClient', 'QueryClientProvider', 'useQuery', 'useMutation'], axios: ['default'],
  }),
  s('stack-mobx-rq', 'stack', 'mobx + mobx-react-lite + @tanstack/react-query', {
    mobx: ['makeAutoObservable', 'autorun', 'computed'], 'mobx-react-lite': ['observer'],
    '@tanstack/react-query': ['QueryClient', 'QueryClientProvider', 'useQuery', 'useMutation'],
  }),
]

export const toEntrySource = (imports) => {
  const lines = []
  const keep = []
  let i = 0
  for (const [mod, names] of Object.entries(imports)) {
    if (names === '*') {
      const alias = `ns${i++}`
      lines.push(`import * as ${alias} from '${mod}'`)
      keep.push(alias)
      continue
    }
    const specs = names.map((n) => {
      const alias = `v${i++}`
      keep.push(alias)
      return n === 'default' ? { def: alias } : `${n} as ${alias}`
    })
    const def = specs.find((x) => typeof x === 'object')
    const named = specs.filter((x) => typeof x === 'string')
    const parts = []
    if (def) parts.push(def.def)
    if (named.length) parts.push(`{ ${named.join(', ')} }`)
    lines.push(`import ${parts.join(', ')} from '${mod}'`)
  }
  lines.push(`globalThis.__keep = [${keep.join(', ')}]`)
  return lines.join('\n') + '\n'
}

/**
 * «Лестница» сравнения для итоговой таблицы: на каждой ступени — сценарий synapse и эквивалентные
 * решения конкурентов (id из `competitors`).
 */
export const ladder = [
  { step: 'Стор (без React)', syn: 'syn-memory', comp: ['zustand-vanilla', 'redux', 'rtk', 'effector', 'mobx'] },
  { step: 'Стор + React', syn: 'syn-react-storage', comp: ['zustand', 'redux-react', 'jotai', 'rtk-react', 'mobx-react'] },
  { step: 'Стор + селекторы + React', syn: 'syn-react-selector', comp: ['rtk-full-react', 'effector-react'] },
  { step: 'Персист: localStorage', syn: 'syn-local', comp: ['zustand-mw', 'redux-persist'] },
  { step: 'Персист: IndexedDB', syn: 'syn-idb', comp: [] },
  { step: 'API-клиент + кэш + хуки', syn: 'syn-react-api', comp: ['swr', 'react-query', 'rtkq-react'] },
  { step: 'Side effects (Dispatcher + Effects)', syn: 'syn-dispatcher-effects', comp: ['redux-saga', 'redux-observable'] },
  { step: 'Бизнес-модуль без rxjs (createSynapse)', syn: 'syn-module-norx', comp: ['rtk-full', 'effector'] },
  { step: 'Бизнес-модуль + эффекты', syn: 'syn-createSynapse', comp: ['stack-zustand-rq', 'stack-mobx-rq'] },
  { step: 'Приложение без rxjs', syn: 'syn-typical-norx', comp: ['stack-rtk-rtkq', 'stack-zustand-rq'] },
  { step: 'Типичное приложение (с эффектами)', syn: 'syn-typical', comp: ['stack-rtk-rtkq', 'stack-zustand-rq-axios', 'stack-rtk-saga', 'stack-rtk-full'] },
  { step: 'Максимум (весь пакет)', syn: 'syn-full', comp: [] },
]
