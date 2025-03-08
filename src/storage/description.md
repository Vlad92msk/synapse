# Storage Module

Storage - это мощный модуль управления состоянием с поддержкой различных типов хранилищ, middleware и оптимизаций.

## Основные возможности

- **Различные типы хранилищ**: MemoryStorage, LocalStorage, IndexedDBStorage
- **Система middleware** для расширения функциональности
- **Селекторы** для удобного доступа к данным
- **Кэширование** с гибкими правилами
- **Батчинг операций** для оптимизации производительности
- **Синхронизация между вкладками** через Broadcast Channel API
- **Оптимизации рендеринга** через shallow compare
- **Типизация** через TypeScript

## Инициализация

```typescript
export const myStorage = await new IndexedDBStorage({
  name: 'appStorage',
  options: {
    dbName: 'myApp',
    storeName: 'main-store',
    dbVersion: 1
  },
  middlewares: (getDefaultMiddleware) => {
    const { batching, shallowCompare } = getDefaultMiddleware()
    return [
      batching(),
      shallowCompare(),
      broadcastMiddleware({
        storageType: 'indexedDB',
        storageName: 'appStorage'
      }),
      createCacheMiddleware({
        ttl: 1000 * 60 * 30, // 30 минут
        cleanup: {
          enabled: true,
          interval: 1000 * 60 * 60, // 1 час
        },
        invalidateOnError: true,
        rules: [
          { 
            method: 'fetchPokemon', // Имя метода/функции
            tags: ['pokemon'],
            ttl: 1000 * 60 * 5 // 5 минут
          }
        ]
      })
    ]
  }
}).initialize()
```

## API

### Основные методы хранилища

```typescript
// Получение значения
const value = await storage.get('key')

// Установка значения
await storage.set('key', value)

// Обновление состояния
await storage.update((state) => {
  state.counter += 1
})

// Проверка наличия ключа
const exists = await storage.has('key')

// Удаление значения
await storage.delete('key')

// Очистка хранилища
await storage.clear()

// Получение всех ключей
const keys = await storage.keys()

// Уничтожение хранилища
await storage.destroy()
```

### Работа с селекторами

```typescript
// Создание модуля селекторов
const storageSelectors = new SelectorModule(storage)

// Создание простого селектора
const counterSelector = storageSelectors.createSelector(
  (state) => state.counter
)

// Создание комбинированного селектора
const userWithPostsSelector = storageSelectors.createSelector(
  [
    (state) => state.users[userId],
    (state) => state.posts.filter(p => p.userId === userId)
  ],
  (user, posts) => ({
    ...user,
    posts
  })
)

// Подписка на селектор
counterSelector.subscribe({
  notify: (value) => {
    console.log('Counter changed:', value)
  }
})

// React хук для селекторов
function Counter() {
  const count = useSelector(counterSelector)
  return <div>{count}</div>
}
```

## Примеры использования

### Простой счетчик с broadcast

```typescript
// Создание хранилища
export const counterStorage = await new IndexedDBStorage({
  name: 'counter-storage',
  options: {
    dbName: 'counter',
    storeName: 'counter',
    dbVersion: 1
  },
  middlewares: (getDefaultMiddleware) => {
    const { batching, shallowCompare } = getDefaultMiddleware()
    return [
      batching(),
      shallowCompare(),
      broadcastMiddleware({
        storageType: 'indexedDB',
        storageName: 'counter-storage'
      })
    ]
  }
}).initialize()

// Создание селекторов
const counterSelectors = new SelectorModule(counterStorage)

// Простые селекторы для каждого счетчика
const counter1Selector = counterSelectors.createSelector(
  (state) => state.counter1 ?? 0
)

const counter2Selector = counterSelectors.createSelector(
  (state) => state.counter2 ?? 0
)

// Комбинированные селекторы
// 1. Сумма двух счетчиков
const sumSelector = counterSelectors.createSelector(
  [counter1Selector, counter2Selector],
  (counter1, counter2) => counter1 + counter2
)

// 2. Селектор с дополнительными вычислениями
const statsSelector = counterSelectors.createSelector(
  [counter1Selector, counter2Selector],
  (counter1, counter2) => ({
    sum: counter1 + counter2,
    max: Math.max(counter1, counter2),
    min: Math.min(counter1, counter2),
    average: (counter1 + counter2) / 2
  })
)

// 3. Селектор, зависящий от другого комбинированного селектора
const isEvenSumSelector = counterSelectors.createSelector(
  [sumSelector],
  (sum) => sum % 2 === 0
)

// 4. Сложный селектор с множественными зависимостями
const analyticsSelector = counterSelectors.createSelector(
  [counter1Selector, counter2Selector, sumSelector, statsSelector],
  (counter1, counter2, sum, stats) => ({
    counters: { counter1, counter2 },
    total: sum,
    stats,
    difference: Math.abs(counter1 - counter2),
    isBalanced: counter1 === counter2
  })
)

// React компоненты
function CounterButton({ counterId }: { counterId: 1 | 2 }) {
  const selector = counterId === 1 ? counter1Selector : counter2Selector
  const count = useSelector(selector)

  const increment = () => {
    counterStorage.update((state) => {
      const key = `counter${counterId}`
      state[key] = (state[key] || 0) + 1
    })
  }

  return (
    <button onClick={increment}>
      Counter {counterId}: {count}
  </button>
)
}

function CounterStats() {
  const stats = useSelector(statsSelector)
  const isEvenSum = useSelector(isEvenSumSelector)

  return (
    <div>
      <div>Sum: {stats.sum}</div>
      <div>Max: {stats.max}</div>
      <div>Min: {stats.min}</div>
      <div>Average: {stats.average}</div>
      <div>Sum is {isEvenSum ? 'even' : 'odd'}</div>
  </div>
)
}

function CounterAnalytics() {
  const analytics = useSelector(analyticsSelector)

  return (
    <div>
      <h3>Analytics</h3>
    <div>Counter 1: {analytics.counters.counter1}</div>
      <div>Counter 2: {analytics.counters.counter2}</div>
      <div>Total: {analytics.total}</div>
      <div>Difference: {analytics.difference}</div>
      <div>Is Balanced: {analytics.isBalanced ? 'Yes' : 'No'}</div>
    <div>
      <h4>Stats</h4>
      <div>Max: {analytics.stats.max}</div>
      <div>Min: {analytics.stats.min}</div>
      <div>Average: {analytics.stats.average}</div>
      </div>
    </div>
  )
}

// Главный компонент
function CounterApp() {
  return (
    <div>
      <div>
        <CounterButton counterId={1} />
        <CounterButton counterId={2} />
      </div>
      <CounterStats />
      <CounterAnalytics />
    </div>
  )
}


```

