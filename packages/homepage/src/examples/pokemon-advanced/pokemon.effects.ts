import { from, withLatestFrom } from 'rxjs'
import { ofType, combineEffects, selectorObject, selectorMap, validateMap, apiResult } from 'synapse-storage/reactive'
import type { Effect } from 'synapse-storage/reactive'
import type { PokemonState } from './pokemon.types'
import type { PokemonDispatcher } from './pokemon.dispatcher'
import { type pokemonApiClient, mapListResponse, mapDetailsResponse } from './pokemon.api'

// ─── Типы для эффектов (определяем один раз) ────────────────────────────────

type Dispatchers = { pokemonDispatcher: PokemonDispatcher }
type Services = { pokemonApi: typeof pokemonApiClient }

/** Общий тип эффекта — параметры типизированы автоматически */
type PokemonEffect = Effect<PokemonState, Dispatchers, Services>

// ─── Effect 1: Загрузка списка ──────────────────────────────────────────────
// Поток: loadList (idle) → validateMap → loadListLoading → API → success/failure
// Валидация: не загружаем если уже идёт загрузка

const loadListEffect: PokemonEffect = (action$, state$, _ext, { pokemonDispatcher }, { pokemonApi: api }) =>
  action$.pipe(
    ofType(pokemonDispatcher.dispatch.loadList),
    withLatestFrom(
      selectorObject(state$, {
        listStatus: (s) => s.api.listRequest.status,
      }),
    ),
    validateMap({
      validator: ([_action, { listStatus }]) => ({
        conditions: [listStatus !== 'loading'],
        skipAction: () => pokemonDispatcher.dispatch.loadListReset(),
      }),
      loadingAction: () => {
        pokemonDispatcher.dispatch.loadListLoading()
      },
      errorAction: (err) => {
        pokemonDispatcher.dispatch.loadListFailure(String(err))
      },
      apiCall: () =>
        from(api.request('getList', { limit: 12, offset: 0 })).pipe(
          apiResult((data) => pokemonDispatcher.dispatch.loadListSuccess({ ...mapListResponse(data), append: false })),
        ),
    }),
  )

// ─── Effect 2: Подгрузка следующей страницы ─────────────────────────────────
// selectorObject — именованный объект для withLatestFrom

const loadMoreEffect: PokemonEffect = (action$, state$, _ext, { pokemonDispatcher }, { pokemonApi: api }) =>
  action$.pipe(
    ofType(pokemonDispatcher.dispatch.loadMore),
    withLatestFrom(
      selectorObject(state$, {
        offset: (s) => s.offset,
        hasMore: (s) => s.hasMore,
        listStatus: (s) => s.api.listRequest.status,
      }),
    ),
    validateMap({
      validator: ([_action, { hasMore, listStatus }]) => ({
        conditions: [hasMore, listStatus !== 'loading'],
        skipAction: () => pokemonDispatcher.dispatch.loadListReset(),
      }),
      loadingAction: () => {
        pokemonDispatcher.dispatch.loadListLoading()
      },
      errorAction: (err) => {
        pokemonDispatcher.dispatch.loadListFailure(String(err))
      },
      apiCall: ([_action, { offset }]) =>
        from(api.request('getList', { limit: 12, offset })).pipe(
          apiResult((data) => pokemonDispatcher.dispatch.loadListSuccess({ ...mapListResponse(data), append: true })),
        ),
    }),
  )

// ─── Effect 3: Загрузка деталей (apiResult) ────────────────────────────────
// selectorMap — позиционный массив (компактнее для 1-2 полей)

