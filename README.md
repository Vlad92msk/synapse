# Synapse Storage

Набор инструментов для управления состоянием + API-клиент

[![npm version](https://badge.fury.io/js/synapse-storage.svg)](https://badge.fury.io/js/synapse-storage)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/synapse-storage)](https://bundlephobia.com/package/synapse-storage)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![RxJS Version](https://img.shields.io/badge/RxJS-%5E7.8.2-red?logo=reactivex)](https://rxjs.dev/)

## Особенности

- **Не привязан к конкретному фреймворку**: Вы можете использовать Synapse в контексте любого фреймворка или независимо от него
- **Разнообразные адаптеры хранилищ**: Выбирайте между Memory, LocalStorage или IndexedDB в зависимости от ваших потребностей
- **Различный способ получения данных**: Создавайте и комбинируйте селекторы для вычисляемых значений на основе состояния в стиле Redux или просто подписывайтесь на конкретное свойство в хранилище
    - Возможность создания вычисляемых селекторов в стиле Redux
    - Возможность прямой подписки на конкретное свойство в хранилище
    - Возможность подписки на реактивное состояние
- **Надежный API-клиент**: Создайте удобный API-клиент для вашего приложения (похож на RTK Query)
- **Поддержка middleware**: Расширяйте функциональность с помощью пользовательских middleware
- **Система плагинов**: Используйте готовые или создавайте собственные плагины для расширения функциональности
- **Отдельные возможности для реактивного подхода**: Возможность гибкой работы с api-запросами в стиле Redux-Observable и RxJS

## Автор

**Владислав** — Senior Frontend Developer (React, TypeScript)


> ### 🔎 Нахожусь в поиске новых карьерных возможностей!
>
> [GitHub](https://github.com/Vlad92msk/) | [LinkedIn](https://www.linkedin.com/in/vlad-firsov/)

> ### Подробные примеры:
>[GitHub](https://github.com/Vlad92msk/synapse-examples)
> |
>[YouTube](https://www.youtube.com/channel/UCGENI_i4qmBkPp98P2HvvGw)

---
*PS: Пока не рекоммендую использовать в production т.к разработкой занимаюсь в свободное время.
Библиотека в целом работает, но дать гарантии смогу после полной интеграции ее в свой пет-проект Социальная сеть.
Но произойдет это не раньше смены моего текущего места работы и страны проживания*
---

## 📦 Установка

```bash
npm install synapse-storage
```

```bash
# Для реактивных возможностей
npm install rxjs

# Для React интеграции  
npm install react react-dom

# Все сразу для полного функционала
npm install synapse-storage rxjs react react-dom
```

## 🚀 Быстрый старт

| Модуль | Описание              | Зависимости |
|--------|-----------------------|-------------|
| `synapse-storage/core` | Хранилища состояния   | Нет         |
| `synapse-storage/react` | Инструменты для React | React 18+   |
| `synapse-storage/reactive` | RxJS интеграция       | RxJS 7.8.2+ |
| `synapse-storage/api` | HTTP клиент           | Нет         |
| `synapse-storage/utils` | Утилиты               | Нет         |

> **💡 Совет:** Импортируйте только нужные модули для оптимального размера бандла

### Минимальный tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022", 
    "moduleResolution": "bundler"
  }
}
```
 
Импорты:
```typescript
// Инструменты создания и управления хранилищем
import {
  // Хранилища
  MemoryStorage,
  IndexedDBStorage,
  LocalStorage,

  // Интерфейсы для хранилищ
  IStorage,

  // middleware для хранилища
  broadcastMiddleware,

  // Для создания кастомных плагинов хранилища
  StoragePluginModule,
  IStoragePlugin,
  PluginContext,
  StorageKeyType,

  // Для создания кастомных middlewares хранилища
  Middleware,
  MiddlewareAPI,
  NextFunction,

  // Модуль создания вычисляемых селекторов в Redux стиле
  SelectorModule,
  ISelectorModule
} from 'synapse-storage/core'

// Инструменты для использования реактивного подхода (немного похоже на Redux-Observable)
import { 
  // Инструменты для создания Dispatcher
  createDispatcher,
  loggerDispatcherMiddleware,

  // Инструменты для создания Effects (напоминает Redux-Observable)
  EffectsModule, 
  combineEffects, 
  createEffect,
  ofType,
  ofTypes,
  selectorMap,
  validateMap
} from 'synapse-storage/reactive';

// Инструменты для работы с api
import { ApiClient, ResponseFormat } from 'synapse-storage/api'

// Несколько инструментов для удобного использования в React
import { useStorageSubscribe, useSelector, createSynapseCtx } from 'synapse-storage/react'

import { createSynapse } from 'synapse-storage/utils'
```


## Базовое использование

### Создание зранилищ

```typescript
const counter1 = await new MemoryStorage<Counter>({
  name: 'counter1',
  initialState: {
    value: 100,
  },
}).initialize()
```


```typescript
const counter2 = await new LocalStorage<Counter>({
  name: 'counter2',
  initialState: { value: 100 },
}).initialize()
```


```typescript
const { counter3 } = await IndexedDBStorage.createStorages<{ counter3: Counter }>(
  'example1', // Название базы данных в indexDB
  // Таблицы:
  {
    counter3: {
      name: 'counter3',
      initialState: { value: 99 },
      // eventEmitter: ,
      // initialState: ,
      // middlewares: ,
      // pluginExecutor: ,
    },
    // Другие объекты (хранилища в текущей базе данных)
  }
)
```

### Способы изменения значений (основные)

```typescript
    const updateCounter1 = async () => {
        await counter1.update((state) => {
            state.value = state.value + 1
        })
    }

    const updateCounter2 = async () => {
        await counter2.set('value', counter2ValueSelectorValue! + 1)
    }

    const updateCounter3 = async () => {
        counter3.set('value', counter3ValueSelectorValue! + 1)
    }
```


### Создание подписок

> **💡 Совет:**
При создании подписок с помощью subscribe или subscribeToAll лучше не забывать вызывать функцию отписки 
> 
```jsx
const [counter1Value, setCounter1Value] = useState(0)
const [counter2Value, setCounter2Value] = useState(0)


useEffect(() => {
  // Подписка через колбэк
  counter1.subscribe((state) => state.value, (value) => {
    setCounter1Value(value)
  })
  // Подписка через путь (может быть типа 'user.settings.theme')
  counter2.subscribe('value', (value) => {
    setCounter2Value(value)
  })

  // Подписка на все события
  counter1.subscribeToAll((event) => {
    console.log('event', event)
    // Здесь мы получим объект:
    // changedPaths:['value'] // все пути по которым были вызваны изменения (['prop1.prop2', 'prop44.prop.555.prop.666'])
    // key:['value'] // Корневые ключи в хранилище которые вкоторых были изменения
    // type:"storage:update" // Тип операции
    // value: {value: 101} // Новый state
  })
}, [])
// Для React через специальный селектор
const counter3Value = useStorageSubscribe(counter3, (state) => state.value)
```

### Создание вычисляемых подписок в стиле Redux
```typescript
const counter1Selector = new SelectorModule(counter1)
const counter2Selector = new SelectorModule(counter2)
const counter3Selector = new SelectorModule(counter3)

const counter1ValueSelector = counter1Selector.createSelector((s) => s.value)
const counter2ValueSelector = counter2Selector.createSelector((s) => s.value)
const counter3ValueSelector = counter3Selector.createSelector((s) => s.value)

const sum = counter3Selector.createSelector(
  [counter1ValueSelector, counter2ValueSelector, counter3ValueSelector],
  (a,b,c) => a + b + c,
  // Опционально:
  // {
  //   equals: , // Функция сравнения
  //   name: 'doubledCountSelector' // Имя селектора
  // }
)
```

### Получение значений из вычисляемых селекторов
```jsx
// Нативный способ

// Единоразовое получение
const sumValueSelector = sum.select().then(value => value)

// Подписка на изменение
counter2ValueSelector.subscribe({
  notify: (value) => {
    console.log('counter2ValueSelector', value)
  }
})

counter3ValueSelector.subscribe({
  notify: (value) => {
    console.log('counter3ValueSelector', value)
  }
})

// Для React через специальный селектор
const counter1ValueSelectorValue = useSelector(counter1ValueSelector)
const counter2ValueSelectorValue = useSelector(counter2ValueSelector)
const counter3ValueSelectorValue = useSelector(counter3ValueSelector, 
  // Можно указать доп опции
  {
    initialValue: 99,
    withLoading: true,
    equals: (a, b) =>  a !== b
  })
// Тогда получать значение так
counter3ValueSelectorValue.data
counter3ValueSelectorValue.isLoading
```


### Middlewares

> **💡 Важно:**
Порядок имеет значение!<br/>
Action → BroadcastMiddleware → ShallowCompare → Batching → Base Operation
> 
```typescript
const counter1 = await new MemoryStorage<Counter>({
  name: 'counter1',
  initialState: {
    value: 100,
  },
  middlewares: () => {
    const broadcast = broadcastMiddleware({
      storageType: 'memory',  // <-- Важно правильно указывать тип хранилища
      storageName: 'counter1' // <-- Желательно правильно указывать имя хранилища
    })
    return [broadcast]
  }
}).initialize()

const counter2 = await new LocalStorage<Counter>({
  name: 'counter2',
  initialState: { value: 100 },
  middlewares: (getDefaultMiddleware) => {
    const { shallowCompare } = getDefaultMiddleware()

    const broadcast = broadcastMiddleware({
      storageType: 'localStorage',
      storageName: 'counter2'
    })

    return [broadcast, shallowCompare()]
  }
}).initialize()

const { counter3 } = await IndexedDBStorage.createStorages<{ counter3: Counter }>(
  'example1', {
    counter3: {
      name: 'counter3',
      initialState: { value: 99 },
      middlewares: (getDefaultMiddleware) => {
        const { batching } = getDefaultMiddleware()

        const broadcast = broadcastMiddleware({
          storageType: 'indexedDB',
          storageName: 'counter3'
        })
        return [
          broadcast,
          batching({
            batchSize: 20,
            batchDelay: 200
          })
        ]
      }
    }
  }
)
```

```typescript
    // Поверхностное сравнение
    const updateCounter2 = async () => {
        await counter2.set('value', counter2ValueSelectorValue! + 1) // Это будет применено
        await counter2.set('value', counter2ValueSelectorValue! + 1) // |
        await counter2.set('value', counter2ValueSelectorValue! + 1) // | Не будут вызваны так как payload не изменился
        await counter2.set('value', counter2ValueSelectorValue! + 1) // |
        await counter2.set('value', counter2ValueSelectorValue! + 1) // |
    }

    // Батчинг
    // !! работает только для методов без await
    const updateCounter3 = async () => {
        counter3.set('value', counter3ValueSelectorValue! + 1) // | игнорируется 
        counter3.set('value', counter3ValueSelectorValue! + 1) // | игнорируется
        counter3.set('value', counter3ValueSelectorValue! + 1) // | игнорируется 
        counter3.set('value', counter3ValueSelectorValue! + 1) // | игнорируется 
        counter3.set('value', counter3ValueSelectorValue! + 10)// | < --- будет применено только это
    }
```

### Иное

```typescript
const counter1 = await new MemoryStorage<Counter>({
    name: 'counter1',
    initialState: {
      value: 100,
    },
    middlewares: () => {
      const broadcast = broadcastMiddleware({
        storageType: 'memory',
        storageName: 'counter1'
      })
      return [broadcast]
    }
  },
  undefined, // Менеджер плагинов имплементирующий IPluginExecutor
  {
    emit: async (event: StorageEvent) => { // любой EventEmitter имплементирующий IEventEmitter
      console.log('event', event)
      // event будет содержать следующую инф:
      // type: "storage:update"
      // metadata:
      //   storageName:"counter1"
      // timestamp: 1748581282102
      // payload:
      //   changedPaths:['value']
      // key: ['value']
      // state: {value: 101}
    },                                        
  },
  console // любой логгер имплементирующий ILogger
).initialize()
```

## API-клиент

Synapse включает в себя API-клиент с поддержкой кеширования:

```typescript
const api = new ApiClient({
  // Настройка кеширования запросов
  cacheableHeaderKeys: ['X-Auth-Token'],
  storage: API, // Передаем готовое экземпляр готового хранилища
  // Настройки кеша
  cache: {
    ttl: 5 * 60 * 1000, // Время жизни кеша: 5 минут
    invalidateOnError: true, // Инвалидация кеша при ошибке
    cleanup: {
      enabled: true, // Периодическая очистка кеша
      interval: 10 * 60 * 1000, // Интервал очистки: 10 минут
    },
  },
  // Базовые настройки запроса
  baseQuery: {
    baseUrl: 'https://api.example.com',
    timeout: 10000, // 10 секунд
    prepareHeaders: async (headers, context) => {
      // Установка заголовков
      headers.set('X-Auth-Token', 'some-token');
      // Получение данных из хранилища или cookies
      const token = context.getCookie('token');
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
    credentials: 'same-origin',
  },
  // Определение эндпоинтов
  endpoints: async (create) => ({
    getData: create({
      request: (params) => ({
        path: '/data',
        method: 'GET',
        query: params,
      }),
      // Можно указать специфичные настройки кеша для эндпоинта
      cache: {
        ttl: 60 * 1000, // 1 минута для этого эндпоинта
      },
    }),
  }),
});

// Инициализация
const myApi = await api.init();

// Использование с подпиской на состояние запроса
const request = myApi.getEndpoints().getData.request({ id: 1 });

// Вариант 1: Подписка на изменения состояния запроса
request.subscribe((state) => {
  switch (state.status) {
    case 'idle':
      console.log('Запрос неактивен');
      break;
    case 'loading':
      console.log('Загрузка данных...');
      break;
    case 'success':
      console.log('Данные получены:', state.data);
      break;
    case 'error':
      console.log('Ошибка:', state.error);
      break;
  }
});

// Вариант 2: Ожидание результата запроса
const response = await request.wait();

// Вариант 3: Ожидание с колбеками для разных состояний
request.waitWithCallbacks({
  loading: () => console.log('Загрузка...'),
  success: (data) => console.log('Данные:', data),
  error: (error) => console.error('Ошибка:', error),
});
```

## Реактивный подход
Synapse предоставляет инструменты для использования реактивного подхода, напоминающий Redux-Observable.

Пример создания Диспетчера:
```typescript
import { createDispatcher, loggerDispatcherMiddleware } from 'synapse-storage/reactive'
import { PokemonStorage } from '../storages/pokemon.storage'
import { createPokemonAlertMiddleware } from '../middlewares/pokenon.middlewares'
import { Pokemon } from '../types'

// const myWorker = new Worker('path-to-my-worker')

export interface AlertPayload {
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  duration?: number // Длительность показа в миллисекундах
}

// Функция для создания диспетчера
export function createPokemonDispatcher(storage: PokemonStorage) {
  // Создаем middleware: логгер
  const loggerMiddleware = loggerDispatcherMiddleware({
    collapsed: true, // Сворачиваем группы в консоли для компактности
    colors: {
      title: '#3498db', // Кастомный синий цвет для заголовка
    },
    duration: true,
    diff: true,
    showFullState: true,
  })

  // Создаем middleware: alertM (просто для примера)
  const alertM = createPokemonAlertMiddleware()

  return createDispatcher({
    storage,
    middlewares: [loggerMiddleware, alertM],
  }, (storage, { createWatcher, createAction }) => ({
    // watcher`s
    watchCurrentId: createWatcher({...}),
    // сСобытия
    loadPokemon: createAction<number, { id: number }>({...}),
    loadPokemonRequest: createAction<number, { id: number }>({...}),
    // Успешное получение данных
    success: createAction<{ data?: Pokemon}, { data?: Pokemon }>({...}, {
      // Функция мемоизации (пока не тестировал)
      // memoize: (currentArgs: any[], previousArgs: any[], previousResult: any) => true,
      // Веб-воркер для выполнения действия (пока не тестировал)
      // worker: myWorker,
    }),
    failure: createAction<Error, { err: Error }>({...}),
    next: createAction<void, { id: number }>({...}),
    prev: createAction<void, { id: number }>({...}),
    showAlert: createAction<AlertPayload, void>({...}),
  }))
  // Альтернативный вариант добавления:
  // .use(logger)
  // .use(alertM)
}

// Экспортируем тип диспетчера
export type PokemonDispatcher = ReturnType<typeof createPokemonDispatcher>
```

Пример создания Эффекта:
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
import { pokemonEndpoints } from '../api.md'
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
---
## Пример организации кода и использования утилиты createSynapse

Предлагаемая структура файлов

```md
📦some-directory
└── 📂synapses
│    └── 📂core
│    │    ├── 📄core.dispatcher.ts
│    │    ├── 📄core.synapse.ts
│    │    └── ...
│    └── 📂user-info
│    │    ├── 📄user-info.context.tsx
│    │    ├── 📄user-info.dispatcher.ts
│    │    ├── 📄user-info.effects.ts
│    │    ├── 📄user-info.selectors.ts
│    │    ├── 📄user-info.store.ts
│    │    └── 📄user-info.synapse.ts
│    └──...
│
└── 📄indexdb.config.ts
```

```typescript
// user-info.store.ts
// === СОЗДАНИЕ ХРАНИЛИЩА НУЖНОГОТИПА ===
export async function createUserInfoStorage() {
  return new MemoryStorage<AboutUserUserInfo>({
    name: 'user-info',
    initialState: {
      userInfoInit: undefined,
      isChangeActive: false,
      fieldsInit: {},
      fields: {},
    },
  }).initialize()
}
```

```typescript
// user-info.dispatcher.ts
// === СОЗДАНИЕ ДИСПЕТЧЕРА ===

import { IStorage } from 'synapse-storage/core'
import { createDispatcher, loggerDispatcherMiddleware } from 'synapse-storage/reactive'

export function createUserInfoDispatcher(store: IStorage<AboutUserUserInfo>) {
  const loggerMiddleware = loggerDispatcherMiddleware({...})

  return createDispatcher({ storage: store }, (storage, { createAction, createWatcher }) => ({
    setCurrentUserProfile: createAction<UserProfileInfo, UserProfileInfo>({
      type: 'setCurrentUserProfile',
      // meta: ,
      // action: async () => {...}),
    }),

    setActiveChange: createAction<void, void>({
      type: 'setActiveChange',
      // meta: ,
      // action: async () => {...}),
    })
  // Другие диспетчеры ...
  })).use(loggerMiddleware)
}

export type UserInfoDispatcher = ReturnType<typeof createUserInfoDispatcher>
```

```typescript
// user-info.dispatcher.ts
// === СОЗДАНИЕ СЕЛЕКТОРОВ ===
import { ISelectorModule } from 'synapse-storage/core'

export const createUserInfoSelectors = (selectorModule: ISelectorModule<AboutUserUserInfo>) => {
  const currentUserProfile = selectorModule.createSelector((s) => s.userInfoInit)
  const fieldsInit = selectorModule.createSelector((s) => s.fieldsInit)

  const isChangeActive = selectorModule.createSelector((s) => s.isChangeActive)

  const fields = selectorModule.createSelector((s) => s.fields)
  // Для React
  // Комопнент будет ререндериться всегда, когда меняется возвращаемое селектором значение
  // Для уменьшения ререндеров советую создавать точечные селекторы
  // Если для отображения information у вас отдельный компонент - лучше создать отдельный для него селектор
  const fieldInformation = selectorModule.createSelector((s) => s.fields.information)
  const fieldPosition = selectorModule.createSelector((s) => s.fields.position)
  //...

  return ({
    currentUserProfile,
    isChangeActive,
    //...
  })
}
```

```typescript
// user-info.effects.ts
// === СОЗДАНИЕ ЭФФЕКТОВ ===
import { EMPTY, from, of } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import { combineEffects, createEffect, ofType, validateMap } from 'synapse-storage/reactive'

type CurrentDispatchers = {
  userInfoDispatcher: UserInfoDispatcher
  coreIdbDispatcher: CoreDispatcher
};
type CurrentApis = {
  userInfoAPi: typeof userInfoEndpoints
};
type ExternalStorages = {
}

type Effect = ReturnType<typeof createEffect<
  AboutUserUserInfo,     // Тип текущего хранилища
  CurrentDispatchers,       // Типы диспетчеров
  CurrentApis,              // Типы api
  Record<string, void>, // Тип конфигурации
  ExternalStorages     // Типы внешних хранилищ потоков
>>

/**
 * Добавляем полученный профиль пользователя в текущий СТор
 */
const loadUserInfoById: Effect = createEffect((action$, state$, { userInfoDispatcher, coreIdbDispatcher }) => action$.pipe(
  // Подписываемся на изменения в стороннем Synapse
  ofType(coreIdbDispatcher.watchers.watchCurrentUserProfile),
  map((s) => {
    if (!s.payload) return EMPTY
    // Берем данные из стороннего Synapse и кладем в текущий
    return userInfoDispatcher.dispatch.setCurrentUserProfile(s.payload)
  }),
))

const updateUserProfile: Effect = createEffect((action$, state$, { userInfoDispatcher }, { userInfoAPi }) => action$.pipe(
  ofType(userInfoDispatcher.dispatch.submit),
  validateMap({
    // Валидация перед запросом
    validator: (action) => ({
      skipAction: userInfoDispatcher.dispatch.reset(),
      conditions: [Boolean(action.payload)]
    }),
    apiCall: (action) => {
      return from(
        userInfoAPi.getUserById.request({ user_id: 1 }).waitWithCallbacks({
          // Вызывается только тогда, когда запрос реально отправляется, а не берется из кэша
          loading: (request) => {
            // Именно в в этот момент установится loading и другая необходимая логика
            // userInfoDispatcher.dispatch.request(id)
          },
          // Можно использовать так:
          success: (data, request) => {
            // userInfoDispatcher.dispatch.success({ data })
          },
          error: (error, request) => {
            // userInfoDispatcher.dispatch.failure(error!)
          },
        }),
      )
    },
  }),
))

export const userInfoEffects = combineEffects(
  loadUserInfoById,
  updateUserProfile,
)

```

```typescript
// user-info.synapse.ts
// === СОЗДАНИЕ Synapse ===
import { createSynapse } from 'synapse-storage/utils'
import { createUserInfoDispatcher } from './user-info.dispatcher'
import { userInfoEffects } from './user-info.effects'
import { createUserInfoSelectors } from './user-info.selectors'
import { createUserInfoStorage } from './user-info.store'
import { userInfoEndpoints } from '../../api/user-info.api'
import { coreSynapseIDB } from '../core/core.synapse'

export const userInfoSynapse = await createSynapse({
  // Передаем хранилище
  // Это может быть 
  // 1 - Функция, которая фозвращает готовое ранилище
  createStorageFn: createUserInfoStorage,
  // 2 - Класс для создания хранилища (initialize() убдет вызван внутри)
  // storage: new MemoryStorage<AboutUserUserInfo>({
  //   name: 'user-info',
  //   initialState: {
  //     userInfoInit: undefined,
  //     isChangeActive: false,
  //     fieldsInit: {},
  //     fields: {},
  //   },
  // }),
  // Функция создания диспетчеров (Опционально)
  createDispatcherFn: createUserInfoDispatcher,
  // Функция создания селекторов (Опционально)
  createSelectorsFn: createUserInfoSelectors,
  // Внешние селекторы (Опционально)
  externalSelectors: {
    // externalSelectors1: ...
  },
  // Конфигурация для эффектов (Опционально)
  createEffectConfig: (userInfoDispatcher) => ({
    // Диспетчеры для эффектов
    dispatchers: {
      userInfoDispatcher,                           // Текущий, для управления соственных хранилищем
      coreIdbDispatcher: coreSynapseIDB.dispatcher, // Внешний, для взаиможействия с внешними хранилищами
      //...
    },
    // Дополнительное АПИ по вашему усмотрения (у меня это API Clients)
    api: {
      userInfoAPi: userInfoEndpoints,
    },
    // Внешние состояния ввиде потоков, которые хотим использовать в эффектах
    externalStates: {
      pokemonState$: pokemon1State$,
      core$: coreSynapseIDB.state$,
    },
  }),
  // Эффекты которые будут запущены для этого synapse
  effects: [userInfoEffects],
})
```

```tsx
// user-info.context.tsx
// === СОЗДАНИЕ React Context ===
import { createSynapseCtx } from 'synapse-storage/react'
import { userInfoSynapse } from './user-info.synapse'

// Получаем все необходимые инструменты для работы в компонете
export const {
  contextSynapse: useUserInfoContextSynapse,
  useSynapseActions: useUserInfoSynapseActions,
  useSynapseSelectors: useUserInfoSynapseSelectors,
  useSynapseState$: useUserInfoSynapseState$,
  useSynapseStorage: useUserInfoSynapseStorage,
  cleanupSynapse: useUserInfoCleanupSynapse,
} = createSynapseCtx(
    // Передаем сам Synapse
    userInfoSynapse,
    {
      loadingComponent: <div>loading</div>, // Передаем компонент, который будет отображаться пока идет загрузка инициализация
      // mergeFn: // Функция слияния переданных параметров в initialState (по умолчанию выполняется глубокая копия)
    },
)
```

Таким образом вы можете резделить функционал на слои


---



## Создание пользовательского middleware

Synapse предоставляет две системы расширения функциональности: middleware и плагины. Они выполняют разные роли и имеют разную область применения.

Middleware в Synapse работают по принципу "цепочки обработчиков" и позволяют перехватывать любые операции хранилища. Каждое middleware может модифицировать действия до и после их обработки базовым хранилищем.


### Порядок выполнения middleware

Middleware выполняются в порядке их объявления в массиве:
1. Действие проходит через все middleware сверху вниз
2. Затем выполняется базовая операция хранилища
3. Результат проходит через middleware снизу вверх

```
Action → BroadcastMiddleware → ShallowCompare → Batching → Base Operation
Result ← BroadcastMiddleware ← ShallowCompare ← Batching ← Base Operation
```

#### Создание пользовательского middleware

```typescript
import { Middleware } from 'synapse-storage/core';

const loggingMiddleware = (): Middleware => ({
  // Уникальное имя middleware
  name: 'logging',
  
  // Инициализация при добавлении middleware к хранилищу
  setup: (api) => {
    console.log('Logging middleware initialized');
  },
  
  // Основная логика перехвата и обработки действий
  reducer: (api) => (next) => async (action) => {
    console.log('Before action:', action);
    
    try {
      // Вызов следующего middleware в цепочке
      const result = await next(action);
      
      console.log('After action:', {
        action,
        result,
      });
      
      return result;
    } catch (error) {
      console.error('Action error:', error);
      throw error;
    }
  },
  
  // Очистка ресурсов при уничтожении хранилища
  cleanup: () => {
    console.log('Logging middleware cleanup');
  }
});
```

### Плагины

Плагины в Synapse представляют собой систему обработчиков событий хранилища с определенным жизненным циклом. В отличие от middleware, они не формируют цепочку, а работают как независимые "наблюдатели" за операциями хранилища.

```typescript
import { IStoragePlugin, StoragePluginModule } from 'synapse-storage/core';

// Создаем модуль плагинов
const plugins = new StoragePluginModule(
  undefined,      // Родительский модуль плагинов (опционально)
  console,        // Логгер
  'appStorage'    // Имя хранилища
);

// Пример плагина валидации
class ValidationPlugin implements IStoragePlugin {
  name = 'validation';
  private validators = new Map();
  private options: any;

  constructor(options = {}) {
    this.options = options;
  }

  // Добавление правила валидации для ключа
  addValidator(key, validator) {
    this.validators.set(key, validator);
    return this;
  }

  // Вызывается перед сохранением значения
  async onBeforeSet(value, context) {
    const { key } = context.metadata || {};
    
    if (key && this.validators.has(key)) {
      const validator = this.validators.get(key);
      const result = validator(value);
      
      if (!result.valid) {
        if (this.options.throwOnInvalid) {
          throw new Error(`Validation failed for ${key}: ${result.message}`);
        }
        
        this.options.onValidationError?.(key, value, result.message);
      }
    }
    
    return value;
  }
  
  // Инициализация плагина
  async initialize() {
    console.log('Validation plugin initialized');
  }
  
  // Очистка ресурсов
  async destroy() {
    this.validators.clear();
  }
}

// Добавление плагинов в модуль
await plugins.add(new ValidationPlugin({
  throwOnInvalid: true,
  onValidationError: (key, value, message) => {
    console.error(`Validation error: ${message}`);
  }
}));

// Создание хранилища с плагинами
const storage = await new MemoryStorage(
  { name: 'app-storage' },
  plugins  // Передаем модуль плагинов
).initialize();
```

#### Жизненный цикл плагинов

Плагины имеют следующие методы жизненного цикла:

1. **Инициализация**: `initialize()` - вызывается при добавлении плагина в хранилище
2. **Операции хранилища**:
    - `onBeforeSet` / `onAfterSet` - до/после сохранения значения
    - `onBeforeGet` / `onAfterGet` - до/после получения значения
    - `onBeforeDelete` / `onAfterDelete` - до/после удаления значения
    - `onClear` - при очистке хранилища
3. **Уничтожение**: `destroy()` - вызывается при удалении плагина или уничтожении хранилища

#### Когда использовать middleware, а когда плагины?

- **Middleware** лучше использовать для:
    - Перехвата всех операций хранилища в одном месте
    - Изменения поведения базовых операций хранилища
    - Оптимизации (батчинг, дедупликация)
    - Синхронизации между хранилищами/вкладками

- **Плагины** лучше использовать для:
    - Обработки конкретных событий хранилища
    - Валидации данных
    - Логирования операций
    - Реализации бизнес-логики, связанной с хранением данных
    - Интеграции с внешними сервисами

## Лицензия

MIT
