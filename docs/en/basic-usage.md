> [🏠 Home](../../README.md)
> [🏠 Changelog](../../CHANGELOG.md)

# Basic Usage

Imports:
```typescript
// Tools for creating and managing storage
import {
  // Storage types
  MemoryStorage,
  IndexedDBStorage,
  LocalStorage,
  StorageFactory,

  // Storage interfaces
  IStorage,

  // Storage middleware
  broadcastMiddleware,

  // For creating custom storage plugins
  StoragePluginModule,
  IStoragePlugin,
  PluginContext,
  StorageKeyType,

  // For creating custom storage middlewares
  Middleware,
  MiddlewareAPI,
  NextFunction,

  // Module for creating Redux-style computed selectors
  SelectorModule,
  ISelectorModule
} from 'synapse-storage/core'

// Tools for reactive approach (somewhat similar to Redux-Observable)
import { 
  // Tools for creating Dispatcher
  createDispatcher,
  loggerDispatcherMiddleware,

  // Tools for creating Effects (similar to Redux-Observable)
  EffectsModule, 
  combineEffects, 
  createEffect,
  ofType,
  ofTypes,
  selectorMap,
  validateMap
} from 'synapse-storage/reactive';

// Tools for working with API
import { ApiClient, ResponseFormat } from 'synapse-storage/api'

// Several tools for convenient use in React
import { useStorageSubscribe, useSelector, createSynapseCtx } from 'synapse-storage/react'

import { createSynapse } from 'synapse-storage/utils'
```

## Creating Storage

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
  'example1', // Database name in indexDB
  // Tables:
  {
    counter3: {
      name: 'counter3',
      initialState: { value: 99 },
      // eventEmitter: ,
      // initialState: ,
      // middlewares: ,
      // pluginExecutor: ,
    },
    // Other objects (storages in current database)
  }
)
```

> **⚠️ Important (v3.0.16+):** It is recommended to use [StorageFactory](./additional.md#-storage-factory) to create storages, which provides a more convenient API. The examples below show the classic approach.

## Ways to Change Values (Main)

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

## Creating Subscriptions

```jsx
const [counter1Value, setCounter1Value] = useState(0)
const [counter2Value, setCounter2Value] = useState(0)


useEffect(() => {
  // Subscription via callback
  counter1.subscribe((state) => state.value, (value) => {
    setCounter1Value(value)
  })
  // Subscription via path (can be like 'user.settings.theme')
  counter2.subscribe('value', (value) => {
    setCounter2Value(value)
  })

  // Subscribe to all events
  counter1.subscribeToAll((event) => {
    console.log('event', event)
    // Here we get an object:
    // changedPaths:['value'] // all paths where changes were made (['prop1.prop2', 'prop44.prop.555.prop.666'])
    // key:['value'] // Root keys in storage where changes occurred
    // type:"storage:update" // Operation type
    // value: {value: 101} // New state
  })
}, [])
// For React via special selector
const counter3Value = useStorageSubscribe(counter3, (state) => state.value)
```
> **💡 Tip:**
When creating subscriptions using subscribe or subscribeToAll, it's better not to forget to call the unsubscribe function

---

## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### Related sections:
- [🧮 Redux-style computed selectors](./redux-selectors.md)
- [⚙️ Middlewares](./middlewares.md)
- [🛠️ createSynapse utility](./create-synapse.md)
