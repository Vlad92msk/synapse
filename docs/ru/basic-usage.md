> [🏠 Главная](./README.md)
> [🏠 Журнал изменений](../../CHANGELOG.md)

# Базовое использование

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

## Создание хранилищ

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


## Способы изменения значений (основные)

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

## Создание подписок

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
    // changedPaths:['value'] // все пути, по которым были вызваны изменения (['prop1.prop2', 'prop44.prop.555.prop.666'])
    // key:['value'] // Корневые ключи в хранилище, в которых были изменения
    // type:"storage:update" // Тип операции
    // value: {value: 101} // Новый state
  })
}, [])
// Для React через специальный селектор
const counter3Value = useStorageSubscribe(counter3, (state) => state.value)
```
> **💡 Совет:**
При создании подписок с помощью subscribe или subscribeToAll лучше не забывать вызывать функцию отписки

---

## 📚 Навигация

- [🏠 Главная](./README.md)
- [📖 Все разделы документации](./README.md#-документация)

### Связанные разделы:
- [🧮 Вычисляемые селекторы в стиле Redux](./redux-selectors.md)
- [⚙️ Middlewares](./middlewares.md)
- [🛠️ Утилита createSynapse](./create-synapse.md)
