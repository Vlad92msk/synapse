# Чтение данных (get/getState)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/ReadingDataExample.tsx)

Все способы чтения данных из хранилища. Синхронные хранилища (Memory, LocalStorage) и асинхронные (IndexedDB).

## get(key) — Чтение одного поля

```typescript
// ── Синхронное хранилище (MemoryStorage / LocalStorage) ──

const name = storage.get<string>('name')     // 'Alice'
const age = storage.get<number>('age')       // 28
const missing = storage.get<string>('xxx')   // undefined

// ── Асинхронное хранилище (IndexedDBStorage) ──

const name = await storage.get<string>('name')   // 'Bob'
const age = await storage.get<number>('age')     // 35
```

## getState() — Всё состояние

```typescript
// ── Синхронное хранилище ──

const state = storage.getState()
// { name: 'Alice', age: 28, role: 'admin' }

// ── Асинхронное хранилище ──

const state = await storage.getState()
// { name: 'Bob', age: 35, role: 'user' }
```

## getStateSync() — Синхронное чтение из кеша

Доступно на **ВСЕХ** типах хранилищ — синхронных и асинхронных. Читает из внутреннего кеша, не обращается к IndexedDB. Работает только после `initialize()`.

```typescript
// Синхронное хранилище — то же самое, что getState()
const state = storage.getStateSync()

// Асинхронное хранилище — синхронный доступ к кешу!
const state = asyncStorage.getStateSync()
// Полезно, когда не хочется await, например в render
```

## has(key) / keys() — Проверка и перечисление

```typescript
// ── Синхронное хранилище ──

storage.has('name')     // true
storage.has('unknown')  // false
storage.keys()          // ['name', 'age', 'role']

// ── Асинхронное хранилище ──

await storage.has('name')     // true
await storage.has('unknown')  // false
await storage.keys()          // ['name', 'age', 'role']
```
