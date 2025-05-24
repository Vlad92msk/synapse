import { from, of } from 'rxjs'
import { switchMap, withLatestFrom } from 'rxjs/operators'
import { combineEffects, createEffect, ofType, ofTypes, selectorMap, selectorObject, validateMap } from 'synapse-storage/reactive'
import { pokemon1State$ } from '../../pokemons/synapse/pokemon.synapse'
import { pokemonEndpoints } from '../api'
import { AppConfig } from '../app.config'
import { PokemonDispatcher } from './pokemon.dispatcher'
import { PokemonState } from '../types'

// Определяем типы для наших эффектов
type PokemonDispatcherType = { pokemonDispatcher: PokemonDispatcher }
type PokemonApiType = { pokemonApi: typeof pokemonEndpoints }
type PokemonExternalStates = { pokemon1State$: typeof pokemon1State$ }

// Эффект для навигации
export const navigationEffect = createEffect<
  PokemonState,
  PokemonDispatcherType,
  PokemonApiType,
  AppConfig,
  PokemonExternalStates
>((action$, state$, { pokemon1State$ }, { pokemonDispatcher }) => action$.pipe(
  ofTypes([pokemonDispatcher.dispatch.next, pokemonDispatcher.dispatch.prev]),
  withLatestFrom(
    selectorMap(state$, (s) => s.currentId, (s) => s.currentId),
    selectorMap(pokemon1State$, (s) => s.currentId, (s) => s.currentId),
    selectorMap(pokemon1State$, (s) => s.currentId),
    selectorObject(state$, {
      currentId: (s) => s.currentId,
      name: (s) => s.currentPokemon?.sprites,
    }),
  ),
  switchMap(([action, [currentId], [externalId, externalId2], [external2Id], externalData]) => {
    // console.log('action', action)
    // console.log('currentId', currentId)
    // console.log('externalId', externalId)
    // console.log('externalId2', externalId2)
    // console.log('external2Id', external2Id)
    // console.log('externalData', externalData)
    const { id } = action.payload
    return of(() => pokemonDispatcher.dispatch.loadPokemon(id))
  }),
))

// Эффект для загрузки данных покемона
export const loadPokemonEffect = createEffect<
  PokemonState,
  PokemonDispatcherType,
  PokemonApiType,
  AppConfig,
  any>((
    action$, // Поток событий
    state$, // Поток состояния
    _,
    { pokemonDispatcher }, // Диспетчеры которые мы передали
    { pokemonApi }, // различные API которые мы передали
    config, // Конфигурация, которую мы передали
  ) => action$.pipe(
    ofType(pokemonDispatcher.dispatch.loadPokemon),
    validateMap({
      apiCall: (action) => {
        const { id } = action.payload

        return from(
        // Использую waitWithCallbacks чтобы иметь доступ к методу loading
          pokemonApi.fetchPokemonById.request({ id }).waitWithCallbacks({
            loading: (request) => {
              pokemonDispatcher.dispatch.loadPokemonRequest(id)
            },
            success: (data, request) => {
              pokemonDispatcher.dispatch.success({ data })
            },
            error: (error, request) => {
              pokemonDispatcher.dispatch.failure(error!)
            },
          }),
        )
      },
    }),
  ))

// Объединяем все эффекты в один и экспортируем
export const pokemonEffects = combineEffects(
  navigationEffect,
  loadPokemonEffect,
)
