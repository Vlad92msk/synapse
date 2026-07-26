# Чтение данных (get / getState / getStateSync)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/ReadingDataExample.tsx)

Все способы **разово прочитать** данные из хранилища. Это императивное чтение «здесь и сейчас»; для
реакции на изменения — [Подписки](./subscriptions.md), для вычисляемых значений — [Селекторы](./selector-system.md).

Ключевое различие методов — **одно поле vs всё состояние** и **sync vs async**:

| Метод | Что возвращает | Sync-хранилище (Memory/LocalStorage) | Async-хранилище (IndexedDB) |
|---|---|---|---|
| `get(key)` | одно поле верхнего уровня | значение сразу | `Promise` → нужен `await` |
| `getState()` | всё состояние | объект сразу | `Promise` → нужен `await` |
| `getStateSync()` | всё состояние **из кеша** | то же, что `getState()` | значение **сразу, без await** |
| `has(key)` / `keys()` | наличие / список ключей | сразу | `Promise` → нужен `await` |

Примеры используют сквозной `todoStorage` — тот же стор, что создан в разделе
[MemoryStorage](./memory-storage.md):

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

## get(key) — одно поле верхнего уровня

**Когда:** нужно значение одного ключа состояния. **Когда НЕ нужно:** нужно несколько полей сразу
(бери `getState()`) или вложенное/вычисляемое значение (бери селектор).

```typescript
// ── Синхронное хранилище (MemoryStorage / LocalStorage) ──

const filter = todoStorage.get<Filter>('filter')   // 'all'
const todos = todoStorage.get<Todo[]>('todos')     // Todo[]
const missing = todoStorage.get<string>('xxx')     // undefined — ключа нет

// ── Асинхронное хранилище (IndexedDBStorage) ──

const filter = await todoStorage.get<Filter>('filter')
const todos = await todoStorage.get<Todo[]>('todos')
```

Тип задаётся дженериком `get<R>(...)`; отсутствующий ключ → `undefined`.

## getState() — всё состояние

**Когда:** нужен весь снапшот состояния (несколько полей, сериализация, отладка).

```typescript
// ── Синхронное хранилище ──

const state = todoStorage.getState()
// { todos: [...], filter: 'all' }

// ── Асинхронное хранилище ──

const state = await todoStorage.getState()
```

## getStateSync() — состояние из кеша БЕЗ await

Главное отличие от `getState()`: **всегда синхронный**, даже у асинхронного (IndexedDB) хранилища —
читает из внутреннего кеша, не обращаясь к самой БД.

**Когда:** нужен снапшот async-хранилища там, где `await` неудобен или запрещён — в `render`,
в синхронном обработчике, в middleware. **Когда НЕ нужно:** нужны свежайшие данные из самой
IndexedDB, а не из кеша (тогда `await getState()`).

**Ограничение:** работает только после `initialize()` — до неё кеш пуст.

```typescript
// Синхронное хранилище — то же самое, что getState().
const state = todoStorage.getStateSync()

// Асинхронное хранилище — синхронный доступ к кешу без await!
const state = asyncStorage.getStateSync()
// Полезно, когда нельзя await — например прямо в render.
```

## has(key) / keys() — проверка и перечисление

**Когда:** проверить наличие ключа перед чтением или перебрать имеющиеся ключи верхнего уровня.

```typescript
// ── Синхронное хранилище ──

todoStorage.has('todos')    // true
todoStorage.has('unknown')  // false
todoStorage.keys()          // ['todos', 'filter']

// ── Асинхронное хранилище ──

await todoStorage.has('todos')   // true
await todoStorage.keys()         // ['todos', 'filter']
```

Те же `has`/`keys` подробнее (вместе с удалением и сбросом) — в разделе
[remove / has / keys / clear / reset](./delete-has-keys.md).

## См. также

- [Запись данных (set / update)](./writing-data.md) — как менять то, что читаешь.
- [Подписки](./subscriptions.md) — реакция на изменения вместо разового чтения.
- [Селекторы](./selector-system.md) — вычисляемые и мемоизированные производные значения.
