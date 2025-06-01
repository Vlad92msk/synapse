> [🏠 Home](../../README.md)

# Middlewares
___

Middlewares in Synapse work on the principle of "handler chain" and allow intercepting any storage operations. Each middleware can modify actions before and after their processing by the base storage.


```typescript
const counter1 = await new MemoryStorage<Counter>({
  name: 'counter1',
  initialState: {
    value: 100,
  },
  middlewares: () => {
    const broadcast = broadcastMiddleware({
      storageType: 'memory',  // <-- Important to specify storage type correctly
      storageName: 'counter1' // <-- It's recommended to specify storage name correctly
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
    // Shallow comparison
    const updateCounter2 = async () => {
        await counter2.set('value', counter2ValueSelectorValue! + 1) // This will be applied
        await counter2.set('value', counter2ValueSelectorValue! + 1) // |
        await counter2.set('value', counter2ValueSelectorValue! + 1) // | Won't be called as payload hasn't changed
        await counter2.set('value', counter2ValueSelectorValue! + 1) // |
        await counter2.set('value', counter2ValueSelectorValue! + 1) // |
    }

    // Batching
    // !! works only for methods without await
    const updateCounter3 = async () => {
        counter3.set('value', counter3ValueSelectorValue! + 1) // | ignored 
        counter3.set('value', counter3ValueSelectorValue! + 1) // | ignored
        counter3.set('value', counter3ValueSelectorValue! + 1) // | ignored 
        counter3.set('value', counter3ValueSelectorValue! + 1) // | ignored 
        counter3.set('value', counter3ValueSelectorValue! + 10)// | < --- only this will be applied
    }
```

### Middleware Execution Order

Middlewares are executed in the order they are declared in the array:
1. Action goes through all middlewares from top to bottom
2. Then the base storage operation is executed
3. Result goes through middlewares from bottom to top

```
Action → BroadcastMiddleware → ShallowCompare → Batching → Base Operation
Result ← BroadcastMiddleware ← ShallowCompare ← Batching ← Base Operation
```

> **⚠️ Important:** Middleware order matters!
> - `BroadcastMiddleware` should be first for tab synchronization
> - `ShallowCompare` optimizes repeated calls
> - `Batching` groups operations for performance

___

## 📚 Navigation

- [🏠 Home](../../README.md)
- [📖 All documentation sections](../../README.md#-documentation)

### Related sections:
- [🚀 Basic usage](./basic-usage.md)
- [⚙️ Creating custom middlewares](./custom-middlewares.md)
- [🔌 Creating custom plugins](./custom-plugins.md)
