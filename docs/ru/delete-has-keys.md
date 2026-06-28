# remove / has / keys / clear / reset

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/DeleteHasKeysExample.tsx)

Операции проверки существования, удаления ключей и сброса хранилища. Примеры используют сквозной
`todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`). Работают одинаково для всех типов
хранилищ — у IndexedDB те же методы возвращают `Promise`.

## has(key) — Проверить существование ключа

```typescript
// ── Синхронное хранилище (MemoryStorage / LocalStorage) ──

todoStorage.has('todos')     // true
todoStorage.has('filter')    // true
todoStorage.has('unknown')   // false

// ── Асинхронное хранилище (IndexedDBStorage) ──

await todoStorage.has('todos')     // true
await todoStorage.has('unknown')   // false
```

## keys() — Получить все ключи

```typescript
// ── Синхронно ──
const allKeys = todoStorage.keys()
// ['todos', 'filter']

// ── Асинхронно ──
const allKeys = await todoStorage.keys()
```

## remove(key) — Удалить конкретный ключ

```typescript
// Удаляет ключ из хранилища.
// После удаления has(key) возвращает false, keys() не содержит этот ключ.

// ── Синхронно ──
todoStorage.remove('filter')
todoStorage.has('filter')   // false
todoStorage.keys()          // ['todos']

// ── Асинхронно ──
await todoStorage.remove('filter')
```

## clear() — Очистить хранилище

```typescript
// Удаляет ВСЕ ключи. Состояние становится пустым объектом {}.

// ── Синхронно ──
todoStorage.clear()
todoStorage.getState()   // {}
todoStorage.keys()       // []

// ── Асинхронно ──
await todoStorage.clear()
```

## reset() — Сброс к initialState

```typescript
// Возвращает состояние к начальному значению (initialState из конфига).

// ── Синхронно ──
todoStorage.reset()
todoStorage.getState()   // { todos: [...], filter: 'all' }

// ── Асинхронно ──
await todoStorage.reset()
```

## clear() vs reset() — В чём разница

```typescript
const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
})

todoStorage.set('filter', 'completed')

// clear() — полная очистка
todoStorage.clear()
todoStorage.getState()   // {}
todoStorage.keys()       // []

// reset() — возврат к initialState
todoStorage.reset()
todoStorage.getState()   // { todos: [], filter: 'all' }
todoStorage.keys()       // ['todos', 'filter']
```
