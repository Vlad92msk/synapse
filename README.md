# Synapse

Synapse — это набор инструментов для управления состоянием + API-клиент.

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

**Владислав** — Frontend Developer (TypeScript, React)

- [LinkedIn](https://www.linkedin.com/in/vlad-firsov/)
- [GitHub](https://github.com/Vlad92msk/)
- [Telegram](https://t.me/Vllad92)

Нахожусь в поиске новых карьерных возможностей 🔎

## Установка

```bash
npm install @vlad92msk/synapse
# или
yarn add @vlad92msk/synapse
# или
pnpm add @vlad92msk/synapse
```

## Быстрый старт

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
} from '@vlad92msk/synapse/core'

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
} from '@vlad92msk/synapse/reactive';

// Инструменты для работы с api
import { ApiClient, ResponseFormat } from '@vlad92msk/synapse/api'

// Несколько инструментов для удобного использования в React
import { useStorageSubscribe, useSelector } from '@vlad92msk/synapse/react'
```

Вот простой пример использования Synapse с React:

```tsx
import { IndexedDBStorage, LocalStorage, MemoryStorage } from '@vlad92msk/synapse/core'
import { useEffect, useState } from 'react'

// Создаем экземпляр хранилища (MemoryStorage / LocalStorage / IndexedDBStorage)
const counterStorage = await new MemoryStorage({
  name: 'counter',
  initialState: { value: 0 }
}).initialize();

function Counter() {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    // Подписываемся на изменения
    return counterStorage.subscribe('value', setCount);
  }, []);
  
  const increment = () => {
    counterStorage.update(state => {
      state.value++;
    });
  };
  
  return (
    <div>
      <p>Счетчик: {count}</p>
      <button onClick={increment}>Увеличить</button>
    </div>
  );
}
```
Более подробные примеры можно найти в src/examples:
- пример использования api-client(api-example.md)
- пример комбинированного использования хранилищ всех типов, демонтсрация возможностей подписок и работы базовых middlewares(base-storage-example.md)
- расширенный пример комплексного использования, включая реактивный подход (pokemons)


## Адаптеры хранилищ

Synapse предоставляет три типа адаптеров хранилищ:

### MemoryStorage

In-memory хранилище для временных данных, которые очищаются при перезагрузке страницы.

```typescript
const memoryStorage = await new MemoryStorage({
  name: 'tempStorage',
}).initialize();
```

### LocalStorage

Хранилище на основе Web Storage API для небольших объемов данных, которые сохраняются между сессиями.

```typescript
const localStorage = await new LocalStorage({
  name: 'appStorage',
}).initialize();
```

### IndexedDBStorage

Хранилище на основе IndexedDB для больших объемов данных и сложных структур.

```typescript
const dbStorage = await new IndexedDBStorage({
  name: 'dbStorage',
  options: {
    dbName: 'myApp',
    storeName: 'main-store',
    dbVersion: 1
  },
}).initialize();
```

## Селекторы

Селекторы предоставляют удобный способ доступа к данным в хранилище:

### Базовые подписки на свойства хранилища

```typescript
// Подписка на конкретное свойство (по пути)
const unsubscribe1 = storage.subscribe('value', (event) => {
  console.log('Новое значение:', event);
});

// Подписка на свойство (через функцию селектора)
const unsubscribe2 = storage.subscribe((state) => state.value, (event) => {
  console.log('Новое значение:', event);
});

// Подписка на вложенные свойства
const unsubscribe3 = storage.subscribe('user.settings.theme', (event) => {
  console.log('Новая тема:', event);
});
```

### Селекторы для вычисляемых значений (в стиле Redux)

```typescript
// Создание модуля селекторов
const counterSelector = new SelectorModule(counterStorage);

// Создание простого селектора
const countValueSelector = counterSelector.createSelector(s => s.value);

// Комбинирование селекторов
const doubledCountSelector = counterSelector.createSelector(
  [countValueSelector],
  count => count * 2
);

// Подписка на изменения вычисляемого значения
doubledCountSelector.subscribe({
  notify: value => console.log('Удвоенное значение:', value)
});

