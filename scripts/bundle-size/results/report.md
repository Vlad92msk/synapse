# Bundle size — сырые результаты

synapse-storage 7.0.0 (локальный dist), 2026-10-04T12:59:26.568Z. База сравнения: npm 6.2.0.
Единицы — KB (1024 B), ячейка: min / **gzip** / brotli. Из каждого значения вычтен «пустой» бандл соответствующего бандлера. react/react-dom — external.

## synapse-storage

| Сценарий | esbuild | rollup | rolldown | webpack 5 | esbuild без rxjs | rolldown, npm 6.2.0 |
|---|---|---|---|---|---|---|
| MemoryStorage | 24.37 / **7.22** / 6.51 | 23.94 / **7.07** / 6.34 | 24.01 / **7.09** / 6.38 | 23.99 / **7.05** / 6.33 | 24.37 / **7.22** / 6.51 | 56.60 / **15.39** / 13.76 |
| MemoryStorage (из synapse-storage/core) | 24.37 / **7.23** / 6.52 | 23.94 / **7.06** / 6.34 | 24.02 / **7.09** / 6.40 | 23.99 / **7.05** / 6.33 | 24.37 / **7.23** / 6.52 | 42.66 / **11.42** / 10.17 |
| LocalStorage | 24.80 / **7.31** / 6.60 | 24.38 / **7.14** / 6.39 | 24.43 / **7.16** / 6.46 | 24.43 / **7.12** / 6.42 | 24.80 / **7.31** / 6.60 | 57.02 / **15.45** / 13.84 |
| IndexedDBStorage | 33.89 / **9.66** / 8.71 | 33.45 / **9.42** / 8.42 | 33.41 / **9.43** / 8.44 | 33.50 / **9.39** / 8.44 | 33.89 / **9.66** / 8.71 | 66.01 / **17.67** / 15.82 |
| WorkerCacheStorage | 45.67 / **11.97** / 10.80 | 41.88 / **11.67** / 10.36 | 41.99 / **11.71** / 10.41 | 41.94 / **11.67** / 10.36 | 45.67 / **11.97** / 10.80 | 60.97 / **16.45** / 14.69 |
| browserStorage (SSR-фабрика) | 24.46 / **7.27** / 6.55 | 24.04 / **7.11** / 6.38 | 24.11 / **7.14** / 6.42 | 24.09 / **7.09** / 6.37 | 24.46 / **7.27** / 6.55 | 56.70 / **15.44** / 13.82 |
| Все 4 адаптера | 69.21 / **15.66** / 14.01 | 65.34 / **15.30** / 13.51 | 65.25 / **15.22** / 13.49 | 65.40 / **15.30** / 13.57 | 69.21 / **15.66** / 14.01 | 84.25 / **20.00** / 17.75 |
| MemoryStorage + sync-middlewares (logger, broadcast) | 28.65 / **8.42** / 7.58 | 28.26 / **8.25** / 7.40 | 28.31 / **8.24** / 7.40 | 28.28 / **8.20** / 7.39 | 28.65 / **8.42** / 7.58 | 56.62 / **15.39** / 13.77 |
| MemoryStorage + Selectors | 33.86 / **9.74** / 8.78 | 31.96 / **9.48** / 8.45 | 31.36 / **9.16** / 8.20 | 32.00 / **9.45** / 8.44 | 33.86 / **9.74** / 8.78 | 63.19 / **17.17** / 15.35 |
| ApiClient | 24.48 / **7.10** / 6.43 | 23.34 / **6.94** / 6.23 | 23.15 / **6.92** / 6.19 | 23.34 / **6.95** / 6.21 | 24.48 / **7.10** / 6.43 | 55.94 / **15.45** / 13.75 |
| ApiClient + MemoryStorage | 48.30 / **13.72** / 12.37 | 46.70 / **13.39** / 11.97 | 46.57 / **13.34** / 12.00 | 46.71 / **13.39** / 11.97 | 48.30 / **13.72** / 12.37 | 79.23 / **21.74** / 19.34 |
| Dispatcher | 10.02 / **3.09** / 2.82 | 9.18 / **3.00** / 2.66 | 9.30 / **3.07** / 2.75 | 9.22 / **3.01** / 2.68 | 10.02 / **3.09** / 2.82 | 46.61 / **13.09** / 11.75 |
| createSynapse + MemoryStorage + Selectors + Dispatcher (без эффектов, без rxjs) | 47.39 / **13.50** / 12.17 | 44.14 / **13.08** / 11.66 | 43.68 / **12.83** / 11.45 | 44.18 / **13.17** / 11.68 | 47.39 / **13.50** / 12.17 | 86.95 / **24.30** / 21.65 |
| createEventBus | 41.59 / **12.15** / 10.97 | 39.21 / **11.83** / 10.52 | 39.42 / **11.90** / 10.59 | 39.26 / **11.83** / 10.53 | 41.59 / **12.15** / 10.97 | 82.67 / **23.34** / 20.81 |
| Dispatcher + Effects + ofType/validateMap/mutationMap/fromRequest/apiResult | 43.90 / **13.57** / 12.18 | 39.94 / **12.35** / 11.05 | 41.79 / **13.00** / 11.63 | 41.70 / **12.88** / 11.53 | 17.30 / **5.52** / 5.03 | 54.59 / **15.60** / 13.95 |
| createSynapse + MemoryStorage + Selectors + Dispatcher + Effects + ofType | 76.31 / **22.09** / 19.82 | 70.36 / **20.79** / 18.53 | 71.40 / **20.94** / 18.73 | 71.98 / **21.41** / 19.00 | 52.25 / **14.93** / 13.46 | 87.24 / **24.41** / 21.71 |
| …то же + ApiClient + validateMap/fromRequest/apiResult | 104.72 / **30.15** / 26.93 | 97.31 / **28.48** / 25.15 | 98.34 / **28.69** / 25.46 | 99.09 / **29.17** / 25.66 | 78.09 / **22.10** / 19.81 | 114.19 / **32.28** / 28.45 |
| MemoryStorage + useStorageSubscribe | 24.83 / **7.42** / 6.69 | 24.41 / **7.22** / 6.49 | 24.46 / **7.27** / 6.54 | 24.46 / **7.23** / 6.49 | 24.83 / **7.42** / 6.69 | 57.05 / **15.58** / 13.94 |
| MemoryStorage + Selectors + useSelector | 34.31 / **9.93** / 8.96 | 32.41 / **9.65** / 8.59 | 31.81 / **9.34** / 8.36 | 32.45 / **9.63** / 8.60 | 34.31 / **9.93** / 8.96 | 63.64 / **17.35** / 15.52 |
| ApiClient + MemoryStorage + useApiQuery/useApiMutation | 50.39 / **14.47** / 12.98 | 48.70 / **14.05** / 12.51 | 48.58 / **14.03** / 12.59 | 48.71 / **14.04** / 12.54 | 50.39 / **14.47** / 12.98 | 81.23 / **22.46** / 19.90 |
| createSynapse-модуль без эффектов + createSynapseCtx + useSelector (без rxjs) | 50.57 / **14.61** / 13.18 | 46.88 / **14.05** / 12.51 | 46.53 / **13.85** / 12.39 | 46.93 / **14.16** / 12.56 | 50.57 / **14.61** / 13.18 | 89.77 / **25.35** / 22.55 |
| createSynapse-модуль с эффектами + createSynapseCtx | 79.04 / **23.05** / 20.72 | 72.68 / **21.67** / 19.26 | 73.84 / **21.80** / 19.51 | 74.31 / **22.30** / 19.75 | 54.97 / **15.87** / 14.30 | 89.64 / **25.28** / 22.51 |
| Приложение без rxjs: модуль + Ctx + ApiClient + хуки + LocalStorage | 78.62 / **22.13** / 19.83 | 73.71 / **21.37** / 18.84 | 73.08 / **21.06** / 18.72 | 73.76 / **21.35** / 18.89 | 78.62 / **22.13** / 19.83 | 116.35 / **32.77** / 28.78 |
| Типичное приложение: модуль + эффекты + Ctx + ApiClient + хуки + LocalStorage | 112.29 / **32.43** / 28.86 | 104.28 / **30.64** / 26.86 | 105.34 / **30.75** / 27.21 | 106.06 / **31.26** / 27.42 | 85.65 / **24.37** / 21.77 | 121.16 / **34.35** / 30.17 |
| Весь корень (import * from synapse-storage) — без react/rxjs | 129.76 / **32.34** / 28.31 | 121.08 / **31.25** / 26.96 | 120.47 / **30.93** / 26.89 | 121.54 / **31.36** / 27.16 | 129.76 / **32.34** / 28.31 | 159.51 / **42.94** / 37.37 |
| Всё: корень + /react + /reactive | 174.61 / **46.22** / 40.37 | 161.97 / **43.70** / 37.85 | 162.83 / **43.92** / 38.18 | 164.35 / **44.29** / 38.44 | 147.24 / **37.89** / 33.07 | 160.27 / **43.00** / 37.44 |

