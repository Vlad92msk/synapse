# remove / has / keys / clear / reset

> [Назад к оглавлению](./README.md)

Операции проверки существования, удаления ключей и сброса хранилища. Работают одинаково для всех типов хранилищ.

## has(key) — Проверить существование ключа

```typescript
// ── Синхронное хранилище (MemoryStorage / LocalStorage) ──

storage.has('name')      // true
storage.has('age')       // true
storage.has('unknown')   // false

// ── Асинхронное хранилище (IndexedDBStorage) ──

await storage.has('name')      // true
await storage.has('unknown')   // false
```

## keys() — Получить все ключи

```typescript
// ── Синхронно ──
const allKeys = storage.keys()
// ['name', 'age', 'role', 'active']

// ── Асинхронно ──
const allKeys = await storage.keys()
```

## remove(key) — Удалить конкретный ключ

```typescript
// Удаляет ключ из хранилища.
// После удаления has(key) возвращает false, keys() не содержит этот ключ.

// ── Синхронно ──
storage.remove('role')
storage.has('role')   // false
storage.keys()        // ['name', 'age', 'active']

// ── Асинхронно ──
await storage.remove('role')
```

## clear() — Очистить хранилище

```typescript
// Удаляет ВСЕ ключи. Состояние становится пустым объектом {}.

// ── Синхронно ──
storage.clear()
storage.getState()   // {}
storage.keys()       // []

// ── Асинхронно ──
await storage.clear()
```

## reset() — Сброс к initialState

```typescript
// Возвращает состояние к начальному значению (initialState из конфига).

// ── Синхронно ──
storage.reset()
storage.getState()   // { name: 'Alice', age: 28, role: 'admin', active: true }

// ── Асинхронно ──
await storage.reset()
```

## clear() vs reset() — В чём разница

```typescript
const storage = new MemoryStorage({
  name: 'example',
  initialState: { count: 0, label: 'hello' },
})

storage.set('count', 99)
storage.set('label', 'world')

// clear() — полная очистка
storage.clear()
storage.getState()   // {}
storage.keys()       // []

// reset() — возврат к initialState
storage.reset()
storage.getState()   // { count: 0, label: 'hello' }
storage.keys()       // ['count', 'label']
```
