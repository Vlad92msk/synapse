# IndexedDBStorage

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/IndexedDBExample.tsx)

Данные хранятся в IndexedDB. Сохраняются после перезагрузки страницы. **Асинхронный API** — все методы возвращают Promise.

## Создание

```typescript
import { IndexedDBStorage } from 'synapse-storage/core'

interface TodoState {
  items: string[]
  filter: 'all' | 'active'
}

// Через new (options — обязательное поле)
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: {},                     // может быть пустым объектом
})

// С пользовательским dbName
const storage = new IndexedDBStorage<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: { dbName: 'my_app_db' }, // по умолчанию 'app_storage'
})

// Или через статический .create()
const storage = IndexedDBStorage.create<TodoState>({
  name: 'todo-store',
  initialState: { items: [], filter: 'all' },
  options: {},
})

// Инициализация (обязательна)
await storage.initialize()
```

## Запись данных (асинхронная!)

```typescript
// set() — возвращает Promise
await storage.set('filter', 'active')
await storage.set('items', ['Buy milk', 'Walk dog'])

// update() — возвращает Promise
await storage.update((s) => {
  s.items.push('New item')
  s.filter = 'all'
})
```

## Чтение данных (асинхронное!)

```typescript
// get() — возвращает Promise
const items = await storage.get<string[]>('items')   // ['Buy milk']
const filter = await storage.get<string>('filter')   // 'all'

// getState() — возвращает Promise
const state = await storage.getState()               // { items: [...], filter: 'all' }

// getStateSync() — синхронное чтение из кэша (всегда доступно!)
const state = storage.getStateSync()                 // { items: [...], filter: 'all' }
```

## Проверка, удаление, сброс (асинхронные!)

```typescript
// Все методы возвращают Promise:
await storage.has('items')      // true
await storage.keys()            // ['items', 'filter']
await storage.remove('filter')  // удалить ключ
await storage.clear()           // очистить всё (state = {})
await storage.reset()           // вернуть к initialState
```

## Подписки (одинаковы для всех типов!)

```typescript
// Подписки работают идентично для синхронных и асинхронных хранилищ:
const unsub = storage.subscribe('items', (newValue) => {
  console.log('items изменились:', newValue)
})

const unsub = storage.subscribe(
  (state) => state.items.length,
  (count) => console.log('количество items:', count)
)

const unsub = storage.subscribeToAll((event) => {
  console.log('изменено:', event)
})
```

## Отличия от MemoryStorage/LocalStorage

1. В конфигурации обязательно поле `options` (даже пустой объект):
   `{ name, initialState, options: {} }` vs `{ name, initialState }`

2. Все операции чтения/записи возвращают Promise:
   `await storage.set(...)` vs `storage.set(...)`

3. `getStateSync()` — работает из кэша, общий для всех типов

4. Подписки идентичны для всех типов хранилищ

## Persist-миграции и SSR

IndexedDB персистентен, поэтому поддерживает миграцию схемы через `version` + `migrate`
(версия хранится reserved-записью в том же сторе и не видна в `getState()`/`keys()`) —
см. [Persist-миграции](./persist-migration.md). Серверное состояние засевается через
[`hydrate(state)`](./ssr-hydration.md) (для IndexedDB — `await storage.hydrate(...)`).