## Конкуренты

| Сценарий | esbuild | rollup | rolldown | webpack 5 | состав (esbuild, min KB) |
|---|---|---|---|---|---|
| redux (createStore, combineReducers) | 2.75 / **1.16** / 1.04 | 2.74 / **1.12** / 1.01 | 2.70 / **1.13** / 1.02 | 2.74 / **1.12** / 1.01 | redux 2.74, (entry) 0.03 |
| RTK: configureStore + createSlice | 21.46 / **8.30** / 7.64 | 18.20 / **6.79** / 6.26 | 18.63 / **6.96** / 6.41 | 18.36 / **6.82** / 6.29 | @reduxjs/toolkit 9.43, immer 9.13, redux 2.79, redux-thunk 0.10, (entry) 0.03 |
| RTK: + createAsyncThunk, createEntityAdapter, createSelector, createListenerMiddleware | 32.31 / **12.43** / 11.32 | 31.88 / **11.57** / 10.60 | 32.31 / **11.81** / 10.74 | 32.02 / **11.59** / 10.60 | @reduxjs/toolkit 17.44, immer 9.18, redux 2.79, reselect 2.78, redux-thunk 0.10, (entry) 0.04 |
| zustand/vanilla (createStore) | 0.31 / **0.21** / 0.20 | 0.32 / **0.21** / 0.19 | 0.32 / **0.22** / 0.20 | 0.32 / **0.21** / 0.19 | zustand 0.31, (entry) 0.02 |
| jotai/vanilla (atom, createStore) | 5.65 / **2.42** / 2.19 | 6.05 / **2.54** / 2.30 | 5.84 / **2.34** / 2.13 | 6.05 / **2.54** / 2.31 | jotai 5.65, (entry) 0.02 |
| valtio/vanilla (proxy, subscribe) | 2.90 / **1.29** / 1.18 | 2.88 / **1.24** / 1.14 | 2.98 / **1.25** / 1.15 | 2.44 / **1.12** / 1.04 | valtio 2.72, proxy-compare 0.18, (entry) 0.03 |
| mobx (makeAutoObservable, autorun, computed) | 41.78 / **11.89** / 10.79 | 41.52 / **11.62** / 10.53 | 41.22 / **11.35** / 10.33 | 41.83 / **11.73** / 10.64 | mobx 41.77, (entry) 0.03 |
| effector (createStore, createEvent, createEffect, sample) | 18.33 / **8.34** / 7.62 | 17.78 / **7.85** / 7.17 | 18.00 / **8.06** / 7.38 | 18.41 / **8.16** / 7.48 | effector 18.32, (entry) 0.03 |
| reselect (createSelector) | 2.75 / **1.24** / 1.11 | 2.83 / **1.19** / 1.07 | 2.74 / **1.18** / 1.07 | 2.83 / **1.19** / 1.07 | reselect 2.75, (entry) 0.02 |
| redux + react-redux | 7.31 / **3.05** / 2.74 | 5.78 / **2.30** / 2.10 | 6.54 / **2.68** / 2.40 | 6.02 / **2.37** / 2.14 | react-redux 2.83, redux 2.46, use-sync-external-store 0.83, (entry) 0.03 |
| RTK + react-redux | 26.37 / **10.23** / 9.40 | 21.59 / **8.05** / 7.40 | 22.82 / **8.57** / 7.83 | 22.00 / **8.14** / 7.47 | @reduxjs/toolkit 9.43, immer 9.15, react-redux 2.85, redux 2.79, use-sync-external-store 0.84, redux-thunk 0.10, (entry) 0.03 |
| RTK (полный core) + react-redux | 37.21 / **14.35** / 13.03 | 35.28 / **12.79** / 11.68 | 36.50 / **13.40** / 12.14 | 35.67 / **12.88** / 11.76 | @reduxjs/toolkit 17.45, immer 9.18, react-redux 2.85, redux 2.80, reselect 2.78, use-sync-external-store 0.84, redux-thunk 0.10, (entry) 0.05 |
| zustand (create) | 0.59 / **0.34** / 0.31 | 0.59 / **0.33** / 0.29 | 0.60 / **0.34** / 0.30 | 0.60 / **0.34** / 0.30 | zustand 0.59, (entry) 0.02 |
| zustand + persist/devtools/subscribeWithSelector/immer-less | 6.28 / **2.77** / 2.49 | 6.53 / **2.72** / 2.43 | 6.15 / **2.62** / 2.34 | 6.25 / **2.62** / 2.35 | zustand 6.27, (entry) 0.03 |
| jotai (atom, useAtom, Provider) | 7.32 / **3.17** / 2.86 | 7.65 / **3.20** / 2.90 | 7.42 / **3.01** / 2.73 | 7.66 / **3.20** / 2.89 | jotai 7.31, (entry) 0.03 |
| valtio (proxy, useSnapshot) | 5.77 / **2.38** / 2.20 | 5.67 / **2.24** / 2.07 | 5.78 / **2.24** / 2.07 | 4.55 / **1.90** / 1.79 | valtio 3.34, proxy-compare 2.42, (entry) 0.03 |
| mobx + mobx-react-lite | 46.46 / **13.41** / 12.15 | 45.80 / **12.92** / 11.67 | 45.71 / **12.68** / 11.51 | 46.18 / **13.04** / 11.80 | mobx 42.07, mobx-react-lite 4.38, (entry) 0.03 |
| effector + effector-react | 24.49 / **10.75** / 9.81 | 22.56 / **9.70** / 8.84 | 24.08 / **10.34** / 9.45 | 23.14 / **9.87** / 9.03 | effector 19.37, effector-react 1.89, use-sync-external-store 1.67, (entry) 0.04 |
| redux-persist (persistStore, persistReducer, storage) | 10.14 / **3.43** / 3.06 | 9.85 / **3.17** / 2.85 | 9.98 / **3.25** / 2.93 | 9.96 / **3.21** / 2.88 | redux-persist 8.29, redux 1.85, (entry) 0.03 |
| RTK Query (createApi + fetchBaseQuery, без React) + configureStore | 62.33 / **22.11** / 20.16 | 61.48 / **20.80** / 18.91 | 62.08 / **20.72** / 19.01 | 61.66 / **20.79** / 18.93 | @reduxjs/toolkit 44.00, immer 12.53, redux 2.80, reselect 2.78, @standard-schema/utils 0.11, redux-thunk 0.10, (entry) 0.03 |
| RTK Query React (хуки) + configureStore + react-redux | 75.37 / **26.59** / 24.07 | 72.90 / **24.44** / 22.12 | 74.23 / **24.75** / 22.50 | 73.76 / **24.47** / 22.13 | @reduxjs/toolkit 51.76, immer 12.55, react-redux 3.22, redux 2.80, reselect 2.78, use-sync-external-store 0.84, @standard-schema/utils 0.11, redux-thunk 0.10, (entry) 0.03 |
| @tanstack/query-core (QueryClient) | 31.80 / **9.16** / 8.36 | 31.96 / **9.08** / 8.27 | 31.83 / **8.97** / 8.20 | 31.95 / **9.06** / 8.28 | @tanstack/query-core 31.80, (entry) 0.03 |
| @tanstack/react-query (QueryClient, useQuery, useMutation) | 34.32 / **10.12** / 9.21 | 34.23 / **9.86** / 9.02 | 34.17 / **9.84** / 8.98 | 34.14 / **9.84** / 9.02 | @tanstack/query-core 31.87, @tanstack/react-query 2.43, (entry) 0.03 |
| swr (useSWR + useSWRMutation) | 15.09 / **6.80** / 6.16 | 13.37 / **5.77** / 5.26 | 14.28 / **6.26** / 5.66 | 14.12 / **5.92** / 5.42 | swr 12.64, use-sync-external-store 0.82, dequal 0.46, (entry) 0.03 |
| axios | 49.85 / **19.04** / 17.35 | 49.64 / **18.13** / 16.38 | 49.08 / **18.15** / 16.48 | 50.04 / **18.20** / 16.43 | axios 49.76, (entry) 0.02 |
| ky | 24.61 / **8.68** / 7.78 | 24.56 / **8.39** / 7.49 | 24.39 / **8.41** / 7.54 | 24.57 / **8.39** / 7.49 | ky 24.51, (entry) 0.02 |
| rxjs (Observable, Subject + 9 операторов) | 20.67 / **6.41** / 5.79 | 18.93 / **5.73** / 5.17 | 20.00 / **6.07** / 5.52 | 19.85 / **6.02** / 5.45 | rxjs 16.74, tslib 3.90, (entry) 0.05 |
| redux-observable + rxjs (те же операторы) | 25.78 / **7.89** / 7.13 | 23.56 / **7.00** / 6.33 | 24.89 / **7.44** / 6.78 | 24.79 / **7.39** / 6.71 | rxjs 20.15, tslib 3.90, redux-observable 1.25, redux 0.45, (entry) 0.06 |
| redux-saga (+ effects) | 14.95 / **5.78** / 5.27 | 14.03 / **5.23** / 4.75 | 14.52 / **5.46** / 4.99 | 14.17 / **5.31** / 4.82 | @redux-saga/core 13.61, @redux-saga/is 0.55, @babel/runtime 0.45, @redux-saga/symbols 0.23, @redux-saga/deferred 0.09, (entry) 0.04 |
| RTK + react-redux + RTK Query React | 75.38 / **26.60** / 24.07 | 72.91 / **24.46** / 22.11 | 74.24 / **24.76** / 22.54 | 73.77 / **24.48** / 22.16 | @reduxjs/toolkit 51.76, immer 12.55, react-redux 3.22, redux 2.80, reselect 2.78, use-sync-external-store 0.84, @standard-schema/utils 0.11, redux-thunk 0.10, (entry) 0.04 |
| RTK + react-redux + RTK Query React + redux-observable + rxjs + redux-persist | 113.67 / **38.27** / 34.26 | 108.93 / **35.04** / 31.27 | 111.68 / **35.73** / 32.14 | 111.08 / **35.43** / 31.65 | @reduxjs/toolkit 56.12, rxjs 20.30, immer 12.59, redux-persist 8.36, tslib 3.91, react-redux 3.22, redux 2.82, reselect 2.78, redux-observable 1.26, use-sync-external-store 0.84, @standard-schema/utils 0.11, redux-thunk 0.10, (entry) 0.10 |
| RTK + react-redux + RTK Query React + redux-saga + redux-persist | 98.81 / **34.66** / 31.18 | 95.28 / **31.68** / 28.50 | 97.22 / **32.29** / 29.12 | 96.32 / **31.82** / 28.57 | @reduxjs/toolkit 51.78, @redux-saga/core 13.67, immer 12.56, redux-persist 8.36, react-redux 3.22, redux 2.80, reselect 2.78, use-sync-external-store 0.84, @redux-saga/is 0.56, @babel/runtime 0.45, @redux-saga/symbols 0.25, @standard-schema/utils 0.11, redux-thunk 0.10, @redux-saga/deferred 0.09, (entry) 0.07 |
| zustand + middleware + @tanstack/react-query | 40.43 / **12.58** / 11.41 | 40.53 / **12.32** / 11.18 | 40.14 / **12.13** / 11.01 | 40.14 / **12.17** / 11.07 | @tanstack/query-core 31.88, zustand 6.09, @tanstack/react-query 2.44, (entry) 0.04 |
| zustand + middleware + react-query + axios | 90.42 / **31.35** / 28.35 | 90.57 / **30.40** / 27.20 | 89.43 / **29.97** / 27.10 | 90.40 / **30.38** / 27.14 | axios 49.81, @tanstack/query-core 31.94, zustand 6.11, @tanstack/react-query 2.45, (entry) 0.05 |
| mobx + mobx-react-lite + @tanstack/react-query | 80.88 / **23.12** / 20.93 | 80.21 / **22.45** / 20.31 | 80.02 / **22.06** / 20.03 | 80.43 / **22.52** / 20.39 | mobx 42.13, @tanstack/query-core 31.94, mobx-react-lite 4.32, @tanstack/react-query 2.45, (entry) 0.04 |

