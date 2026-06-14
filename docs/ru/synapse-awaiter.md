# createSynapseAwaiter — Фреймворк-агностик awaiter

> [Назад к оглавлению](./README.md)

Обёртка для ожидания асинхронной инициализации store. Работает в любом JS-окружении: Node.js, браузер, React Native.

## Импорты

```typescript
import { createSynapse, createSynapseAwaiter } from 'synapse-storage/utils'
```

## Создание

```typescript
// createSynapseAwaiter принимает handle (thenable), Promise<SynapseStore> или готовый store

// Вариант 1: ленивый handle (типичный случай — async-инициализация в фабрике)
const configSynapse = createSynapse(async () => {
  const config = await fetch('/api/config').then((r) => r.json())
  const storage = new MemoryStorage<ConfigState>({ name: 'app-config', initialState: config })
  return { storage, selectors: new ConfigSelectors(storage) }
})

const awaiter = createSynapseAwaiter(configSynapse)

// Вариант 2: уже готовый store
const readyStore = await configSynapse
const awaiter2 = createSynapseAwaiter(readyStore)
```

## isReady() / getStatus() / getError()

```typescript
// Синхронная проверка готовности
awaiter.isReady()     // boolean

// Текущий статус
awaiter.getStatus()   // 'pending' | 'ready' | 'error'

// Ошибка инициализации (если есть)
awaiter.getError()    // Error | null
```

## getStoreIfReady()

```typescript
// Возвращает store если готов, или undefined
const store = awaiter.getStoreIfReady()

if (store) {
  // SynapseStore — тип зависит от конфигурации createSynapse:
  // - SynapseStoreBasic           (без dispatcher)
  // - SynapseStoreWithDispatcher
  // - SynapseStoreWithEffects
  //
  // Всегда имеет:
  //   store.storage   — ISyncStorage | IAsyncStorage
  //   store.selectors — объект селекторов
  //   store.destroy() — очистка ресурсов
  //
  // С dispatcher дополнительно:
  //   store.actions    — типизированные экшены
  //   store.dispatcher — raw dispatcher
  //
  // С effects дополнительно:
  //   store.state$     — Observable<TStore>

  const state = store.storage.getStateSync()
  console.log(state.locale)  // 'ru'
}
```

## waitForReady()

```typescript
// Асинхронное ожидание — возвращает Promise<SynapseStore>
const store = await awaiter.waitForReady()

// Безопасно вызывать несколько раз — возвращает тот же store
const store1 = await awaiter.waitForReady()
const store2 = await awaiter.waitForReady()
// store1 === store2
```

## onReady() / onError()

```typescript
// Подписка на готовность — возвращает функцию отписки
const unsub = awaiter.onReady((store) => {
  console.log('Store готов!')
  const state = store.storage.getStateSync()
  console.log(state)
})

// Если store уже готов — колбэк вызывается немедленно (синхронно)
// Можно подписать несколько обработчиков

// Подписка на ошибку
const unsubErr = awaiter.onError((error) => {
  console.error('Инициализация провалилась:', error.message)
})

// Если ошибка уже произошла — колбэк вызывается немедленно

// Отписка
unsub()
unsubErr()
```

## destroy()

```typescript
// Очистка ресурсов: сброс подписок, статус -> 'pending', store -> undefined
awaiter.destroy()

// После destroy:
awaiter.isReady()        // false
awaiter.getStatus()      // 'pending'
awaiter.getStoreIfReady() // undefined
```

## Использование в React-компоненте

```typescript
function ConfigPanel() {
  const [status, setStatus] = useState(awaiter.getStatus())
  const [config, setConfig] = useState<ConfigState | null>(null)

  useEffect(() => {
    const unsubReady = awaiter.onReady((store) => {
      setStatus('ready')
      setConfig(store.storage.getStateSync())
    })

    const unsubError = awaiter.onError(() => {
      setStatus('error')
    })

    // Если уже готов — обновить сразу
    if (awaiter.isReady()) {
      setStatus('ready')
      setConfig(awaiter.getStoreIfReady()?.storage.getStateSync() ?? null)
    }

    return () => { unsubReady(); unsubError() }
  }, [])

  if (status === 'pending') return <div>Загрузка конфигурации...</div>
  if (status === 'error') return <div>Ошибка!</div>
  return <div>Локаль: {config?.locale}</div>
}
```
