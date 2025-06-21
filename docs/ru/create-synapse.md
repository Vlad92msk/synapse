> [🏠 Главная](./README.md)
 
# Пример организации кода и использования утилиты createSynapse

Утилита createSynapse - это всего лишь обертка над всеми модулями, которая связывает их в единое целое.
Вы можете сделать свою, если так будет удобнее.

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
  dependencies: [coreSynapseIDB], // Дождется инициализации coreSynapseIDB
  // Передаем хранилище
  // Это может быть 
  // 1 - Функция, которая возвращает готовое хранилище
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
## Связывание Synapse между собой

### 📊 Обычная связь через dependencies

Как показано на примере выше - вы можете связывать синопсы просто передавая их в массив зависимостей
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

export const currentSynapse = await createSynapse({
  dependencies: [someSynapse1, someSynapse2, someSynapse3], // Дождется инициализации всего, отчего зависит
  //...
})
```

В этом случае общая схема будет выглядеть так:
```mermaid
graph TD
    Core((Core<br/>Synapse))
    UserInfo((UserInfo<br/>Synapse))
    Posts((Posts<br/>Synapse))
    Settings((Settings<br/>Synapse))
    
    Core --> UserInfo
    Core --> Posts
    Core --> Settings
    
```

### 📡 EventBus паттерн (продвинутый)

EventBus паттерн - альтернативный способ связи синопсов между собой
Его главные преимущества - уменьшение связи между модулями и отсутствие проблемы циклических зависимостей, если нужно связать два модуля между собой в обоих направлениях

В этом случае общая схема будет выглядеть так:
```mermaid
graph TD
    EventBus((EventBus<br/>Synapse))
    Auth((Auth<br/>Synapse))
    User((User<br/>Synapse))
    Notifications((Notifications<br/>Synapse))
    
    Auth -.-> EventBus
    User -.-> EventBus
    Notifications -.-> EventBus
    EventBus -.-> Auth
    EventBus -.-> User
    EventBus -.-> Notifications
    
```

### ⚙️ Конфигурация EventBus

```typescript
const appEventBus = await createEventBus({
  name: 'app-events',        // Имя для отладки и логирования
  autoCleanup: true,         // Автоматическая очистка старых событий
  maxEvents: 500            // Максимальное количество событий в памяти
})
```

#### 🔧 Основные методы

- publish() - публикация события с данными и метаданными
- subscribe() - подписка на события с поддержкой паттернов ('USER_*', '*')
- getEventHistory() - получение истории событий определенного типа
- clearEvents() - очистка событий (всех или старше определенного времени)
- getActiveSubscriptions() - список активных подписок

#### 💡 Практические советы

- Именование событий: используйте формат 'MODULE_ACTION' (например, 'USER_LOGGED_IN', 'ORDER_CREATED')
- Паттерны: 'USER_*' для всех пользовательских событий, '*' для глобального мониторинга
- Приоритеты: 'high' для критичных событий, 'normal' для обычных, 'low' для логирования

```typescript
// Создание EventBus с помощью утилиты
import { createEventBus } from 'synapse-storage/utils'

export const appEventBus = await createEventBus({
  name: 'app-events',
  autoCleanup: true,
  maxEvents: 500
})

// auth.synapse.ts
export const authSynapse = await createSynapse({
  dependencies: [appEventBus], // Подключаем EventBus
  createEffectConfig: (authDispatcher) => ({
    dispatchers: {
      authDispatcher,
      eventBus: appEventBus.dispatcher
    }
  }),
  effects: [
    // Effect для публикации событий при успешной авторизации
    createEffect((action$, state$, _, { authDispatcher, eventBus }) => 
      action$.pipe(
        ofType(authDispatcher.dispatch.loginSuccess),
        map(action => 
          eventBus.dispatch.publish({
            event: 'USER_LOGGED_IN',
            data: action.payload,
            metadata: { priority: 'high' }
          })
        )
      )
    )
  ]
})

// user.synapse.ts
export const userSynapse = await createSynapse({
  dependencies: [appEventBus], // Подключаем EventBus
  createEffectConfig: (userDispatcher) => ({
    dispatchers: {
      userDispatcher,
      eventBus: appEventBus.dispatcher
    }
  }),
  effects: [
    // Effect для подписки на события авторизации
    createEffect((action$, state$, _, { userDispatcher, eventBus }) => {
      // Подписываемся на события входa пользователя
      eventBus.dispatch.subscribe({
        eventPattern: 'USER_*', // Поддержка паттернов
        handler: (userData, event) => {
          if (event.event === 'USER_LOGGED_IN') {
            userDispatcher.dispatch.loadUserProfile(userData.id)
          }
        },
        options: { priority: 'high' } // Фильтрация по приоритету
      })
      
      return EMPTY // Этот effect только устанавливает подписку
    })
  ]
})

// notifications.synapse.ts
export const notificationsSynapse = await createSynapse({
  dependencies: [appEventBus],
  createEffectConfig: (notificationsDispatcher) => ({
    dispatchers: {
      notificationsDispatcher,
      eventBus: appEventBus.dispatcher
    }
  }),
  effects: [
    // Подписка на все события для показа уведомлений
    createEffect((action$, state$, _, { notificationsDispatcher, eventBus }) => {
      eventBus.dispatch.subscribe({
        eventPattern: '*', // Слушаем все события
        handler: (data, event) => {
          notificationsDispatcher.dispatch.showNotification({
            message: `Событие: ${event.event}`,
            data
          })
        }
      })
      
      return EMPTY
    })
  ]
})
```

### 🎯 Преимущества каждого подхода

#### Dependencies (Обычный)
- ✅ Простота понимания
- ✅ Прямые связи между модулями
- ✅ TypeScript типизация из коробки
- ❌ Жесткая связанность модулей
- ❌ Сложность при большом количестве связей

#### EventBus (Продвинутый)
- ✅ Слабая связанность модулей
- ✅ Легкость добавления новых модулей
- ✅ Централизованное управление событиями
- ✅ Возможность отладки всех событий в одном месте
- ✅ Поддержка паттернов событий ('USER_*', '*')
- ✅ Фильтрация по приоритету и метаданным
- ✅ Автоматическая очистка старых событий
- ❌ Сложность отслеживания потока данных
- ❌ Необходимость ручной типизации событий

## 📚 Навигация

- [🏠 Главная](./README.md)
- [📖 Все разделы документации](./README.md#-документация)

### Связанные разделы:
- [🚀 Базовое использование](./basic-usage.md)
- [⚡ Создание Диспетчера](./create-dispatcher.md)
- [⚡ Создание Эффектов](./create-effects.md)
- [🧮 Вычисляемые селекторы в стиле Redux](./redux-selectors.md)
- [🌐 API-клиент](./api-client.md)