## Состав бандлов synapse (esbuild metafile, min-байты до сжатия)

<details><summary><b>MemoryStorage</b> — synapse-storage 24.37, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.36 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| _utils/error-handling.util.js | 0.15 |

</details>

<details><summary><b>MemoryStorage (из synapse-storage/core)</b> — synapse-storage 24.37, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.36 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| _utils/error-handling.util.js | 0.15 |

</details>

<details><summary><b>LocalStorage</b> — synapse-storage 24.80, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.36 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/storage/adapters/local-storage.service.js | 2.07 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/adapters/path.utils.js | 0.59 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| _utils/error-handling.util.js | 0.15 |

</details>

<details><summary><b>IndexedDBStorage</b> — synapse-storage 33.88, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/indexed-DB.service.js | 9.93 |
| core/storage/adapters/async-base-storage.service.js | 7.84 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/storage/utils/middleware-module.js | 1.72 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/middlewares/storage-batching.middleware.js | 1.16 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/adapters/path.utils.js | 0.60 |
| core/storage/middlewares/storage-logger.middleware.js | 0.53 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/storage-shallow-compare.middleware.js | 0.32 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| _utils/error-handling.util.js | 0.15 |

</details>

<details><summary><b>WorkerCacheStorage</b> — synapse-storage 45.67, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/utils/worker-channel.util.js | 14.96 |
| core/storage/adapters/async-base-storage.service.js | 7.85 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/adapters/worker-storage.service.js | 3.71 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/storage/utils/broadcast.util.js | 1.82 |
| core/storage/utils/middleware-module.js | 1.72 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/middlewares/storage-batching.middleware.js | 1.16 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/adapters/worker-backends/shared-worker-backend.js | 0.75 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/middlewares/storage-logger.middleware.js | 0.53 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/storage-shallow-compare.middleware.js | 0.32 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| _utils/error-handling.util.js | 0.15 |

