# createSynapse (эффекты)

> [Назад к оглавлению](./README.md)

Полная конфигурация: хранилище + селекторы + диспетчер + RxJS-эффекты для побочных действий.

## Создание

```typescript
import { createSynapse } from 'synapse-storage/utils'
import { createDispatcher, ofType, createEffect } from 'synapse-storage/reactive'
import { debounceTime, switchMap, tap } from 'rxjs/operators'
import { of } from 'rxjs'

const synapsePromise = createSynapse({
  storage: new MemoryStorage<SearchState>({ name: 'search', initialState }),

  createSelectorsFn: (sm) => ({ ... }),

  createDispatcherFn: (storage) =>
    createDispatcher({ storage }, (_storage, { createAction }) => {
      const setQuery = createAction({ type: 'setQuery', action: (q: string) => { ... } })
      const searchSuccess = createAction({ type: 'searchSuccess', action: ... })
      return { setQuery, searchSuccess }
    }),

  // Диспетчер передаётся автоматически
  createEffectConfig: () => ({
    // services?: {},            // сервисы (API-клиенты и т.д.)
    // config?: {},              // конфигурация для эффектов
    // externalDispatchers?: {}, // диспетчеры из других synapse
  }),

  // Массив эффектов
  effects: [ ... ],
})
```

## createEffect

```typescript
import { createEffect, ofType } from 'synapse-storage/reactive'

// Эффект — функция, получающая потоки и контекст, возвращающая Observable
createEffect((action$, state$, { dispatcher, services, config }) =>
  action$.pipe(
    ofType(dispatcher.dispatch.setQuery),  // фильтрация по действию
    debounceTime(400),
    switchMap((action) => {
      const query = action.payload as string
      return of(query).pipe(
        switchMap(async (q) => {
          const results = await fetchResults(q)
          dispatcher.dispatch.searchSuccess(results)
        }),
      )
    }),
  ),
)

// Аргументы:
// action$  — Observable всех отправленных действий
// state$   — Observable текущего состояния
// context  — { dispatcher, externalDispatchers, services, config }
```

## ofType / ofTypes

```typescript
import { ofType, ofTypes } from 'synapse-storage/reactive'

// ofType — фильтрация потока по одному типу действия
action$.pipe(
  ofType(dispatcher.dispatch.setQuery),
)

// ofTypes — фильтрация по нескольким типам
action$.pipe(
  ofTypes([
    dispatcher.dispatch.setQuery,
    dispatcher.dispatch.searchError,
  ]),
)
```

## Возвращаемое значение

```typescript
const store = await synapsePromise

store.storage     // IStorage<SearchState>
store.selectors   // { query, results, isLoading, error }
store.actions     // { setQuery, searchSuccess, searchError }
store.dispatcher  // Dispatcher
store.state$      // Observable<SearchState> — поток состояния (только с эффектами!)
store.destroy()   // () => Promise<void>

// Эффекты запускаются автоматически при инициализации
```
