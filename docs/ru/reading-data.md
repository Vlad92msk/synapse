# Чтение данных (get/getState)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/ReadingDataExample.tsx)

Все способы прочитать данные из хранилища. Примеры используют сквозной `todoStorage` — тот же стор,
что создан в разделе [MemoryStorage](./memory-storage.md):

```typescript
import { MemoryStorage } from 'synapse-storage/core'

interface Todo { id: string; title: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'
interface TodoState { todos: Todo[]; filter: Filter }

const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
})
await todoStorage.initialize()
```

У синхронных хранилищ (Memory, LocalStorage) методы чтения возвращают значение сразу, у
асинхронного (IndexedDB) — `Promise`, поэтому нужен `await`.

## get(key) — Чтение одного поля

```typescript
// ── Синхронное хранилище (MemoryStorage / LocalStorage) ──

const filter = todoStorage.get<Filter>('filter')   // 'all'
const todos = todoStorage.get<Todo[]>('todos')     // Todo[]
const missing = todoStorage.get<string>('xxx')     // undefined

// ── Асинхронное хранилище (IndexedDBStorage) ──

const filter = await todoStorage.get<Filter>('filter')
const todos = await todoStorage.get<Todo[]>('todos')
```

## getState() — Всё состояние

```typescript
// ── Синхронное хранилище ──

const state = todoStorage.getState()
// { todos: [...], filter: 'all' }

// ── Асинхронное хранилище ──

const state = await todoStorage.getState()
```

## getStateSync() — Синхронное чтение из кеша

Доступно на **ВСЕХ** типах хранилищ — синхронных и асинхронных. Читает из внутреннего кеша, не обращается к IndexedDB. Работает только после `initialize()`.

```typescript
// Синхронное хранилище — то же самое, что getState()
const state = todoStorage.getStateSync()

// Асинхронное хранилище — синхронный доступ к кешу!
const state = asyncStorage.getStateSync()
// Полезно, когда не хочется await, например в render
```

## has(key) / keys() — Проверка и перечисление

```typescript
// ── Синхронное хранилище ──

todoStorage.has('todos')    // true
todoStorage.has('unknown')  // false
todoStorage.keys()          // ['todos', 'filter']

// ── Асинхронное хранилище ──

await todoStorage.has('todos')   // true
await todoStorage.keys()         // ['todos', 'filter']
```
