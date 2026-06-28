# Паттерн Singleton

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SingletonExample.tsx)

Повторное использование экземпляров хранилища по имени. Полезно для общего состояния и когда хранилище создаётся в нескольких местах (React-компоненты, модули).

Примеры используют сквозной домен `TodoState = { todos: Todo[]; filter: Filter }` (см. раздел
[MemoryStorage](./memory-storage.md)).

## Включение Singleton

```typescript
import { MemoryStorage } from 'synapse-storage/core'

// Первый экземпляр — создаёт хранилище
const storage1 = new MemoryStorage<TodoState>({
  name: 'my-todo',
  singleton: { enabled: true },
  initialState: { todos: [], filter: 'completed' },
})
await storage1.initialize()

// Второй экземпляр с ТЕМ ЖЕ именем — получает тот же объект
const storage2 = new MemoryStorage<TodoState>({
  name: 'my-todo',
  singleton: { enabled: true },
  initialState: { todos: [], filter: 'all' },  // игнорируется (по умолчанию FIRST_WINS)
})
await storage2.initialize()

storage2.get('filter')    // 'completed' (тот же экземпляр!)
storage1 === storage2     // true

// Работает с MemoryStorage, LocalStorage, IndexedDB
// Ключ singleton по умолчанию: `${storageType}_${name}` (memory_my-todo)
```

## Стратегии слияния (mergeStrategy)

```typescript
import { MemoryStorage, ConfigMergeStrategy } from 'synapse-storage/core'

const storage = new MemoryStorage<TodoState>({
  name: 'my-todo',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.FIRST_WINS,  // по умолчанию
  },
  initialState: { todos: [], filter: 'all' },
})

// Все стратегии:

// FIRST_WINS (по умолчанию)
// Первый initialState побеждает, последующие игнорируются

// DEEP_MERGE
// Рекурсивное слияние initialState:
// s1: { todos: [], filter: 'all' }
// s2: { filter: 'active' }
// → { todos: [], filter: 'all' }   (поля первого имеют приоритет)

// OVERRIDE
// Последняя конфигурация перезаписывает (кроме name)

// WARN_AND_USE_FIRST
// Как FIRST_WINS, но с console.warn при конфликтах

// STRICT
// Выбрасывает Error, если initialState различается
```

## Пользовательский ключ (singleton.key)

```typescript
// Ключ по умолчанию: `${storageType}_${name}`
// Два хранилища с одинаковым именем, но разным ключом — разные экземпляры

const active = new MemoryStorage<TodoState>({
  name: 'todo-board',
  singleton: { enabled: true, key: 'board-active' },
  initialState: { todos: [], filter: 'active' },
})

const archive = new MemoryStorage<TodoState>({
  name: 'todo-board',  // то же имя!
  singleton: { enabled: true, key: 'board-archive' },  // другой ключ
  initialState: { todos: [], filter: 'completed' },
})

active === archive  // false (разные ключи → разные экземпляры)
```

## Singleton в React

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// Два компонента создают хранилище с одинаковым именем — один экземпляр

const sharedStorage = new MemoryStorage<TodoState>({
  name: 'shared-todo',
  singleton: { enabled: true },
  initialState: { todos: [], filter: 'all' },
})
sharedStorage.initialize()

function ComponentA() {
  const count = useStorageSubscribe(sharedStorage, (s) => s.todos.length)
  return <div>задач: {count} <button onClick={() => sharedStorage.update((s) => { s.todos.push(createTodo('Из A')) })}>Добавить</button></div>
}

function ComponentB() {
  // Создаёт "новое" хранилище — но получает тот же singleton
  const sameStorage = new MemoryStorage<TodoState>({
    name: 'shared-todo',
    singleton: { enabled: true },
    initialState: { todos: [], filter: 'all' },
  })
  const count = useStorageSubscribe(sameStorage, (s) => s.todos.length)
  // count здесь = то же, что и в ComponentA
  return <div>задач: {count}</div>
}
```

## Полная конфигурация SingletonOptions

```typescript
interface SingletonOptions {
  enabled: boolean                // включить singleton
  mergeStrategy?: ConfigMergeStrategy  // стратегия слияния (по умолчанию: FIRST_WINS)
  warnOnConflict?: boolean        // предупреждение в консоли (по умолчанию: true)
  key?: string                    // пользовательский ключ (по умолчанию: `${type}_${name}`)
}

// Перечисление ConfigMergeStrategy:
enum ConfigMergeStrategy {
  STRICT = 'strict',
  FIRST_WINS = 'first_wins',
  DEEP_MERGE = 'deep_merge',
  OVERRIDE = 'override',
  WARN_AND_USE_FIRST = 'warn_and_use_first',
}
```