</details>

<details><summary><b>browserStorage (SSR-фабрика)</b> — synapse-storage 24.46, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.36 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| _utils/error-handling.util.js | 0.15 |
| core/storage/browser-storage.util.js | 0.09 |

</details>

<details><summary><b>Все 4 адаптера</b> — synapse-storage 69.21, (entry) 0.03</summary>

| файл dist | KB min |
|---|--:|
| core/storage/utils/worker-channel.util.js | 14.98 |
| core/storage/adapters/indexed-DB.service.js | 9.93 |
| core/storage/adapters/async-base-storage.service.js | 7.85 |
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/adapters/worker-storage.service.js | 3.72 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/storage/utils/middleware-module.js | 3.34 |
| core/storage/adapters/local-storage.service.js | 2.07 |
| core/storage/utils/broadcast.util.js | 1.82 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/middlewares/storage-batching.middleware.js | 1.16 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/adapters/worker-backends/shared-worker-backend.js | 0.75 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/middlewares/storage-logger.middleware.js | 0.53 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/storage-shallow-compare.middleware.js | 0.32 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| _utils/error-handling.util.js | 0.15 |

</details>

<details><summary><b>MemoryStorage + sync-middlewares (logger, broadcast)</b> — synapse-storage 28.64, (entry) 0.03</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.36 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/storage/middlewares/shared-state.factory.js | 2.34 |
| core/storage/utils/broadcast.util.js | 1.82 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| _utils/error-handling.util.js | 0.18 |
| core/storage/modules/singleton/models.js | 0.16 |
| core/storage/middlewares/sync-broadcast.middleware.js | 0.09 |

</details>

<details><summary><b>MemoryStorage + Selectors</b> — synapse-storage 33.86, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| core/selector/selector.module.js | 6.61 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/observable/interop-observable.js | 0.97 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/error-handling.util.js | 0.31 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |

</details>

<details><summary><b>ApiClient</b> — synapse-storage 24.48, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| api/components/endpoint.js | 7.36 |
| api/components/query-storage.js | 6.15 |
| api/utils/fetch-base-query.js | 3.36 |
| api/api.module.js | 2.39 |
| api/utils/cache.util.js | 1.47 |
| api/utils/file-utils.js | 1.29 |
| api/utils/create-header-context.js | 0.58 |
| api/utils/api-error.js | 0.51 |
| api/utils/endpoint-headers.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/utils/storage-key.js | 0.19 |
| _utils/error-handling.util.js | 0.18 |
| api/utils/api-helpers.js | 0.17 |
| api/types/api.interface.js | 0.13 |
| api/utils/get-cacheable-headers.js | 0.10 |

</details>

<details><summary><b>ApiClient + MemoryStorage</b> — synapse-storage 48.29, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| api/components/endpoint.js | 7.37 |
| api/components/query-storage.js | 6.16 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| api/utils/fetch-base-query.js | 3.37 |
| api/api.module.js | 2.39 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| api/utils/cache.util.js | 1.47 |
| api/utils/file-utils.js | 1.30 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| api/utils/create-header-context.js | 0.58 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| api/utils/api-error.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| api/utils/endpoint-headers.js | 0.31 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| _utils/error-handling.util.js | 0.18 |
| api/utils/api-helpers.js | 0.18 |
| core/storage/modules/singleton/models.js | 0.16 |
| api/types/api.interface.js | 0.13 |
| api/utils/get-cacheable-headers.js | 0.10 |

</details>

<details><summary><b>Dispatcher</b> — synapse-storage 10.02, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| reactive/dispatcher/dispatcher.base.js | 3.88 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| core/observable/interop-observable.js | 1.85 |
| _utils/logger-console.util.js | 0.28 |
| reactive/dispatcher/path.util.js | 0.20 |
| _utils/error-handling.util.js | 0.14 |
| reactive/dispatcher/standalone.js | 0.08 |

