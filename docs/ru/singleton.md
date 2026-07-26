# Паттерн Singleton

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/SingletonExample.tsx)

`singleton` — поле конфига хранилища (`BaseStorageConfig.singleton`). При `enabled: true` два
`new MemoryStorage({ name: 'x', singleton: { enabled: true } })` с **одним ключом** вернут **один
и тот же экземпляр** — второй конструктор не создаёт новое хранилище, а отдаёт уже существующее.

Примеры используют сквозной домен `TodoState = { todos: Todo[]; filter: Filter }` (см. раздел
[MemoryStorage](./memory-storage.md)).

## Зачем

Хранилище нередко создаётся в нескольких местах: разные React-компоненты, разные модули,
хот-релоад в dev. Без singleton каждый `new` — отдельный стор со своим состоянием, и они
расходятся. Singleton даёт **общий инстанс по имени/ключу**: кто бы ни «создал» стор, все работают
с одними данными и одними подписками — без ручного проброса ссылки через пропсы/контекст.

## Когда использовать

- Одно логическое хранилище **инстанцируется из нескольких точек** (компоненты, модули) и должно
  быть общим.
- Нужно пережить **hot-reload** в dev, не плодя копии стора.
- Разные части приложения хотят одно состояние, но передавать ссылку неудобно.

## Когда НЕ нужно

- Стор создаётся **в одном месте** и оттуда импортируется — тогда это уже де-факто синглтон, поле
  не нужно.
- Нужны **изолированные** инстансы одного типа (например, стор на каждую сущность/вкладку) — там
  singleton, наоборот, склеит их. Если имя совпадает, а инстансы должны быть разными — разведите
  их через `key` (см. ниже).
- Внутри модуля `createSynapse`: сам handle уже ленивый singleton, дублировать на уровне storage
  обычно незачем.

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

## Опции

| Поле | Тип | По умолчанию | Описание |
|---|---|---|---|
| `enabled` | `boolean` | — | Включить singleton. Без него поле не действует. |
| `mergeStrategy?` | `ConfigMergeStrategy` | `FIRST_WINS` | Как слить конфиги первого и последующих инстансов (см. выше). |
| `warnOnConflict?` | `boolean` | `true` | `console.warn` при расхождении конфигов инстансов. |
| `key?` | `string` | `` `${type}_${name}` `` | Пользовательский ключ реестра. Разные ключи → разные инстансы (даже при одном `name`). |

## См. также

- [MemoryStorage](./memory-storage.md) · [LocalStorage](./local-storage.md) · [IndexedDB](./indexeddb-storage.md) — где живёт поле `singleton`.
- [createSynapse (базовый)](./create-synapse-basic.md) — handle модуля сам ленивый singleton.
