# Подписки (subscribe)

> [Назад к оглавлению](./README.md)

Все способы подписки на изменения данных в хранилище. Работают одинаково для Memory, LocalStorage и IndexedDB.

## 1. subscribe(key, callback)

Подписка на конкретный ключ верхнего уровня. Коллбек вызывается при каждом изменении этого ключа.

```typescript
const unsub = storage.subscribe('counter', (newValue) => {
  console.log('counter изменился:', newValue)  // number
})

const unsub = storage.subscribe('user', (newUser) => {
  console.log('user изменился:', newUser)  // { name, email }
})

// Отписка
unsub()
```

## 2. subscribe(selector, callback)

Подписка через функцию-селектор. Коллбек вызывается, когда результат селектора изменяется.

```typescript
const unsub = storage.subscribe(
  (state) => state.settings.theme,
  (newTheme) => console.log('тема:', newTheme)  // 'light' | 'dark'
)

// Подписка на вложенные поля
const unsub = storage.subscribe(
  (state) => state.user.name,
  (name) => console.log('имя:', name)
)

// Вычисляемые значения
const unsub = storage.subscribe(
  (state) => `${state.user.name} (${state.settings.lang})`,
  (computed) => console.log('вычисленное:', computed)
)

unsub()
```

## 3. subscribeToAll(callback)

Подписка на ВСЕ изменения хранилища. Коллбек получает событие с информацией об изменении.

```typescript
const unsub = storage.subscribeToAll((event) => {
  console.log(event.type)          // 'set' | 'update' | 'remove' | 'clear' | 'reset'
  console.log(event.key)           // ключ или массив ключей
  console.log(event.changedPaths)  // пути к изменённым полям
})

unsub()
```

## 4. useStorageSubscribe (React-хук)

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

function MyComponent({ storage }: { storage: ISyncStorage<AppState> }) {
  // Подписка на одно поле
  const counter = useStorageSubscribe(storage, (s) => s.counter)

  // Подписка на вложенное поле
  const theme = useStorageSubscribe(storage, (s) => s.settings.theme)

  // Подписка на всё состояние
  const fullState = useStorageSubscribe(storage, (s) => s)

  // Вычисляемое значение — ре-рендер только при изменении результата
  const summary = useStorageSubscribe(
    storage,
    (s) => `${s.user.name}, counter: ${s.counter}`
  )

  return <div>{counter} / {theme} / {summary}</div>
}
```
