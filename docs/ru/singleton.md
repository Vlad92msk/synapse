# Паттерн Singleton

> [Назад к оглавлению](./README.md)

Повторное использование экземпляров хранилища по имени. Полезно для общего состояния и когда хранилище создаётся в нескольких местах (React-компоненты, модули).

## Включение Singleton

```typescript
import { MemoryStorage } from 'synapse-storage/core'

// Первый экземпляр — создаёт хранилище
const storage1 = new MemoryStorage<{ count: number }>({
  name: 'my-store',
  singleton: { enabled: true },
  initialState: { count: 0 },
})
await storage1.initialize()
storage1.set('count', 42)

// Второй экземпляр с ТЕМ ЖЕ именем — получает тот же объект
const storage2 = new MemoryStorage<{ count: number }>({
  name: 'my-store',
  singleton: { enabled: true },
  initialState: { count: 999 },  // игнорируется (по умолчанию FIRST_WINS)
})
await storage2.initialize()

storage2.get('count')     // 42 (тот же экземпляр!)
storage1 === storage2     // true

// Работает с MemoryStorage, LocalStorage, IndexedDB
// Ключ singleton по умолчанию: `${storageType}_${name}` (memory_my-store)
```

## Стратегии слияния (mergeStrategy)

```typescript
import { MemoryStorage, ConfigMergeStrategy } from 'synapse-storage/core'

const storage = new MemoryStorage({
  name: 'my-store',
  singleton: {
    enabled: true,
    mergeStrategy: ConfigMergeStrategy.FIRST_WINS,  // по умолчанию
  },
  initialState: { ... },
})

// Все стратегии:

// FIRST_WINS (по умолчанию)
// Первый initialState побеждает, последующие игнорируются

// DEEP_MERGE
// Рекурсивное слияние initialState:
// s1: { theme: 'dark', lang: 'en' }
// s2: { theme: 'light', extra: true }
// → { theme: 'dark', lang: 'en', extra: true }

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

const cache = new MemoryStorage<{ data: string }>({
  name: 'user-data',
  singleton: { enabled: true, key: 'user-cache' },
  initialState: { data: 'cached' },
})

const settings = new MemoryStorage<{ data: string }>({
  name: 'user-data',  // то же имя!
  singleton: { enabled: true, key: 'user-settings' },  // другой ключ
  initialState: { data: 'settings' },
})

cache === settings  // false (разные ключи → разные экземпляры)
```

## Singleton в React

```typescript
import { useStorageSubscribe } from 'synapse-storage/react'

// Два компонента создают хранилище с одинаковым именем — один экземпляр

const sharedStorage = new MemoryStorage<{ message: string; likes: number }>({
  name: 'shared-store',
  singleton: { enabled: true },
  initialState: { message: 'Hello!', likes: 0 },
})
sharedStorage.initialize()

function ComponentA() {
  const message = useStorageSubscribe(sharedStorage, (s) => s.message)
  return <div>{message} <button onClick={() => sharedStorage.set('message', 'Updated!')}>Update</button></div>
}

function ComponentB() {
  // Создаёт "новое" хранилище — но получает тот же singleton
  const sameStorage = new MemoryStorage<{ message: string; likes: number }>({
    name: 'shared-store',
    singleton: { enabled: true },
    initialState: { message: 'different', likes: 0 },
  })
  const message = useStorageSubscribe(sameStorage, (s) => s.message)
  // message здесь = то же, что и в ComponentA
  return <div>{message}</div>
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
