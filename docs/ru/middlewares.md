> [🏠 Главная](./README.md)
> [🏠 Журнал изменений](../../CHANGELOG.md)

# Middlewares
___

Middleware в Synapse работают по принципу "цепочки обработчиков" и позволяют перехватывать любые операции хранилища. Каждое middleware может модифицировать действия до и после их обработки базовым хранилищем.


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

### Порядок выполнения middleware

Middleware выполняются в порядке их объявления в массиве:
1. Действие проходит через все middleware сверху вниз
2. Затем выполняется базовая операция хранилища
3. Результат проходит через middleware снизу вверх

```
Action → BroadcastMiddleware → ShallowCompare → Batching → Base Operation
Result ← BroadcastMiddleware ← ShallowCompare ← Batching ← Base Operation
```

> **⚠️ Важно:** Порядок middleware имеет значение!
> - `BroadcastMiddleware` должен быть первым для синхронизации между вкладками
> - `ShallowCompare` оптимизирует повторные вызовы
> - `Batching` группирует операции для производительности

___

## 📚 Навигация

- [🏠 Главная](./README.md)
- [📖 Все разделы документации](./README.md#-документация)

### Связанные разделы:
- [🚀 Базовое использование](./basic-usage.md)
- [⚙️ Создание пользовательских middlewares](./custom-middlewares.md)
- [🔌 Создание пользовательских плагинов](./custom-plugins.md)