</details>

<details><summary><b>createSynapse + MemoryStorage + Selectors + Dispatcher (без эффектов, без rxjs)</b> — synapse-storage 47.39, (entry) 0.03</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| core/selector/selector.module.js | 6.61 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/observable/interop-observable.js | 1.86 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/error-handling.util.js | 0.31 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| core/observable/storage-stream.js | 0.10 |
| reactive/dispatcher/standalone.js | 0.08 |

</details>

<details><summary><b>createEventBus</b> — synapse-storage 41.59, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.88 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| utils/createEventBus.js | 2.69 |
| core/observable/interop-observable.js | 1.86 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| _utils/error-handling.util.js | 0.18 |
| core/storage/modules/singleton/models.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| core/observable/storage-stream.js | 0.10 |
| reactive/dispatcher/standalone.js | 0.08 |

</details>

<details><summary><b>Dispatcher + Effects + ofType/validateMap/mutationMap/fromRequest/apiResult</b> — rxjs 23.45, synapse-storage 16.53, tslib 3.90, (entry) 0.04</summary>

| файл dist | KB min |
|---|--:|
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| reactive/effects/effects.module.js | 3.19 |
| core/observable/interop-observable.js | 1.86 |
| reactive/effects/operators/request-map.js | 0.75 |
| reactive/effects/utils/toObservable.js | 0.59 |
| api/utils/api-error.js | 0.51 |
| reactive/effects/effects.base.js | 0.46 |
| _utils/logger-console.util.js | 0.28 |
| reactive/effects/operators/api-result.js | 0.20 |
| reactive/dispatcher/path.util.js | 0.20 |
| reactive/effects/operators/of-type.js | 0.17 |
| _utils/chunk.util.js | 0.17 |
| reactive/effects/utils/fromRequest.js | 0.16 |
| _utils/error-handling.util.js | 0.14 |
| reactive/effects/utils/chunkRequestConsistent.js | 0.09 |
| reactive/dispatcher/standalone.js | 0.08 |
| reactive/effects/effects.types.js | 0.07 |
| reactive/effects/utils/chunkRequestParallel.js | 0.07 |
| utils/createSynapse/effects-runner.js | 0.05 |

</details>

<details><summary><b>createSynapse + MemoryStorage + Selectors + Dispatcher + Effects + ofType</b> — synapse-storage 51.92, rxjs 20.48, tslib 3.90, (entry) 0.04</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.38 |
| core/selector/selector.module.js | 6.62 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| reactive/effects/effects.module.js | 3.19 |
| core/observable/interop-observable.js | 1.86 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.06 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| reactive/effects/utils/toObservable.js | 0.59 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| reactive/effects/effects.base.js | 0.46 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/error-handling.util.js | 0.32 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| reactive/effects/operators/of-type.js | 0.17 |
| core/storage/modules/singleton/models.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| core/observable/storage-stream.js | 0.10 |
| reactive/dispatcher/standalone.js | 0.08 |
| reactive/effects/effects.types.js | 0.07 |

</details>

<details><summary><b>…то же + ApiClient + validateMap/fromRequest/apiResult</b> — synapse-storage 77.29, rxjs 23.49, tslib 3.90, (entry) 0.05</summary>

| файл dist | KB min |
|---|--:|
| api/components/endpoint.js | 7.38 |
| core/storage/adapters/sync-base-storage.service.js | 7.38 |
| core/selector/selector.module.js | 6.62 |
| api/components/query-storage.js | 6.16 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.51 |
| api/utils/fetch-base-query.js | 3.38 |
| reactive/effects/effects.module.js | 3.19 |
| api/api.module.js | 2.40 |
| core/observable/interop-observable.js | 1.86 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| api/utils/cache.util.js | 1.47 |
| api/utils/file-utils.js | 1.30 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.06 |
| reactive/effects/operators/request-map.js | 0.76 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| reactive/effects/utils/toObservable.js | 0.59 |
| api/utils/create-header-context.js | 0.58 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| api/utils/api-error.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| reactive/effects/effects.base.js | 0.46 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| _utils/error-handling.util.js | 0.35 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| api/utils/endpoint-headers.js | 0.31 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/effects/operators/api-result.js | 0.20 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| api/utils/api-helpers.js | 0.18 |
| reactive/effects/operators/of-type.js | 0.17 |
| _utils/chunk.util.js | 0.17 |
| core/storage/modules/singleton/models.js | 0.17 |
| reactive/effects/utils/fromRequest.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| api/types/api.interface.js | 0.13 |
| core/observable/storage-stream.js | 0.10 |
| api/utils/get-cacheable-headers.js | 0.10 |
| reactive/effects/utils/chunkRequestConsistent.js | 0.09 |
| reactive/dispatcher/standalone.js | 0.08 |
| reactive/effects/effects.types.js | 0.07 |
| reactive/effects/utils/chunkRequestParallel.js | 0.07 |

</details>

<details><summary><b>MemoryStorage + useStorageSubscribe</b> — synapse-storage 24.83, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.36 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| react/hooks/useStorageSubscribe.js | 0.46 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| _utils/error-handling.util.js | 0.15 |

</details>

<details><summary><b>MemoryStorage + Selectors + useSelector</b> — synapse-storage 34.31, (entry) 0.03</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| core/selector/selector.module.js | 6.61 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/observable/interop-observable.js | 0.97 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| react/hooks/useSelector.js | 0.45 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| _utils/error-handling.util.js | 0.31 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |

</details>

<details><summary><b>ApiClient + MemoryStorage + useApiQuery/useApiMutation</b> — synapse-storage 50.38, (entry) 0.03</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| api/components/endpoint.js | 7.37 |
| api/components/query-storage.js | 6.16 |
| core/storage/adapters/storage-core.js | 4.02 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| api/utils/fetch-base-query.js | 3.37 |
| api/api.module.js | 2.39 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| api/utils/cache.util.js | 1.47 |
| api/utils/file-utils.js | 1.30 |
| react/hooks/useApiQuery.js | 1.29 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| react/hooks/useApiMutation.js | 0.80 |
| core/storage/utils/hydration-meta.util.js | 0.63 |
| api/utils/create-header-context.js | 0.58 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| api/utils/api-error.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| api/utils/endpoint-headers.js | 0.31 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| core/storage/utils/migration.util.js | 0.22 |
| core/storage/utils/storage-key.js | 0.19 |
| _utils/error-handling.util.js | 0.18 |
| api/utils/api-helpers.js | 0.18 |
| core/storage/modules/singleton/models.js | 0.16 |
| api/types/api.interface.js | 0.13 |
| api/utils/get-cacheable-headers.js | 0.10 |

