> [🏠 Главная](./README.md)
> [🏠 Журнал изменений](../../CHANGELOG.md)
# Дополнительные утилиты и возможности
___

## 🏭 Storage Factory

StorageFactory предоставляет удобный способ создания хранилищ с улучшенной типизацией и поддержкой singleton паттерна.

### Сравнение подходов

```typescript
import { StorageFactory, MemoryStorage } from 'synapse-storage/core'

// Классический подход
const storage1 = await new MemoryStorage({ 
  name: 'test', 
  initialState: { value: 0 } 
}).initialize()

// Новый подход через фабрику (рекомендуемый)
const storage2 = await StorageFactory.createMemory({ 
  name: 'test', 
  initialState: { value: 0 } 
}).initialize()
```

**Преимущества StorageFactory:**
- 📦 Единообразный API для всех типов хранилищ
- 🚀 Возможность динамического выбора типа хранилища

### Готовые шаблоны для использования

```typescript
import { StorageFactory } from 'synapse-storage/core'

// Memory Storage - данные хранятся в памяти
const userStorage = await StorageFactory.createMemory({
  name: 'user',
  singleton: { enabled: true }, // Singleton поддержка
  initialState: { name: '', email: '' }
}).initialize()

// Local Storage - данные в localStorage браузера
const settingsStorage = await StorageFactory.createLocal({
  name: 'settings',
  initialState: { theme: 'light', language: 'ru' }
}).initialize()

// IndexedDB Storage - данные в IndexedDB
const cacheStorage = await StorageFactory.createIndexedDB({
  name: 'cache',
  options: { // Конфигурация IndexedDB
    dbName: 'MyApp',
    version: 1
  },
  initialState: { items: [] }
}).initialize()

// Теперь можно использовать
await userStorage.set('name', 'John Doe')
await settingsStorage.update(state => { state.theme = 'dark' })
```

### Универсальный метод создания

```typescript
// Динамическое создание с указанием типа
const dynamicStorage = await StorageFactory.create({
  name: 'cache',
  type: 'indexedDB', // 'memory' | 'localStorage' | 'indexedDB'
  initialState: { items: [] },
  options: { // Для IndexedDB
    dbName: 'DynamicDB',
    version: 1
  }
}).initialize()

// Готово к использованию!
await dynamicStorage.set('items', [{ id: 1, name: 'Item 1' }])
```

### Singleton хранилища

Singleton позволяет переиспользовать один экземпляр хранилища между разными компонентами:

```typescript
import { ConfigMergeStrategy } from 'synapse-storage/core'

// Компонент A создает singleton
const storage1 = await StorageFactory.createMemory({
  name: 'shared-data',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.DEEP_MERGE, // Стратегия слияния конфигураций
    warnOnConflict: true, // Предупреждать о конфликтах конфигурации
  },
  initialState: { count: 0, user: { name: 'John' } }
}).initialize()

// Компонент B получает тот же экземпляр
const storage2 = await StorageFactory.createMemory({
  name: 'shared-data', // То же имя = тот же экземпляр
  singleton: {
    enabled: true,
  },
  initialState: { count: 5 } // Будет проигнорировано или смержено
}).initialize()

console.log(storage1 === storage2) // true
```

### Стратегии слияния конфигураций

```typescript
// Доступные стратегии слияния
enum ConfigMergeStrategy {
  IGNORE = 'ignore',           // Игнорировать новую конфигурацию
  REPLACE = 'replace',         // Заменить на новую конфигурацию
  SHALLOW_MERGE = 'shallow',   // Поверхностное слияние
  DEEP_MERGE = 'deep'          // Глубокое слияние (по умолчанию)
}
```

### Инициализация Storage Factory хранилищ

```typescript
// StorageFactory создает хранилища синхронно, но требует инициализации
const storage = StorageFactory.createMemory({
  name: 'example',
  initialState: { value: 0 }
})

// Инициализация (асинхронная)
await storage.initialize()

// Теперь можно использовать
await storage.set('value', 100)
```

---

## 🔄 Общие утилиты

### createSynapseAwaiter - Универсальное ожидание готовности

**Назначение:** Ожидание инициализации Synapse в любом JavaScript окружении (Node.js, браузер, React Native, etc.)

**Когда использовать:**
- 🔧 Интеграция с фреймворками кроме React
- 🎯 Точный контроль над моментом использования Synapse
- 🔄 Переиспользование логики ожидания между проектами
- 📱 Разработка для React Native, Electron, Node.js

```typescript
import { createSynapseAwaiter } from 'synapse-storage/core'

const awaiter = createSynapseAwaiter(userMediaSynapse)

// В Angular, Vue, Svelte или ванильном JS
awaiter.onReady(store => {
  console.log('Synapse готов!', store)
  // Инициализируем UI, запускаем логику приложения
})

// Ожидание с обработкой ошибок
try {
  const store = await awaiter.waitForReady()
  // Работаем с готовым store
} catch (error) {
  console.error('Ошибка инициализации:', error)
}

// Синхронная проверка
if (awaiter.isReady()) {
  const store = awaiter.getStoreIfReady()
  // Используем store без ожидания
}
```

---

## ⚛️ React утилиты

### useCreateStorage Hook (v3.0.16+)

Новый хук для создания хранилищ непосредственно в React компонентах:

