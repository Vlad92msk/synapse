import { Observable, withLatestFrom } from 'rxjs'
import { Effects, apiResult, fromRequest, ofType, selectorMap, selectorObject, validateMap } from 'synapse-storage/reactive'

import { mapDetailsResponse, mapListResponse, type PokemonApiEndpoints } from './pokemon.api'
import type { PokemonSettings } from './pokemon.settings'
import type { PokemonState } from './pokemon.types'
import type { PokemonDispatcher } from './pokemon.dispatcher'

/**
 * Эффекты домена — side-effects по экшенам. Сервисы (API-endpoints) и внешние сторы
 * (`settings$`) приходят через конструктор и захватываются в замыкание рецепта.
 */
export class PokemonEffects extends Effects<PokemonState, PokemonDispatcher> {
  constructor(
    private readonly api: PokemonApiEndpoints,
    private readonly settings$: Observable<PokemonSettings>,
  ) {
    super()
  }

  /** loadList (init/idle) → validateMap → loading → API → success/failure. */
  readonly loadList = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadList),
      withLatestFrom(selectorObject(state$, { listStatus: (s) => s.api.listRequest.status }), this.settings$),
      validateMap({
        validator: ([, { listStatus }]) => ({
          conditions: [listStatus !== 'loading'],
          skipAction: () => d.loadList.reset(),
        }),
        loadingAction: () => d.loadList.loading(),
        errorAction: (err) => d.loadList.failure(String(err)),
        apiCall: ([, , { pageSize }]) =>
          fromRequest(this.api.getList.request({ limit: pageSize, offset: 0 })).pipe(
            apiResult((data) => {
              d.applyPokemonList({ ...mapListResponse(data), append: false })
              d.loadList.success()
            }),
          ),
      }),
    ),
  )

  /** loadMore → подгрузка следующей страницы (статус через loadList.*). */
  readonly loadMore = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.loadMore),
      withLatestFrom(
        selectorObject(state$, {
          offset: (s) => s.offset,
          hasMore: (s) => s.hasMore,
          listStatus: (s) => s.api.listRequest.status,
        }),
        this.settings$,
      ),
      validateMap({
        validator: ([, { hasMore, listStatus }]) => ({
          conditions: [hasMore, listStatus !== 'loading'],
          skipAction: () => d.loadList.reset(),
        }),
        loadingAction: () => d.loadList.loading(),
        errorAction: (err) => d.loadList.failure(String(err)),
        apiCall: ([, { offset }, { pageSize }]) =>
          fromRequest(this.api.getList.request({ limit: pageSize, offset })).pipe(
            apiResult((data) => {
              d.applyPokemonList({ ...mapListResponse(data), append: true })
              d.loadList.success()
            }),
          ),
      }),
    ),
  )

  /** selectPokemon → загрузка деталей выбранного покемона. */
  readonly loadDetails = this.effect((action$, state$, { dispatcher: d }) =>
    action$.pipe(
      ofType(d.selectPokemon),
      withLatestFrom(selectorMap(state$, (s) => s.selectedPokemonId, (s) => s.api.detailsRequest.status)),
      validateMap({
        validator: ([, [selectedId, detailsStatus]]) => ({
          conditions: [selectedId !== null, detailsStatus !== 'loading'],
          skipAction: () => d.loadDetails.reset(),
        }),
        loadingAction: () => d.loadDetails.loading(),
        errorAction: (err) => d.loadDetails.failure(String(err)),
        apiCall: ([, [selectedId]]) =>
          fromRequest(this.api.getDetails.request({ id: selectedId! })).pipe(
            apiResult((data) => {
              d.applyPokemonDetails(mapDetailsResponse(data))
              d.loadDetails.success()
            }),
          ),
      }),
    ),
  )
}