</details>

<details><summary><b>createSynapse-модуль без эффектов + createSynapseCtx + useSelector (без rxjs)</b> — synapse-storage 50.56, (entry) 0.04</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| core/selector/selector.module.js | 6.61 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| react/utils/createSynapseCtx.js | 2.42 |
| core/observable/interop-observable.js | 1.86 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| core/storage/utils/hydration-meta.util.js | 0.66 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| react/hooks/useSelector.js | 0.45 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| _utils/error-handling.util.js | 0.35 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| utils/dehydrateModule.js | 0.22 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| core/observable/storage-stream.js | 0.10 |
| reactive/dispatcher/standalone.js | 0.08 |

</details>

<details><summary><b>createSynapse-модуль с эффектами + createSynapseCtx</b> — synapse-storage 54.64, rxjs 20.48, tslib 3.90, (entry) 0.04</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.38 |
| core/selector/selector.module.js | 6.62 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| reactive/effects/effects.module.js | 3.19 |
| react/utils/createSynapseCtx.js | 2.44 |
| core/observable/interop-observable.js | 1.86 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.06 |
| core/storage/utils/hydration-meta.util.js | 0.66 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| reactive/effects/utils/toObservable.js | 0.59 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| reactive/effects/effects.base.js | 0.46 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| _utils/error-handling.util.js | 0.35 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| utils/dehydrateModule.js | 0.22 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| reactive/effects/operators/of-type.js | 0.17 |
| core/storage/modules/singleton/models.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| core/observable/storage-stream.js | 0.10 |
| reactive/dispatcher/standalone.js | 0.08 |
| reactive/effects/effects.types.js | 0.07 |

</details>

<details><summary><b>Приложение без rxjs: модуль + Ctx + ApiClient + хуки + LocalStorage</b> — synapse-storage 78.59, (entry) 0.05</summary>

| файл dist | KB min |
|---|--:|
| api/components/endpoint.js | 7.38 |
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| core/selector/selector.module.js | 6.62 |
| api/components/query-storage.js | 6.16 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| api/utils/fetch-base-query.js | 3.37 |
| react/utils/createSynapseCtx.js | 2.42 |
| api/api.module.js | 2.40 |
| core/storage/adapters/local-storage.service.js | 2.07 |
| core/observable/interop-observable.js | 1.86 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.49 |
| api/utils/cache.util.js | 1.47 |
| api/utils/file-utils.js | 1.30 |
| react/hooks/useApiQuery.js | 1.29 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.05 |
| react/hooks/useApiMutation.js | 0.80 |
| core/storage/utils/hydration-meta.util.js | 0.66 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| api/utils/create-header-context.js | 0.58 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| api/utils/api-error.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| react/hooks/useSelector.js | 0.45 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| _utils/error-handling.util.js | 0.35 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| api/utils/endpoint-headers.js | 0.31 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| utils/dehydrateModule.js | 0.22 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| api/utils/api-helpers.js | 0.18 |
| core/storage/modules/singleton/models.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| api/types/api.interface.js | 0.13 |
| core/observable/storage-stream.js | 0.10 |
| api/utils/get-cacheable-headers.js | 0.10 |
| reactive/dispatcher/standalone.js | 0.08 |

</details>

<details><summary><b>Типичное приложение: модуль + эффекты + Ctx + ApiClient + хуки + LocalStorage</b> — synapse-storage 84.85, rxjs 23.49, tslib 3.90, (entry) 0.07</summary>

| файл dist | KB min |
|---|--:|
| core/storage/adapters/sync-base-storage.service.js | 7.38 |
| api/components/endpoint.js | 7.38 |
| core/selector/selector.module.js | 6.63 |
| api/components/query-storage.js | 6.16 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.51 |
| api/utils/fetch-base-query.js | 3.37 |
| reactive/effects/effects.module.js | 3.19 |
| react/utils/createSynapseCtx.js | 2.43 |
| api/api.module.js | 2.40 |
| core/storage/adapters/local-storage.service.js | 2.07 |
| core/observable/interop-observable.js | 1.86 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/middleware-module.js | 1.66 |
| core/storage/utils/state-diff.util.js | 1.50 |
| api/utils/cache.util.js | 1.47 |
| api/utils/file-utils.js | 1.30 |
| react/hooks/useApiQuery.js | 1.29 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/adapters/path.utils.js | 1.06 |
| react/hooks/useApiMutation.js | 0.80 |
| reactive/effects/operators/request-map.js | 0.76 |
| core/storage/utils/hydration-meta.util.js | 0.66 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| reactive/effects/utils/toObservable.js | 0.59 |
| api/utils/create-header-context.js | 0.58 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| api/utils/api-error.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| reactive/effects/effects.base.js | 0.46 |
| react/hooks/useSelector.js | 0.45 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| _utils/error-handling.util.js | 0.35 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| api/utils/endpoint-headers.js | 0.31 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| react/hooks/useObservable.js | 0.25 |
| utils/dehydrateModule.js | 0.22 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/effects/operators/api-result.js | 0.20 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| api/utils/api-helpers.js | 0.18 |
| reactive/effects/operators/of-type.js | 0.17 |
| _utils/chunk.util.js | 0.17 |
| core/storage/modules/singleton/models.js | 0.17 |
| reactive/effects/utils/fromRequest.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| api/types/api.interface.js | 0.13 |
| core/observable/storage-stream.js | 0.10 |
| api/utils/get-cacheable-headers.js | 0.10 |
| reactive/effects/utils/chunkRequestConsistent.js | 0.09 |
| reactive/dispatcher/standalone.js | 0.08 |
| reactive/effects/effects.types.js | 0.07 |
| reactive/effects/utils/chunkRequestParallel.js | 0.07 |

</details>

<details><summary><b>Весь корень (import * from synapse-storage) — без react/rxjs</b> — synapse-storage 129.66, (entry) 0.02</summary>

