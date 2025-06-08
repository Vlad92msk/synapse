> [🏠 Главная](./README.md)
> [🏠 Журнал изменений](../../CHANGELOG.md)

# Создание Эффекта
___

```typescript
import { EMPTY, from, mapTo, of, tap } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'

import {
  ofType,           // Слушает 1 событие
  ofTypes,          // Слушает несколько событий
  createEffect,     // Функция создания эффекта
  combineEffects,   // Объединяет несколько эффектов в один
  selectorMap,      // Выбор частей состояния с помощью селекторов (возвращает массив)
  selectorObject,   // Выбор частей состояния с помощью селекторов (возвращает объект)
  validateMap       // Оператор для удобной работы с запросом
} from 'synapse-storage/reactive'
import { pokemonEndpoints } from '../api/pokemon.api'
import { AppConfig } from '../app.config'
import { PokemonDispatcher } from '../pokemon.dispatcher'
import { Pokemon, PokemonState } from '../types'

// Определяем типы для наших эффектов
type DispatcherType = {
  pokemonDispatcher: PokemonDispatcher 
}
type ApiType = { 
  pokemonApi: typeof pokemonEndpoints 
}
type ExternalStorages = {
  core$: typeof coreSynapseIDB.state$
}

type Effect = ReturnType<typeof createEffect<
  AboutUserUserInfo,    // Тип текущего хранилища
  DispatcherType,       // Типы диспетчеров
  ApiType,              // Типы api
  Record<string, void>, // Тип конфигурации
  ExternalStorages     // Типы внешних хранилищ потоков
>>

// Эффект для навигации
export const navigationEffect: Effect = createEffect((action$, state$, externalStorages, { pokemonDispatcher }, _, config) =>
  action$.pipe(
    ofTypes([pokemonDispatcher.dispatch.next, pokemonDispatcher.dispatch.prev]),
    switchMap((action) => {
      const { id } = action.payload
      return of(() => pokemonDispatcher.dispatch.loadPokemon(id))
    }),
  ),
)

// Эффект для отслеживания изменений ID
export const watchIdEffect: Effect = createEffect((action$, state$, externalStorages, { pokemonDispatcher }) =>
  action$.pipe(
    ofType(pokemonDispatcher.watchers.watchCurrentId),
    withLatestFrom(
          selectorMap(state$,
            (state) => state.value
          //... selectors
        ),
    ),
    mapTo(null),
  ),
)

// Эффект для загрузки данных покемона
export const loadPokemonEffect: Effect = createEffect((
  action$,                // Поток событий 
  state$,                 // Поток состояния
  externalStorages,       // Потоки внешних хранилищ
  { pokemonDispatcher },  // Диспетчеры которые мы передали
  { pokemonApi },         // различные API которые мы передали
  config                   // Конфигурация, которую мы передали
  ) =>
  action$.pipe(
    // Я использую отдельный action loadPokemon который уведомляет о намерении сделать запрос
    // Для того, чтобы не устанавливать loading сразу
    ofType(pokemonDispatcher.dispatch.loadPokemon),
    withLatestFrom(
      selectorMap(state$, (s) => s.currentId, (s) => s.currentId),           // |
      selectorMap(pokemon1State$, (s) => s.currentId, (s) => s.currentId),   // | получает поток и селекторы, возвращает массив с результатами
      selectorMap(pokemon1State$, (s) => s.currentId),                       // |
      selectorObject(state$, {                                     // |
        currentId: (s) => s.currentId,                             // | получает поток и возвращает объект с результатами (для каждого свойства вызывается функция с состояниеме этого потого потока)
        name: (s) => s.currentPokemon?.sprites,                    // |
      }),
    ),
    validateMap({
      apiCall: ([action, [currentId], [externalId, externalId2], [external2Id], externalData]) => {
        const { id } = action.payload

        return from(
          // Использую waitWithCallbacks чтобы иметь доступ к методу loading
          pokemonApi.fetchPokemonById.request({ id }).waitWithCallbacks({
            // Вызывается только тогда, когда запрос реально отправляется, а не берется из кэша
            loading: (request) => {
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
export const pokemonEffects = combineEffects(
  navigationEffect,
  watchIdEffect,
  loadPokemonEffect
)
```
___

## 📚 Навигация

- [🏠 Главная](./README.md)
- [📖 Все разделы документации](./README.md#-документация)

### Связанные разделы:
- [⚡ Создание Диспетчера](./create-dispatcher.md)
- [⚡ Создание Модуля эффектов](./create-effects-module.md)
- [🌐 API-клиент](./api-client.md)
- [🛠️ Утилита createSynapse](./create-synapse.md)