// Одноразовое получение значения
doubledCountSelector.select().then(value => {
  console.log('Текущее удвоенное значение:', value);
});
```

## API-клиент

Synapse включает в себя API-клиент с поддержкой кеширования:

```typescript
const api = new ApiClient({
  // Настройка кеширования запросов
  cacheableHeaderKeys: ['X-Auth-Token'],
  storageType: 'localStorage',
  storageOptions: {
    name: 'api-cache',
    dbName: 'api-cache-db',
    storeName: 'requests',
    dbVersion: 1,
  },
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
import { createDispatcher, loggerDispatcherMiddleware } from '@vlad92msk/synapse/reactive'
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
    // watcher для отслеживания текущего ID
    watchCurrentId: createWatcher({...}),
    // Загрузка покемона по ID
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
  selectorMap,      // Выбор частей состояния с помощью селекторов
  validateMap       // Оператор для удобной работы с запросом
} from '@vlad92msk/synapse/reactive'
import { pokemonEndpoints } from '../api.md'
import { AppConfig } from '../app.config'
import { PokemonDispatcher } from '../pokemon.dispatcher'
import { Pokemon, PokemonState } from '../types'

// Определяем типы для наших эффектов
type PokemonDispatcherType = { pokemonDispatcher: PokemonDispatcher }
type PokemonApiType = { pokemonApi: typeof pokemonEndpoints }

// Эффект для навигации
export const navigationEffect = createEffect<PokemonState, PokemonDispatcherType, PokemonApiType, AppConfig>((action$, state$, { pokemonDispatcher }, _, config) =>
  action$.pipe(
    ofTypes([pokemonDispatcher.dispatch.next, pokemonDispatcher.dispatch.prev]),
    switchMap((action) => {
      const { id } = action.payload
      return of(() => pokemonDispatcher.dispatch.loadPokemon(id))
    }),
  ),
)

// Эффект для отслеживания изменений ID
export const watchIdEffect = createEffect<PokemonState, PokemonDispatcherType, PokemonApiType, AppConfig>((action$, state$, { pokemonDispatcher }) =>
  action$.pipe(
    ofType(pokemonDispatcher.watchers.watchCurrentId),
    selectorMap(
      state$,
      //... selectors
    ),
    // tap(([action, [loading, currentId]]) => {...}),
    mapTo(null),
  ),
)

// Эффект для загрузки данных покемона
export const loadPokemonEffect = createEffect<PokemonState, PokemonDispatcherType, PokemonApiType, AppConfig>((
  action$,                // Поток событий 
  state$,                 // Поток состояния
  { pokemonDispatcher },  // Диспетчеры которые мы передали
  { pokemonApi },         // различные API которые мы передали
  config                   // Конфигурация, которую мы передали
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
Полноценный рабочий пример можно найти в папке src/examples/pokemons
Там показано еще больше возможностей которые дает этот подход.

## Middleware и плагины

Synapse предоставляет две системы расширения функциональности: middleware и плагины. Они выполняют разные роли и имеют разную область применения.

### Middleware

Middleware в Synapse работают по принципу "цепочки обработчиков" и позволяют перехватывать любые операции хранилища. Каждое middleware может модифицировать действия до и после их обработки базовым хранилищем.

```typescript
const storage = await new MemoryStorage({
  name: 'appState',
  middlewares: (getDefaultMiddleware) => {
    const { shallowCompare, batching } = getDefaultMiddleware();
    return [
      // Синхронизация между вкладками браузера
      broadcastMiddleware({
        storageName: 'appState',
        storageType: 'memory',
      }),
      // Предотвращает ненужные обновления при одинаковых значениях
      shallowCompare(),
      // Группирует операции для оптимизации
      batching({ 
        batchSize: 10,       // Максимальное количество операций в батче
        batchDelay: 300,     // Задержка перед обработкой батча (мс)
      }),
    ];
  },
}).initialize();
```

#### Порядок выполнения middleware

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
import { Middleware } from '@vlad92msk/synapse/core';

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
import { IStoragePlugin, StoragePluginModule } from '@vlad92msk/synapse/core';

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
