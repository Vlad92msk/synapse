import { Observable, from, switchMap, tap, EMPTY, withLatestFrom } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { createEffect, ofType, combineEffects, selectorObject } from 'synapse-storage/reactive'
import type { PokemonState } from './pokemon.types'
import type { PokemonDispatcher } from './pokemon.dispatcher'
import { type pokemonApiClient, mapListResponse, mapDetailsResponse } from './pokemon.api'

type Dispatchers = { pokemonDispatcher: PokemonDispatcher }
type Services = { pokemonApi: typeof pokemonApiClient }

// Effect 1: Загрузка начального списка
const loadListEffect = createEffect(
  (action$: Observable<any>, _state$: Observable<PokemonState>, _ext: any, { pokemonDispatcher }: Dispatchers, { pokemonApi: api }: Services) =>
    action$.pipe(
      ofType(pokemonDispatcher.dispatch.loadList),
      switchMap(() =>
        from(api.request('getList', { limit: 12, offset: 0 })).pipe(
          tap((result) => {
            if (result.ok && result.data) {
              pokemonDispatcher.dispatch.loadListSuccess({ ...mapListResponse(result.data), append: false })
            } else {
              pokemonDispatcher.dispatch.loadListError(String(result.error))
            }
          }),
          catchError((err) => {
            pokemonDispatcher.dispatch.loadListError(String(err))
            return EMPTY
          }),
        ),
      ),
    ),
)

// Effect 2: Подгрузка следующей страницы (использует withLatestFrom + selectorObject)
const loadMoreEffect = createEffect(
  (action$: Observable<any>, state$: Observable<PokemonState>, _ext: any, { pokemonDispatcher }: Dispatchers, { pokemonApi: api }: Services) =>
    action$.pipe(
      ofType(pokemonDispatcher.dispatch.loadMore),
      withLatestFrom(
        selectorObject(state$, {
          offset: (s) => s.offset,
        }),
      ),
      switchMap(([_, { offset }]) =>
        from(api.request('getList', { limit: 12, offset })).pipe(
          tap((result) => {
            if (result.ok && result.data) {
              pokemonDispatcher.dispatch.loadListSuccess({ ...mapListResponse(result.data), append: true })
            } else {
              pokemonDispatcher.dispatch.loadListError(String(result.error))
            }
          }),
          catchError((err) => {
            pokemonDispatcher.dispatch.loadListError(String(err))
            return EMPTY
          }),
        ),
      ),
    ),
)

// Effect 3: Загрузка деталей при выборе покемона
const loadDetailsEffect = createEffect(
  (action$: Observable<any>, _state$: Observable<PokemonState>, _ext: any, { pokemonDispatcher }: Dispatchers, { pokemonApi: api }: Services) =>
    action$.pipe(
      ofType(pokemonDispatcher.dispatch.selectPokemon),
      switchMap((action: any) => {
        const id = action.payload as number | null
        if (id === null) return EMPTY
        return from(api.request('getDetails', { id })).pipe(
          tap((result) => {
            if (result.ok && result.data) {
              pokemonDispatcher.dispatch.loadDetailsSuccess(mapDetailsResponse(result.data))
            } else {
              pokemonDispatcher.dispatch.loadDetailsError(String(result.error))
            }
          }),
          catchError((err) => {
            pokemonDispatcher.dispatch.loadDetailsError(String(err))
            return EMPTY
          }),
        )
      }),
    ),
)

// Объединяем все effects
export const pokemonEffects = combineEffects(loadListEffect, loadMoreEffect, loadDetailsEffect)
