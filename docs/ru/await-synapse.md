# awaitSynapse

> [Назад к оглавлению](./README.md)

React-утилита для ожидания готовности хранилища Synapse. HOC + хук + программный API.

## Создание

```typescript
import { awaitSynapse } from 'synapse-storage/react'
import { createSynapse } from 'synapse-storage/utils'

// Инициализация хранилища может занять время (IndexedDB, загрузка с сервера и т.д.)
const storePromise = createSynapse({
  createStorageFn: async () => {
    const data = await fetch('/api/config').then((r) => r.json())
    const storage = new MemoryStorage({ name: 'config', initialState: data })
    await storage.initialize()
    return storage
  },
  createSelectorsFn: (sm) => ({ ... }),
  createDispatcherFn: (storage) => createDispatcher({ storage }, ...),
})

// Создаём awaiter
const awaiter = awaitSynapse(storePromise, {
  loadingComponent: <div>Loading...</div>,
  errorComponent: (error) => <div>Error: {error.message}</div>,
})
```

## withSynapseReady (HOC)

```typescript
// HOC: показывает loadingComponent, пока хранилище не готово
// Компонент рендерится ТОЛЬКО когда хранилище полностью инициализировано

function MyComponent() {
  // Хранилище гарантированно готово — можно безопасно использовать
  const store = awaiter.getStoreIfReady()!
  const value = useSelector(store.selectors.someValue)

  return <div>{value}</div>
}

// Оборачиваем
const MyComponentWithReady = awaiter.withSynapseReady(MyComponent)

// В JSX — сначала покажет загрузку, затем компонент:
<MyComponentWithReady />
```

## useSynapseReady (хук)

```typescript
// Хук для ручного контроля готовности

function StatusPanel() {
  const { isReady, isPending, isError, store, error } = awaiter.useSynapseReady()

  if (isPending) return <div>Loading...</div>
  if (isError)   return <div>Error: {error?.message}</div>
  if (isReady)   return <div>Store ready! State: {JSON.stringify(store.storage.getStateSync())}</div>
}

// Поля возвращаемого объекта:
// isReady:   boolean — хранилище инициализировано
// isPending: boolean — ожидание инициализации
// isError:   boolean — ошибка инициализации
// store:     SynapseStore | undefined
// error:     Error | null
```

## Программный API

```typescript
// Можно использовать вне React-компонентов

// Синхронные проверки
awaiter.isReady()         // boolean
awaiter.getStatus()       // 'pending' | 'ready' | 'error'
awaiter.getError()        // Error | null
awaiter.getStoreIfReady() // store | undefined

// Асинхронное ожидание
const store = await awaiter.waitForReady()

// Колбэки (возвращают функцию отписки)
const unsub = awaiter.onReady((store) => {
  console.log('Store ready!', store.storage.getStateSync())
})

const unsub2 = awaiter.onError((error) => {
  console.error('Init failed:', error.message)
})

// Если хранилище уже готово — onReady срабатывает немедленно

// Очистка
awaiter.destroy()
```

## Связь с createSynapseAwaiter

```typescript
// awaitSynapse — React-обёртка над createSynapseAwaiter
// Добавляет: withSynapseReady (HOC) и useSynapseReady (хук)
// Проксирует: waitForReady, isReady, getStoreIfReady, onReady, onError, getStatus, getError, destroy

// Для vanilla JS / Node.js / без React — используйте createSynapseAwaiter напрямую:
import { createSynapseAwaiter } from 'synapse-storage/utils'
const awaiter = createSynapseAwaiter(storePromise)
// Тот же программный API, но без React-хуков
```
