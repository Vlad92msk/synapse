# remove / has / keys / clear / reset

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/DeleteHasKeysExample.tsx)

Операции над **ключами и жизненным циклом состояния**: проверить наличие, перечислить, удалить один
ключ или сбросить весь стор. Обзор:

| Метод | Что делает | Итог |
|---|---|---|
| `has(key)` | есть ли ключ | `boolean` |
| `keys()` | список ключей верхнего уровня | `string[]` |
| `remove(key)` | удалить **один** ключ | ключ исчезает из `keys()`/`has()` |
| `clear()` | удалить **все** ключи | состояние `{}` |
| `reset()` | вернуть к `initialState` | исходные поля из конфига |

Примеры используют сквозной `todoStorage` (`TodoState = { todos: Todo[]; filter: Filter }`). Работают
одинаково для всех типов хранилищ — у IndexedDB те же методы возвращают `Promise`.

## has(key) — проверить существование ключа

**Когда:** нужно узнать, есть ли ключ, не читая значение (например перед `remove`).

```typescript
// ── Синхронное хранилище (MemoryStorage / LocalStorage) ──

todoStorage.has('todos')     // true
todoStorage.has('filter')    // true
todoStorage.has('unknown')   // false

// ── Асинхронное хранилище (IndexedDBStorage) ──

await todoStorage.has('todos')     // true
await todoStorage.has('unknown')   // false
```

## keys() — получить все ключи

**Когда:** перебрать имеющиеся ключи верхнего уровня (диагностика, динамический обход).

```typescript
// ── Синхронно ──
const allKeys = todoStorage.keys()
// ['todos', 'filter']

// ── Асинхронно ──
const allKeys = await todoStorage.keys()
```

## remove(key) — удалить один ключ

**Когда:** нужно убрать именно один ключ, оставив остальные. После удаления `has(key)` вернёт `false`,
а `keys()` не будет содержать этот ключ.

```typescript
// ── Синхронно ──
todoStorage.remove('filter')
todoStorage.has('filter')   // false
todoStorage.keys()          // ['todos']

// ── Асинхронно ──
await todoStorage.remove('filter')
```

## clear() — очистить всё

**Когда:** нужно полностью обнулить хранилище — состояние становится пустым объектом `{}`.
**Когда НЕ нужно:** хочешь вернуть исходные поля — тогда `reset()`.

```typescript
// ── Синхронно ──
todoStorage.clear()
todoStorage.getState()   // {}
todoStorage.keys()       // []

// ── Асинхронно ──
await todoStorage.clear()
```

## reset() — сброс к initialState

**Когда:** нужно откатить стор к исходному состоянию из конфига (после `clear`, при «сбросе формы» и т.п.).

```typescript
// ── Синхронно ──
todoStorage.reset()
todoStorage.getState()   // { todos: [], filter: 'all' }

// ── Асинхронно ──
await todoStorage.reset()
```

## clear() vs reset() — в чём разница

Оба «обнуляют» стор, но по-разному: `clear()` **удаляет все ключи** (пустой `{}`), `reset()`
**восстанавливает `initialState`**. Выбор зависит от того, нужно ли, чтобы исходные поля вернулись.

```typescript
const todoStorage = new MemoryStorage<TodoState>({
  name: 'todo',
  initialState: { todos: [], filter: 'all' },
})

todoStorage.set('filter', 'completed')

// clear() — полная очистка до пустого объекта.
todoStorage.clear()
todoStorage.getState()   // {}
todoStorage.keys()       // []

// reset() — возврат к initialState из конфига.
todoStorage.reset()
todoStorage.getState()   // { todos: [], filter: 'all' }
todoStorage.keys()       // ['todos', 'filter']
```

## См. также

- [Чтение данных](./reading-data.md) · [Запись данных](./writing-data.md)
- [Подписки](./subscriptions.md) — `subscribeToAll` видит события `remove` / `clear` / `reset`.
