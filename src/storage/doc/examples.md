# Примеры использования

## 1. Простой счетчик с синхронизацией между вкладками

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

// Базовые селекторы
const counter1Selector = counterSelectors.createSelector(
  (state) => state.counter1
)

const counter2Selector = counterSelectors.createSelector(
  (state) => state.counter2
)

// Комбинированный селектор
const sumSelector = counterSelectors.createSelector(
  [counter1Selector, counter2Selector],
  (counter1, counter2) => counter1 + counter2
)

// React компонент
function CounterApp() {
  const counter1 = useSelector(counter1Selector)
  const counter2 = useSelector(counter2Selector)
  const sum = useSelector(sumSelector)

  const increment1 = () => {
    counterStorage.update((state) => {
      state.counter1 = (state.counter1 || 0) + 1
    })
  }

  const increment2 = () => {
    counterStorage.update((state) => {
      state.counter2 = (state.counter2 || 0) + 1
    })
  }

  return (
    <div>
      <button onClick={increment1}>Counter 1: {counter1}</button>
      <button onClick={increment2}>Counter 2: {counter2}</button>
      <div>Sum: {sum}</div>
    </div>
  )
}
```

## 2. Работа с API и кэшированием

```typescript
// Создание хранилища
export const apiStorage = await new IndexedDBStorage({
  name: 'api-storage',
  options: {
    dbName: 'api-cache',
    storeName: 'responses',
    dbVersion: 1
  },
  middlewares: (getDefaultMiddleware) => {
    const { batching, shallowCompare } = getDefaultMiddleware()
    return [
      batching(),
      shallowCompare(),
      createCacheMiddleware({
        ttl: 1000 * 60 * 30,
        cleanup: {
          enabled: true,
          interval: 1000 * 60 * 60,
        },
        invalidateOnError: true,
        rules: [
          { 
            method: 'fetchUsers',
            tags: ['users'],
            ttl: 1000 * 60 * 5
          }
        ]
      })
    ]
  }
}).initialize()

// Функция загрузки данных
async function loadUsers() {
  // Проверяем кэш
  const cachedUsers = await apiStorage.get('fetchUsers_list')
  
  if (cachedUsers) {
    return cachedUsers
  }
  
  // Загружаем если нет в кэше
  const response = await fetch('/api/users')
  const users = await response.json()
  
  // Сохраняем в кэш
  await apiStorage.set('fetchUsers_list', users)
  
  return users
}

// React компонент
function UserList() {
  const [users, setUsers] = useState([])
  
  useEffect(() => {
    loadUsers().then(setUsers)
  }, [])
  
  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}
```

## 3. Работа с деревом и батчингом

```typescript
// Создание хранилища
export const treeStorage = await new IndexedDBStorage({
  name: 'tree-storage',
  options: {
    dbName: 'tree',
    storeName: 'nodes',
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

const rootNodeSelector = treeSelectors.createSelector(
  (state) => state.root
)

const childrenSelector = treeSelectors.createSelector(
  (state) => state.children
)

// React компонент
function TreeNode({ nodeId }) {
  const node = useSelector(rootNodeSelector)
  const children = useSelector(childrenSelector)
  
  const updateNode = (changes) => {
    treeStorage.update((state) => {
      Object.assign(state.root, changes)
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
        <TreeNode key={child.id} nodeId={child.id} />
      ))}
    </div>
  )
}
```

## Общие рекомендации

1. Используйте правильный тип хранилища для ваших задач
2. Правильно настраивайте middleware под ваши нужды
3. Создавайте простые и понятные селекторы
4. Используйте кэширование для оптимизации запросов к API
5. Группируйте связанные обновления с помощью батчинга