| файл dist | KB min |
|---|--:|
| core/storage/utils/worker-channel.util.js | 14.99 |
| core/storage/adapters/indexed-DB.service.js | 9.93 |
| core/storage/adapters/async-base-storage.service.js | 7.85 |
| api/components/endpoint.js | 7.38 |
| core/storage/adapters/sync-base-storage.service.js | 7.37 |
| core/selector/selector.module.js | 6.62 |
| api/components/query-storage.js | 6.16 |
| core/storage/middlewares/shared-state.factory.js | 4.77 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| core/storage/adapters/worker-storage.service.js | 3.72 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.50 |
| api/utils/fetch-base-query.js | 3.37 |
| core/storage/utils/middleware-module.js | 3.34 |
| reactive/dispatcher/middlewares/logger.middleware.js | 2.85 |
| utils/createEventBus.js | 2.70 |
| api/api.module.js | 2.40 |
| core/storage/adapters/local-storage.service.js | 2.07 |
| core/observable/interop-observable.js | 1.86 |
| core/storage/utils/broadcast.util.js | 1.82 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/state-diff.util.js | 1.49 |
| api/utils/cache.util.js | 1.47 |
| api/utils/file-utils.js | 1.30 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/middlewares/storage-batching.middleware.js | 1.16 |
| utils/createSynapseAwaiter.js | 1.09 |
| core/storage/adapters/path.utils.js | 1.05 |
| index.js | 0.81 |
| core/storage/adapters/worker-backends/shared-worker-backend.js | 0.75 |
| core/storage/utils/hydration-meta.util.js | 0.66 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| api/utils/create-header-context.js | 0.58 |
| core/storage/middlewares/storage-logger.middleware.js | 0.53 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| api/utils/api-error.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| core/storage/utils/storage-factory.util.js | 0.41 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| api/utils/api-helpers.js | 0.37 |
| _utils/error-handling.util.js | 0.35 |
| core/storage/middlewares/storage-shallow-compare.middleware.js | 0.32 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| api/utils/endpoint-headers.js | 0.31 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| _utils/logger-console.util.js | 0.28 |
| core/storage/storage.interface.js | 0.26 |
| utils/dehydrateModule.js | 0.22 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| core/storage/modules/singleton/models.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| api/types/api.interface.js | 0.13 |
| core/observable/storage-stream.js | 0.10 |
| api/utils/get-cacheable-headers.js | 0.10 |
| core/storage/middlewares/sync-shared-worker.middleware.js | 0.10 |
| core/storage/browser-storage.util.js | 0.09 |
| core/storage/middlewares/sync-broadcast.middleware.js | 0.09 |
| core/storage/middlewares/shared-worker.middleware.js | 0.09 |
| core/storage/middlewares/broadcast.middleware.js | 0.08 |
| reactive/dispatcher/standalone.js | 0.08 |

</details>

<details><summary><b>Всё: корень + /react + /reactive</b> — synapse-storage 146.35, rxjs 24.25, tslib 3.91, (entry) 0.03</summary>

| файл dist | KB min |
|---|--:|
| core/storage/utils/worker-channel.util.js | 14.99 |
| core/storage/adapters/indexed-DB.service.js | 9.94 |
| core/storage/adapters/async-base-storage.service.js | 7.86 |
| api/components/endpoint.js | 7.38 |
| core/storage/adapters/sync-base-storage.service.js | 7.38 |
| core/selector/selector.module.js | 6.63 |
| api/components/query-storage.js | 6.16 |
| core/storage/middlewares/shared-state.factory.js | 4.77 |
| core/storage/adapters/storage-core.js | 4.02 |
| reactive/dispatcher/dispatcher.base.js | 3.89 |
| core/storage/adapters/worker-storage.service.js | 3.72 |
| reactive/dispatcher/dispatcher.module.js | 3.59 |
| utils/createSynapse/syncModule.js | 3.52 |
| core/storage/modules/singleton/singleton.util.js | 3.51 |
| reactive/effects/effects.module.js | 3.39 |
| api/utils/fetch-base-query.js | 3.37 |
| core/storage/utils/middleware-module.js | 3.34 |
| reactive/dispatcher/middlewares/logger.middleware.js | 2.85 |
| utils/createEventBus.js | 2.70 |
| react/utils/createSynapseCtx.js | 2.43 |
| api/api.module.js | 2.40 |
| core/storage/adapters/local-storage.service.js | 2.07 |
| core/observable/interop-observable.js | 1.86 |
| core/storage/utils/broadcast.util.js | 1.82 |
| core/selector/selectors.base.js | 1.72 |
| core/storage/utils/state-diff.util.js | 1.50 |
| api/utils/cache.util.js | 1.47 |
| api/utils/file-utils.js | 1.30 |
| react/utils/awaitSynapse.js | 1.30 |
| react/hooks/useApiQuery.js | 1.29 |
| core/storage/adapters/memory-storage.service.js | 1.19 |
| core/storage/middlewares/storage-batching.middleware.js | 1.16 |
| react/hooks/useCreateStorage.js | 1.12 |
| utils/createSynapseAwaiter.js | 1.09 |
| core/storage/adapters/path.utils.js | 1.05 |
| index.js | 0.81 |
| react/hooks/useApiMutation.js | 0.80 |
| reactive/effects/operators/request-map.js | 0.76 |
| core/storage/adapters/worker-backends/shared-worker-backend.js | 0.75 |
| reactive/effects/operators/of-type.js | 0.69 |
| core/storage/utils/hydration-meta.util.js | 0.66 |
| utils/createSynapse/waitForDependencies.js | 0.63 |
| reactive/effects/utils/toObservable.js | 0.59 |
| api/utils/create-header-context.js | 0.58 |
| core/storage/middlewares/storage-logger.middleware.js | 0.53 |
| react/hooks/useSelector.js | 0.52 |
| core/storage/middlewares/sync-storage-logger.middleware.js | 0.51 |
| api/utils/api-error.js | 0.51 |
| core/storage/utils/path-selector.util.js | 0.51 |
| core/storage/middlewares/sync-storage-batching.middleware.js | 0.50 |
| react/hooks/useStorage.js | 0.48 |
| reactive/index.js | 0.48 |
| react/hooks/useStorageSubscribe.js | 0.47 |
| reactive/effects/effects.base.js | 0.46 |
| core/storage/utils/storage-factory.util.js | 0.41 |
| core/storage/modules/singleton/mixin.util.js | 0.39 |
| api/utils/api-helpers.js | 0.37 |
| _utils/error-handling.util.js | 0.35 |
| core/storage/middlewares/storage-shallow-compare.middleware.js | 0.32 |
| core/storage/middlewares/sync-storage-shallow-compare.middleware.js | 0.32 |
| api/utils/endpoint-headers.js | 0.31 |
| reactive/effects/preStartActionBuffer.js | 0.30 |
| react/index.js | 0.29 |
| _utils/logger-console.util.js | 0.28 |
| react/hooks/useStorageObservable.js | 0.27 |
| core/storage/storage.interface.js | 0.26 |
| react/hooks/useObservable.js | 0.25 |
| utils/dehydrateModule.js | 0.22 |
| core/storage/utils/migration.util.js | 0.22 |
| reactive/effects/operators/api-result.js | 0.20 |
| reactive/dispatcher/path.util.js | 0.20 |
| core/storage/utils/storage-key.js | 0.19 |
| _utils/chunk.util.js | 0.17 |
| core/storage/modules/singleton/models.js | 0.17 |
| reactive/effects/utils/fromRequest.js | 0.16 |
| utils/createSynapse/createSynapse.js | 0.16 |
| utils/createSynapse/effects-runner.js | 0.15 |
| reactive/effects/operators/selectors.js | 0.15 |
| api/types/api.interface.js | 0.13 |
| core/observable/storage-stream.js | 0.10 |
| api/utils/get-cacheable-headers.js | 0.10 |
| core/storage/middlewares/sync-shared-worker.middleware.js | 0.10 |
| react/hooks/useSubscription.js | 0.10 |
| reactive/effects/utils/chunkRequestConsistent.js | 0.09 |
| core/storage/browser-storage.util.js | 0.09 |
| core/storage/middlewares/sync-broadcast.middleware.js | 0.09 |
| core/storage/middlewares/shared-worker.middleware.js | 0.09 |
| core/storage/middlewares/broadcast.middleware.js | 0.08 |
| reactive/dispatcher/standalone.js | 0.08 |
| reactive/effects/effects.types.js | 0.07 |
| reactive/effects/utils/chunkRequestParallel.js | 0.07 |