const loadDetailsEffect: PokemonEffect = (action$, state$, _ext, { pokemonDispatcher }, { pokemonApi: api }) =>
  action$.pipe(
    ofType(pokemonDispatcher.dispatch.selectPokemon),
    withLatestFrom(
      selectorMap(state$, (s) => s.selectedPokemonId, (s) => s.api.detailsRequest.status),
    ),
    validateMap({
      validator: ([_action, [selectedId, detailsStatus]]) => ({
        conditions: [selectedId !== null, detailsStatus !== 'loading'],
        skipAction: () => pokemonDispatcher.dispatch.loadDetailsReset(),
      }),
      loadingAction: () => {
        pokemonDispatcher.dispatch.loadDetailsLoading()
      },
      errorAction: (err, pipeData) => {
        pokemonDispatcher.dispatch.loadDetailsFailure(String(err))
      },
      apiCall: ([_action, [selectedId]]) =>
        from(api.request('getDetails', { id: selectedId! })).pipe(
          apiResult((data) => pokemonDispatcher.dispatch.loadDetailsSuccess(mapDetailsResponse(data))),
        ),
    }),
  )

// ─── Effect 4: Загрузка деталей (waitWithCallbacks) ─────────────────────────
// Альтернативный подход: endpoint.request().waitWithCallbacks()
// Lifecycle управляется самим request'ом через колбэки,
// не нужно вручную вызывать loadDetailsLoading перед запросом.

const loadDetailsWaitEffect: PokemonEffect = (action$, state$, _ext, { pokemonDispatcher }, { pokemonApi: api }) =>
  action$.pipe(
    ofType(pokemonDispatcher.dispatch.selectPokemon),
    withLatestFrom(
      selectorMap(state$, (s) => s.selectedPokemonId, (s) => s.api.detailsRequest.status),
    ),
    validateMap({
      validator: ([_action, [selectedId, detailsStatus]]) => ({
        conditions: [selectedId !== null, detailsStatus !== 'loading'],
        skipAction: () => pokemonDispatcher.dispatch.loadDetailsReset(),
      }),
      apiCall: ([_action, [selectedId]]) => {
        const endpoints = api.getEndpoints()
        return from(
          endpoints.getDetails.request({ id: selectedId! }).waitWithCallbacks({
            loading: () => {
              pokemonDispatcher.dispatch.loadDetailsLoading()
            },
            success: (data) => {
              if (data) {
                pokemonDispatcher.dispatch.loadDetailsSuccess(mapDetailsResponse(data))
              }
            },
            error: (error) => {
              pokemonDispatcher.dispatch.loadDetailsFailure(String(error))
            },
          }),
        )
      },
    }),
  )

// ─── Сравнение подходов к API-вызовам ───────────────────────────────────────
//
// validateMap + apiResult (Effects 1-3):
//   validateMap({
//     validator:     — нужен ли запрос?
//     loadingAction: — dispatch loading
//     errorAction:   — dispatch error (ловит throw из apiResult и catchError)
//     apiCall:       — apiResult((data) => dispatch.success(data))
//   })
//   ✅ Чистое разделение: validator / loading / error / success
//   ✅ apiResult — просто маппер data → dispatch, без обработки ошибок
//   ✅ Ошибки централизованы в errorAction
//
// waitWithCallbacks (Effect 4):
//   endpoint.request().waitWithCallbacks({ loading, success, error })
//   ✅ Декларативный — колбэки привязаны к lifecycle запроса
//   ✅ loading вызывается самим request'ом
//   ❌ Нужен endpoint напрямую (api.getEndpoints())
//
// ─── 5 состояний запроса ────────────────────────────────────────────────────
//
// UI dispatch (loadList)  →  status = 'idle'   (UI не меняется)
//       │
//   effect: validateMap
//       ├─ validation OK   →  loadingAction     →  status = 'loading' (спиннер)
//       │       ├─ API OK  →  apiResult(success) → status = 'success' (данные)
//       │       └─ API ERR →  errorAction        → status = 'error'   (ошибка)
//       └─ validation FAIL →  skipAction         → status = 'reset'   (без UI-мерцания)
//

// Effect 4 (waitWithCallbacks) — альтернативный пример, не включён в основной набор
export const pokemonEffects = combineEffects(loadListEffect, loadMoreEffect, loadDetailsEffect)