### Работа с API и кэшированием

```typescript
// Создание хранилища
export const pokemonStorage = await new IndexedDBStorage({
  name: 'pokemon-storage',
  options: {
    dbName: 'pokemons',
    storeName: 'pokemons-api',
    dbVersion: 1
  },
  middlewares: (getDefaultMiddleware) => {
    const { batching, shallowCompare } = getDefaultMiddleware()
    return [
      batching(),
      shallowCompare(),
      createCacheMiddleware({
        ttl: 1000 * 60 * 30, // 30 минут
        cleanup: {
          enabled: true,
          interval: 1000 * 60 * 60, // 1 час
        },
        invalidateOnError: true,
        rules: [
          { 
            method: 'fetchPokemon',
            tags: ['pokemon'],
            ttl: 1000 * 60 * 5 // 5 минут
          }
        ]
      })
    ]
  }
}).initialize()

// Создание селекторов
const pokemonSelectors = new SelectorModule(pokemonStorage)
const pokemonByIdSelector = (id: number) => pokemonSelectors.createSelector(
  state => state[`pokemon-${id}`]
)

// React компонент
function PokemonCard({ id }) {
  const pokemon = useSelector(pokemonByIdSelector(id))

  useEffect(() => {
    async function loadPokemon() {
      if (!pokemon) {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
        const data = await response.json()
        
        // Используем метод как ключ для правила кэширования
        await pokemonStorage.set(`fetchPokemon_${id}`, data)
      }
    }

    loadPokemon()
  }, [id, pokemon])

  if (!pokemon) return <div>Loading...</div>
  
  return (
    <div>
      <h2>{pokemon.name}</h2>
      {/* ... */}
    </div>
  )
}
```

### Работа с древовидными данными

```typescript
// Создание хранилища
export const treeStorage = await new IndexedDBStorage({
  name: 'tree-storage',
  options: {
    dbName: 'tree',
    storeName: 'tree-data',
    dbVersion: 1
  },
  middlewares: (getDefaultMiddleware) => {
    const { batching, shallowCompare } = getDefaultMiddleware()
    return [
      batching({
        batchSize: 5,
        batchDelay: 300
      }),
      shallowCompare()
    ]
  }
}).initialize()

// Создание селекторов
const treeSelectors = new SelectorModule(treeStorage)

const nodeSelector = (id: string) => treeSelectors.createSelector(
  state => state.nodes[id]
)

const nodeChildrenSelector = (id: string) => treeSelectors.createSelector(
  [
    nodeSelector(id),
    state => state.nodes
  ],
  (node, nodes) => node?.childIds?.map(childId => nodes[childId]) || []
)

// React компонент
function TreeNode({ id }) {
  const node = useSelector(nodeSelector(id))
  const children = useSelector(nodeChildrenSelector(id))

  const updateNode = (changes) => {
    treeStorage.update((state) => {
      Object.assign(state.nodes[id], changes)
    })
  }

  if (!node) return null

  return (
    <div>
      <input
        value={node.name}
        onChange={(e) => updateNode({ name: e.target.value })}
      />
      {children?.map(child => (
        <TreeNode key={child.id} id={child.id} />
      ))}
    </div>
  )
}
```

## Лучшие практики

1. **Правильная структура хранилища**:
   - Используйте нормализованные данные
   - Группируйте связанные данные
   - Избегайте глубокой вложенности

2. **Эффективное использование селекторов**:
   - Создавайте селекторы для повторно используемых запросов
   - Используйте композицию селекторов
   - Мемоизируйте сложные вычисления

3. **Оптимизация производительности**:
   - Настраивайте batching под ваши нужды
   - Используйте shallowCompare
   - Правильно настраивайте правила кэширования

4. **Работа с кэшем**:
   - Используйте осмысленные имена методов
   - Группируйте связанные данные тегами
   - Настраивайте TTL под бизнес-требования

## Отладка

```typescript
// Подписка на все события
storage.subscribeToAll((event) => {
  console.log('[Storage Event]', {
    type: event.type,
    key: event.key,
    value: event.value,
    metadata: event.metadata
  })
})

// Отслеживание селекторов
mySelector.subscribe({
  notify: (value) => {
    console.log('Selector value:', value)
  }
})
```