</details>

## Версии

@babel/runtime@7.29.7, @esbuild/darwin-arm64@0.28.2, @jridgewell/gen-mapping@0.3.13, @jridgewell/resolve-uri@3.1.2, @jridgewell/source-map@0.3.11, @jridgewell/sourcemap-codec@1.6.0, @jridgewell/trace-mapping@0.3.31, @oxc-project/types@0.152.0, @redux-saga/core@1.5.1, @redux-saga/deferred@1.3.1, @redux-saga/delay-p@1.3.1, @redux-saga/is@1.2.1, @redux-saga/symbols@1.2.1, @redux-saga/types@1.4.1, @reduxjs/toolkit@2.13.0, @rolldown/binding-darwin-arm64@1.2.12, @rolldown/pluginutils@1.0.1, @rollup/plugin-commonjs@29.0.3, @rollup/plugin-node-resolve@16.0.3, @rollup/plugin-replace@6.0.3, @rollup/plugin-terser@1.0.0, @rollup/pluginutils@5.4.0, @rollup/rollup-darwin-arm64@4.64.0, @standard-schema/spec@1.1.0, @standard-schema/utils@0.3.0, @tanstack/query-core@5.104.1, @tanstack/react-query@5.104.1, @types/estree@1.0.9, @types/json-schema@7.0.15, @types/node@26.6.4, @types/resolve@1.20.2, @types/use-sync-external-store@0.0.6, @webassemblyjs/ast@1.14.1, @webassemblyjs/floating-point-hex-parser@1.13.2, @webassemblyjs/helper-api-error@1.13.2, @webassemblyjs/helper-buffer@1.14.1, @webassemblyjs/helper-numbers@1.13.2, @webassemblyjs/helper-wasm-bytecode@1.13.2, @webassemblyjs/helper-wasm-section@1.14.1, @webassemblyjs/ieee754@1.13.2, @webassemblyjs/leb128@1.13.2, @webassemblyjs/utf8@1.13.2, @webassemblyjs/wasm-edit@1.14.1, @webassemblyjs/wasm-gen@1.14.1, @webassemblyjs/wasm-opt@1.14.1, @webassemblyjs/wasm-parser@1.14.1, @webassemblyjs/wast-printer@1.14.1, @xtuc/ieee754@1.2.0, @xtuc/long@4.2.2, acorn@8.18.0, agent-base@6.0.2, ajv@8.20.0, ajv-formats@3.0.1, ajv-keywords@5.1.0, asynckit@0.4.0, axios@1.20.0, baseline-browser-mapping@2.11.27, browserslist@4.29.3, buffer-from@1.1.2, call-bind-apply-helpers@1.0.2, caniuse-lite@1.0.30001814, chrome-trace-event@1.0.4, combined-stream@1.0.8, commander@2.20.3, commondir@1.0.1, debug@4.4.3, deepmerge@4.3.1, delayed-stream@1.0.0, dequal@2.0.3, dunder-proto@1.0.1, effector@23.4.4, effector-react@23.3.0, electron-to-chromium@1.5.444, enhanced-resolve@5.26.0, es-define-property@1.0.1, es-errors@1.3.0, es-module-lexer@2.3.2, es-object-atoms@1.1.2, es-set-tostringtag@2.1.0, esbuild@0.28.2, escalade@3.2.0, estree-walker@2.0.2, events@3.3.0, fast-deep-equal@3.1.3, fast-uri@3.1.8, fdir@6.5.0, follow-redirects@1.16.1, form-data@4.0.6, fsevents@2.3.3, function-bind@1.1.2, get-intrinsic@1.3.0, get-proto@1.0.1, gopd@1.2.0, graceful-fs@4.2.11, has-flag@4.0.0, has-symbols@1.1.0, has-tostringtag@1.0.2, hasown@2.0.4, https-proxy-agent@5.0.1, immer@11.1.21, is-core-module@2.17.0, is-module@1.0.0, is-reference@1.2.1, jest-worker@27.5.1, jotai@3.0.1, json-schema-traverse@1.0.0, ky@2.1.0, magic-string@0.30.21, math-intrinsics@1.1.0, merge-stream@2.0.0, mime-db@1.52.0, mime-types@2.1.35, minimizer-webpack-plugin@5.13.0, mobx@7.0.6, mobx-react-lite@5.1.0, ms@2.1.3, node-releases@2.0.57, path-parse@1.0.7, picocolors@1.1.1, picomatch@4.0.7, proxy-compare@3.0.1, proxy-from-env@2.1.0, react@19.3.0, react-dom@19.3.0, react-redux@9.3.0, redux@5.0.1, redux-observable@3.0.0-rc.3, redux-persist@6.0.0, redux-saga@1.5.1, redux-thunk@3.1.0, require-from-string@2.0.2, reselect@5.3.0, resolve@1.22.12, rolldown@1.2.12, rollup@4.64.0, rxjs@7.8.2, scheduler@0.28.0, schema-utils@4.5.0, serialize-javascript@7.1.2, smob@1.6.2, source-map@0.6.1, source-map-support@0.5.21, supports-color@8.1.1, supports-preserve-symlinks-flag@1.0.0, swr@2.5.1, tapable@2.3.3, terser@5.51.2, terser-webpack-plugin@5.6.1, tslib@2.8.1, undici-types@8.9.0, update-browserslist-db@1.3.3, use-sync-external-store@1.7.0, valtio@2.3.2, watchpack@2.5.2, webpack@5.111.1, webpack-sources@3.6.0, zustand@5.0.15