```tsx
import { useCreateStorage } from 'synapse-storage/react'

function NotificationsComponent() {
  const { 
    storage, 
    isReady, 
    isLoading, 
    hasError, 
    status, 
    initialize, 
    destroy 
  } = useCreateStorage<{ notifications: string[] }>({
    type: 'localStorage',
    name: 'notifications',
    initialState: { notifications: [] },
    // Опционально: singleton настройки
    singleton: {
      enabled: true,
      mergeStrategy: ConfigMergeStrategy.DEEP_MERGE
    }
  }, {
    autoInitialize: true,    // Автоматическая инициализация (по умолчанию)
    destroyOnUnmount: true   // Уничтожение при размонтировании (по умолчанию)
  })

  useEffect(() => {
    if (!isReady || !storage) return

    // Подписка на конкретное поле
    const unsubscribe = storage.subscribe(
      (state) => state.notifications,
      (notifications) => {
        console.log('Notifications updated:', notifications)
      },
    )

    return unsubscribe
  }, [isReady, storage])

  const addNotification = async () => {
    if (storage) {
      await storage.update((state) => {
        state.notifications.push(`Notification ${Date.now()}`)
      })
    }
  }

  // Обработка состояний
  if (hasError) return <div>Ошибка: {status.error?.message}</div>
  if (isLoading) return <div>Инициализация хранилища...</div>
  if (!isReady || !storage) return <div>Хранилище не готово</div>

  return (
    <div>
      <button onClick={addNotification}>Add Notification</button>
      <button onClick={initialize}>Reinitialize</button>
      <button onClick={destroy}>Destroy Storage</button>
    </div>
  )
}
```

### awaitSynapse - Простое ожидание в React

**Назначение:** Простое ожидание готовности Synapse в React без создания контекста

**Когда использовать:**
- 🎯 Простые случаи - нужно только дождаться готовности
- 🔄 Нет необходимости в shared state между компонентами
- ⚡ Быстрое решение для одиночных компонентов

```tsx
import { awaitSynapse } from 'synapse-storage/react'

const userMediaReady = awaitSynapse(userMediaSynapse, {
  loadingComponent: <Spinner />,
  errorComponent: (error) => <ErrorBoundary error={error} />
})

// Простое использование - HOC
const MediaComponent = userMediaReady.withSynapseReady(() => {
  // Synapse гарантированно готов
  return <div>Контент готов к отображению</div>
})

// Или хук для большего контроля
function MyComponent() {
  const { isReady, isError, isPending, store, error } = userMediaReady.useSynapseReady()

  if (isPending) return <div>Загрузка...</div>
  if (isError) return <div>Ошибка: {error?.message}</div>
  
  return <div>Store готов: {store.storage.name}</div>
}
```

### createSynapseCtx - React контекст с расширенными возможностями

**Назначение:** Полнофункциональный React контекст для Synapse с доступом ко всем возможностям

**Когда использовать:**
- 🌐 Нужен shared state между множественными компонентами
- 🎛️ Требуется доступ к actions, selectors, storage в разных частях приложения
- 📊 Работа с реактивными потоками (state$)
- 🏗️ Сложная архитектура с глубоко вложенными компонентами

**Совет:** Если сейчас используете `awaitSynapse`, но в будущем понадобится контекст - просто замените на `createSynapseCtx`. API остается совместимым, но добавляется функциональность React контекста.

```tsx
import { createSynapseCtx } from 'synapse-storage/react'

// Создание контекста
const userMediaCtx = createSynapseCtx(userMediaSynapse, {
  loadingComponent: <div>Загрузка контекста...</div>
})

// Родительский компонент
const App = userMediaCtx.contextSynapse(() => {
  return (
    <div>
      <HeaderComponent />
      <MainComponent />
      <FooterComponent />
    </div>
  )
})

// Дочерние компоненты могут использовать любые хуки
function HeaderComponent() {
  const actions = userMediaCtx.useSynapseActions()
  const selectors = userMediaCtx.useSynapseSelectors()
  
  return <header onClick={() => actions.updateUser(...)}>Header</header>
}

function MainComponent() {
  const storage = userMediaCtx.useSynapseStorage()
  const state$ = userMediaCtx.useSynapseState$() // Только для effects
  
  return <main>Main Content</main>
}
```

---

## 💡 Рекомендации по выбору утилит

### Схема принятия решений:

```
Нужен ли React? 
├─ Нет → createSynapseAwaiter (универсальный)
└─ Да → Нужен ли контекст?
    ├─ Нет → awaitSynapse (простое ожидание)
    └─ Да → createSynapseCtx (полный функционал)
```

### Примеры сценариев:

- **Node.js сервер, Electron:** `createSynapseAwaiter`
- **Простой React компонент:** `awaitSynapse`
- **React приложение с shared state:** `createSynapseCtx`
- **Создание хранилища в компоненте:** `useCreateStorage`

---

## 📚 Навигация

- [🏠 Главная](./README.md)
- [📖 Все разделы документации](./README.md#-документация)

### Все разделы:
- [🚀 Базовое использование](./basic-usage.md)
- [🧮 Вычисляемые селекторы в стиле Redux](./redux-selectors.md)
- [⚙️ Middlewares](./middlewares.md)
- [🌐 API-клиент](./api-client.md)
- [⚡ Создание Диспетчера](./create-dispatcher.md)
- [⚡ Создание Эффектов](./create-effects.md)
- [⚡ Создание Модуля эффектов](./create-effects-module.md)
- [🛠️ Утилита createSynapse](./create-synapse.md)
- [🔌 Создание пользовательских плагинов](./custom-plugins.md)
- [⚙️ Создание пользовательских middlewares](./custom-middlewares.md)
