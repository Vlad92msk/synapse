import { combineEffects, createEffect, ofType, ofTypes, selectorMap, validateMap } from '@vlad92msk/synapse/reactive'
import { from, mapTo, of, tap } from 'rxjs'
import { catchError, switchMap } from 'rxjs/operators'

import { pokemonEndpoints } from '../api'
import { AppConfig } from '../app.config'
import { PokemonDispatcher } from '../dispatchers/pokemon.dispatcher'
import { PokemonState } from '../types'

// Определяем типы для наших эффектов
type PokemonDispatcherType = { pokemonDispatcher: PokemonDispatcher }
type PokemonApiType = { pokemonApi: typeof pokemonEndpoints }

// Эффект для навигации
export const navigationEffect = createEffect<
  PokemonState,
  PokemonDispatcherType,
  PokemonApiType,
  AppConfig,
  any //ExternalStorages
>((action$, state$, externalStorages, { pokemonDispatcher }, _, config) =>
  action$.pipe(
    ofTypes([pokemonDispatcher.dispatch.next, pokemonDispatcher.dispatch.prev]),
    switchMap((action) => {
      const { id } = action.payload
      return of(() => pokemonDispatcher.dispatch.loadPokemon(id))
    }),
  ),
)

// Эффект для отслеживания изменений ID
export const watchIdEffect = createEffect<
  PokemonState,
  PokemonDispatcherType,
  PokemonApiType,
  AppConfig,
  any //ExternalStorages
>((action$, state$, externalStorages, { pokemonDispatcher }) =>
  action$.pipe(
    ofType(pokemonDispatcher.watchers.watchCurrentId),
    selectorMap(
      state$,
      (state) => state.loading,
      (state) => state.currentId,
    ),
    tap(([action, [loading, currentId]]) => {
      // console.log(`ID покемона изменился на ${action.payload}`)
      // console.log('Статус загрузки:', loading)
      // console.log('ID в хранилище:', currentId)
    }),
    mapTo(null),
  ),
)

// Эффект для загрузки данных покемона
export const loadPokemonEffect = createEffect<
  PokemonState,
  PokemonDispatcherType,
  PokemonApiType,
  AppConfig,
  any //ExternalStorages
>(
  (
    action$, // Поток событий
    state$, // Поток состояния
    externalStorages, // Потоки внешних хранилищ
    { pokemonDispatcher }, // Диспетчеры которые мы передали
    { pokemonApi }, // различные API которые мы передали
    config, // Конфигурация, которую мы передали
  ) =>
    action$.pipe(
      // Я использую отдельный action loadPokemon который уведомляет о намерении сделать запрос
      // Для того, чтобы не устанавливать loading сразу
      ofType(pokemonDispatcher.dispatch.loadPokemon),
      selectorMap(state$, (state) => state.currentId),
      validateMap({
        apiCall: ([action, [currentId]]) => {
          const { id } = action.payload

          return from(
            // Использую waitWithCallbacks чтобы иметь доступ к методу loading
            pokemonApi.fetchPokemonById.request({ id }).waitWithCallbacks({
              // Вызывается только тогда, когда запрос реально отправляется, а не берется из кэша
              loading: (request) => {
                console.log('LOADING', request)
                // Именно в в этот момент установится loading и другая необходимая логика
                pokemonDispatcher.dispatch.loadPokemonRequest(id)
              },
              // Можно использовать так:
              // success: (data, request) => {
              //   console.log('SUCCESS', request)
              //   pokemonDispatcher.dispatch.success({ data })
              // },
              // error: (error, request) => {
              //   console.log('ERROR', error, request)
              //   pokemonDispatcher.dispatch.failure(error!)
              // },
            }),
            // Можно более стандартным способом:
          ).pipe(
            switchMap(({ data }) => {
              return of(pokemonDispatcher.dispatch.success({ data }))
            }),
            catchError((err) => of(pokemonDispatcher.dispatch.failure(err))),
          )
        },
      }),
    ),
)

// Объединяем все эффекты в один и экспортируем
export const pokemonEffects = combineEffects(navigationEffect, watchIdEffect, loadPokemonEffect)
