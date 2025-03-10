# Адаптеры хранилищ

Synapse Storage поддерживает три типа хранилищ данных:

## MemoryStorage

In-memory хранилище для временных данных. Данные очищаются при перезагрузке страницы.

```typescript
const memoryStorage = await new MemoryStorage({
  name: 'tempStorage',
}).initialize()
```

## LocalStorage

Хранилище на основе Web Storage API. Подходит для небольших объемов данных, которые нужно сохранять между сессиями.

```typescript
const localStorage = await new LocalStorage({
  name: 'appStorage',
}).initialize()
```

## IndexedDBStorage

Хранилище на основе IndexedDB. Подходит для больших объемов данных и сложных структур.

```typescript
const dbStorage = await new IndexedDBStorage({
  name: 'dbStorage',
  options: {
    dbName: 'myApp',
    storeName: 'main-store',
    dbVersion: 1
  },
}).initialize()
```

## Сравнение адаптеров

| Особенность | MemoryStorage | LocalStorage | IndexedDBStorage |
|-------------|---------------|--------------|------------------|
| Персистентность | ❌ | ✅ | ✅ |
| Объем данных | Ограничен памятью | ~5-10 MB | >50 MB |
| Скорость | Очень быстро | Быстро | Средне |
| Сложные структуры | ✅ | ❌ | ✅ |
| Асинхронность | ✅ | ✅ | ✅ |
| Транзакции | ❌ | ❌ | ✅ |

## Работа с ключами

Все адаптеры поддерживают:
- Простые строковые ключи: `'user'`
- Вложенные пути: `'users.john.settings'`
- Сырые ключи для специальных случаев: `new StorageKey('rawKey', true)`

## Middlewares


```typescript
import { broadcastMiddleware, MemoryStorage } from 'synapse'

const counter = await new MemoryStorage<Counter>({
  name: 'counter',
  initialState: { value: 0 },
  middlewares: (getDefaultMiddleware) => {
    const { shallowCompare, batching } = getDefaultMiddleware()
    return [
      // Синхронизирует состояние между вкладками браузера
      broadcastMiddleware({
        storageName: 'counter',
        storageType: 'memory',
      }),
      // Предотвращает ненужные обновления при одинаковых значениях.
      shallowCompare(),
      // Группирует множественные операции в один батч для оптимизации производительности.
      batching({
        batchSize: 10,      // Размер батча
        batchDelay: 300,    // Задержка в мс
      }),
    ]
  },
}).initialize()
```

Порядок важен.
Если используется broadcastMiddleware - она должна идти первой чтобы при открытии новой вкладки браузера взять значение как первоначальное.

## Порядок выполнения middleware

Middleware выполняются в порядке их объявления в массиве:
1. Каждый новый middleware оборачивает предыдущие
2. Действие проходит через все middleware сверху вниз
3. Результат проходит через middleware снизу вверх

```
Action → Middleware1 → Middleware2 → Middleware3 → Base Operation
Result ← Middleware1 ← Middleware2 ← Middleware3 ← Base Operation
```

## Создание собственного middleware

```typescript
import { Middleware } from 'synapse'

const customMiddleware = (): Middleware => ({
  name: 'custom',
  
  // Инициализация
  setup: (api) => {
    // ...
  },
  
  // Обработка действий
  reducer: (api) => (next) => async (action) => {
    // До выполнения действия
    const result = await next(action)
    // После выполнения действия
    return result
  },
  
  // Очистка при уничтожении
  cleanup: () => {
    // ...
  }
})
```

## Плагины
```typescript
import { MemoryStorage, StoragePluginModule, ILogger } from 'synapse'

// Сначала создаем модуль плагинов
const plugins = new StoragePluginModule(
  undefined,     // Родительский модуль плагинов если есть (сначала выполнится операция оттуда, затем из текущего модуля)
  console,      // Логгер (Любой логгер имплемкентирующий ILogger)
  'demoStorage' // Названия хранилища к которому относится данный модуль плагинов (пока не уверен что это будет нужно в будущем)
)

// Реализуем сам плагин
export class ValidationPlugin implements IStoragePlugin {
  //...
}

// Создаем плагин валидации с обработчиком ошибок
const validation = new ValidationPlugin({
  throwOnInvalid: true,
  onValidationError: (key, value, message) => {
  //...
  },
})

// Настраиваем правила валидации
validation.addValidator('user', (value) => {
  //...
  return { valid: true }
})

// Добавляем плагины
await plugins.add(validation)
await plugins.add(new LoggingPlugin({ logLevel: 'debug' }))

// Создаем хранилище
const storage = await new MemoryStorage<{user?: User}>(
  { name: 'demo' },
  // Передаем модуль плагинов в Хранилище  
  plugins
).initialize()
```

