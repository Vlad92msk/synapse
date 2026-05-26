import { Observable, from, withLatestFrom } from 'rxjs'
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
      apiCall: () =>
        from(api.request('getList', { limit: 12, offset: 0 })).pipe(
          apiResult({
            success: (data) => pokemonDispatcher.dispatch.loadListSuccess({ ...mapListResponse(data), append: false }),
            error: (err) => pokemonDispatcher.dispatch.loadListFailure(String(err)),
          }),
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
      apiCall: ([_action, { offset }]) =>
        from(api.request('getList', { limit: 12, offset })).pipe(
          apiResult({
            success: (data, meta) => pokemonDispatcher.dispatch.loadListSuccess({ ...mapListResponse(data), append: true }),
            error: (err) => pokemonDispatcher.dispatch.loadListFailure(String(err)),
          }),
        ),
    }),
  )

// ─── Effect 3: Загрузка деталей (apiResult) ────────────────────────────────
// selectorMap — позиционный массив (компактнее для 1-2 полей)
// Подход: ручной dispatch loadDetailsLoading + apiResult для success/error

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
      loadingAction: ([_action, [selectedId, detailsStatus]]) => {
        pokemonDispatcher.dispatch.loadDetailsLoading()
      },
      apiCall: ([_action, [selectedId]]) =>
        from(api.request('getDetails', { id: selectedId! })).pipe(
          apiResult({
            success: (data) => pokemonDispatcher.dispatch.loadDetailsSuccess(mapDetailsResponse(data)),
            error: (err) => pokemonDispatcher.dispatch.loadDetailsFailure(String(err)),
          }),
        ),
    }),
  )

// ─── Effect 4: Загрузка деталей (waitWithCallbacks) ─────────────────────────
// Альтернативный подход: endpoint.request().waitWithCallbacks()
// Lifecycle управляется самим request'ом через колбэки,
// не нужно вручную вызывать loadDetailsLoading перед запросом.
//
// apiResult:          мы сами вызываем loading → потом success/error
// waitWithCallbacks:  request сам вызывает loading → success/error через колбэки

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
            loading: async () => {
              await pokemonDispatcher.dispatch.loadDetailsLoading()
            },
            success: async (data) => {
              if (data) {
                await pokemonDispatcher.dispatch.loadDetailsSuccess(mapDetailsResponse(data))
              }
            },
            error: async (error) => {
              await pokemonDispatcher.dispatch.loadDetailsFailure(String(error))
            },
          }),
        )
      },
    }),
  )

// ─── Сравнение подходов к API-вызовам ───────────────────────────────────────
//
// apiResult (Effects 1-3):
//   pokemonDispatcher.dispatch.loadDetailsLoading()       ← мы сами ставим loading
//   from(api.request('getDetails', { id })).pipe(
//     apiResult({
//       success: (data) => dispatch.success(data),        ← обработка result.ok
//       error: (err) => dispatch.failure(err),            ← + catchError внутри
//     }),
//   )
//   ✅ Работает с api.request() (shortcut, Promise<QueryResult>)
//   ✅ Компактный, убирает бойлерплейт if/else + catchError
//   ✅ Мы контролируем момент loading
//
// waitWithCallbacks (Effect 4):
//   endpoints.getDetails.request({ id }).waitWithCallbacks({
//     loading:  () => dispatch.loading(),                 ← request сам вызывает
//     success:  (data) => dispatch.success(data),         ← при смене статуса
//     error:    (err) => dispatch.failure(err),
//   })
//   ✅ Декларативный — колбэки привязаны к lifecycle запроса
//   ✅ loading вызывается самим request'ом (не нужно вручную)
//   ✅ Автоматическая отписка (autoUnsubscribe: true)
//   ✅ Доступ к полному RequestState (status, data, error, params)
//   ❌ Нужен endpoint напрямую (api.getEndpoints())
//
// Оба подхода императивны внутри реактивного потока — мы вызываем
// dispatch.loading/success/failure в обоих случаях. Разница в том,
// кто управляет моментом вызова: мы или request lifecycle.
//
// ─── Утилиты для withLatestFrom ─────────────────────────────────────────────
//
// selectorObject(state$, { offset: s => s.offset, hasMore: s => s.hasMore })
//   → Observable<{ offset: number, hasMore: boolean }>
//   Лучше для 3+ полей — именованные ключи, самодокументируется
//
// selectorMap(state$, s => s.offset, s => s.hasMore)
//   → Observable<[number, boolean]>
//   Компактнее для 1-2 полей, позиционный доступ
//
// ─── 5 состояний запроса ────────────────────────────────────────────────────
//
// UI dispatch (loadList)  →  status = 'idle'   (UI не меняется)
//       │
//   effect: validateMap
//       ├─ validation OK   →  loadListLoading   →  status = 'loading' (спиннер)
//       │       ├─ API OK  →  loadListSuccess   →  status = 'success' (данные)
//       │       └─ API ERR →  loadListFailure   →  status = 'error'   (ошибка)
//       └─ validation FAIL →  loadListReset     →  status = 'reset'   (без UI-мерцания)
//

// Effect 4 (waitWithCallbacks) — альтернативный пример, не включён в основной набор
export const pokemonEffects = combineEffects(loadListEffect, loadMoreEffect, loadDetailsEffect)
