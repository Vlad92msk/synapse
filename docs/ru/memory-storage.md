# MemoryStorage

> [Назад к оглавлению](./README.md)

Хранилище в оперативной памяти. Данные существуют только пока открыта страница. Синхронный API.

## Создание

```typescript
import { MemoryStorage } from 'synapse-storage/core'

interface CounterState {
  count: number
  label: string
}

// Через new
const storage = new MemoryStorage<CounterState>({
  name: 'memory-counter',
  initialState: { count: 0, label: 'clicks' },
})

// Или через статический .create()
const storage = MemoryStorage.create<CounterState>({
  name: 'memory-counter',
  initialState: { count: 0, label: 'clicks' },
})

// Инициализация (обязательна)
await storage.initialize()
```

## Запись данных

```typescript
// set() — установить значение по ключу
storage.set('count', 5)
storage.set('label', 'taps')

// update() — изменить несколько полей сразу (в стиле immer)
storage.update((s) => {
  s.count += 10
  s.label = 'updated'
})
```

## Чтение данных

```typescript
// get() — получить значение по ключу
const count = storage.get<number>('count')     // 5
const label = storage.get<string>('label')     // 'clicks'

// getState() — получить всё состояние целиком
const state = storage.getState()               // { count: 5, label: 'clicks' }

// getStateSync() — то же самое для синхронных хранилищ
const state = storage.getStateSync()           // { count: 5, label: 'clicks' }
```

## Проверка, удаление, сброс

```typescript
// has() — проверить наличие ключа
storage.has('count')   // true
storage.has('unknown') // false

// keys() — получить список ключей
storage.keys()         // ['count', 'label']

// remove() — удалить конкретный ключ
storage.remove('label')

// clear() — очистить всё хранилище (state = {})
storage.clear()

// reset() — сбросить к initialState
storage.reset()        // state = { count: 0, label: 'clicks' }
```

## Подписки

```typescript
// Подписка на конкретный ключ
const unsub = storage.subscribe('count', (newValue) => {
  console.log('count изменился:', newValue)
})

// Подписка через path-селектор
const unsub = storage.subscribe(
  (state) => state.count,
  (newCount) => console.log('count:', newCount)
)

// Подписка на все изменения
const unsub = storage.subscribeToAll((event) => {
  console.log('изменено:', event)
})

// Отписка
unsub()
```

## Жизненный цикл

```typescript
// Инициализация
await storage.initialize()

// Ожидание готовности
await storage.waitForReady()

// Статус
storage.initStatus  // { status: 'ready' }

// Подписка на изменения статуса
const unsub = storage.onStatusChange((status) => {
  console.log(status) // { status: 'ready' | 'loading' | 'error' | 'idle' }
})

// Уничтожение
await storage.destroy()
```