## Подписки, операции сохранения

```typescript
import { useEffect, useState } from 'react'
import { MemoryStorage } from 'synapse'

interface Counter {
  value: number
}

const counter = await new MemoryStorage<Counter>({
  name: 'counter',
  initialState: { value: 1 },
}).initialize()

// Подписка на все изменения в данном хранилище
const unsubscribeToAll = counter.subscribeToAll((event) => {
  const { key, type, value } = event
  console.log('subscribeToAll', type, key, value)
})
// Подписка на конкретное значение (первый параметр - колбэк)
const unsubscribe1 = counter.subscribe((state) => state.value, (event) => {
  console.log('subscribe by callback', event)
})
// Подписка на конкретное значение (первый параметр - путь до свойства)
const unsubscribe2 = counter.subscribe('value', (event) => {
  console.log('subscribe by path', event)
})


// update
await counter.update((state) => {
  state.value++
})
// set
await counter.set('value', currentValue + 1)

// Поддерживается составной ключ
await counter.set('prop1.prop2.prop3[0].prop4', currentValue + 1)

// Но тогда подписка должна быть аналогичная
const unsubscribe3 = counter.subscribe('prop1.prop2.prop3[0].prop4', (event) => {
  console.log('subscribe by path', event)
})
// или
const unsubscribe4 = counter.subscribe((state) => state.prop1.prop2.prop3[0].prop4, (event) => {
  console.log('subscribe by path', event)
})

```


Базовый пример
```typescript
'use client'

import { useEffect, useState } from 'react'
import { IndexedDBStorage, LocalStorage, MemoryStorage } from 'synapse'

interface Counter {
  value: number
}

const counter1 = await new MemoryStorage<Counter>({
  name: 'counter1',
  initialState: { value: 1 },
}).initialize()

const counter2 = await new IndexedDBStorage<Counter>({
  name: 'counter2',
  options: {
    dbVersion: 2,
    storeName: 'counter2',
    dbName: 'counter2',
  },
  initialState: { value: 2 },
}).initialize()

const counter3 = await new LocalStorage<Counter>({
  name: 'counter3',
  initialState: { value: 3 },
}).initialize()

// Подписка на все изменения в данном хранилище
counter2.subscribeToAll((event) => {
  const { key, type, value } = event
  console.log('counter1.subscribeToAll', type, key, value)
})
// Подписка на конкретное значение (первый параметр - колбэк)
counter2.subscribe((s) => s.value, (event) => {
  console.log('counter1.subscribe--1', event)
})
// Подписка на конкретное значение (первый параметр - путь до свойства)
counter2.subscribe('value', (event) => {
  console.log('counter1.subscribe--2', event)
})

// React компонент
export function TestCounter() {
  const [counterValue1, setCounterValue1] = useState(0)
  const [counterValue2, setCounterValue2] = useState(0)
  const [counterValue3, setCounterValue3] = useState(0)

  useEffect(() => {
    counter1.subscribe('value', setCounterValue1)
  }, [])
  useEffect(() => {
    counter2.subscribe((s) => s.value, setCounterValue2)
  }, [])
  useEffect(() => {
    counter3.subscribe((s) => s.value, setCounterValue3)
  }, [])

  const updateCounter1 = async () => {
    await counter1.update((state) => {
      state.value++
    })
  }
  const updateCounter2 = async () => {
    await counter2.set('value', counterValue2 + 1)
  }
  const updateCounter3 = async () => {
    await counter3.update((state) => state.value++)
  }

  return (
    <div style={{ display: 'flex', gap: '50px'}}>
        <button onClick={updateCounter1}>{counterValue1}</button>
        <button onClick={updateCounter2}>{counterValue2}</button>
        <button onClick={updateCounter3}>{counterValue3}</button>
    </div>
  )
}

```
