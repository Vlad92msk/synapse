import { useState, useEffect, useCallback } from 'react'
import { MemoryStorage, syncBroadcastMiddleware } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Storage instances ─────────────────────────────────────────────────────

const batchingStorage = new MemoryStorage<{
  counter: number
  items: string[]
}>({
  name: 'mw-batching',
  initialState: { counter: 0, items: [] },
  middlewares: (getDefault) => [
    getDefault().batching({ batchSize: 5, batchDelay: 100 }),
  ],
})
batchingStorage.initialize()

const shallowStorage = new MemoryStorage<{
  user: { name: string; age: number }
}>({
  name: 'mw-shallow',
  initialState: { user: { name: 'Alice', age: 30 } },
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),
  ],
})
shallowStorage.initialize()

const customComparatorStorage = new MemoryStorage<{
  score: number
}>({
  name: 'mw-custom-cmp',
  initialState: { score: 0 },
  middlewares: (getDefault) => [
    getDefault().shallowCompare({
      comparator: (prev: any, next: any) => {
        if (typeof prev === 'number' && typeof next === 'number') {
          return Math.abs(prev - next) < 5
        }
        return prev === next
      },
    }),
  ],
})
customComparatorStorage.initialize()

const combinedStorage = new MemoryStorage<{
  value: string
  count: number
}>({
  name: 'mw-combined',
  initialState: { value: 'hello', count: 0 },
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),
    getDefault().batching({ batchSize: 3, batchDelay: 50 }),
  ],
})
combinedStorage.initialize()

const broadcastStorage = new MemoryStorage<{
  message: string
}>({
  name: 'mw-broadcast',
  initialState: { message: 'No messages yet' },
  middlewares: () => [
    syncBroadcastMiddleware({ storageName: 'mw-broadcast', storageType: 'memory' }),
  ],
})
broadcastStorage.initialize()

const loggerStorage = new MemoryStorage<{
  count: number
}>({
  name: 'mw-logger',
  initialState: { count: 0 },
  middlewares: (getDefault) => [
    getDefault().logger({ collapsed: true }),
  ],
})
loggerStorage.initialize()

// ─── Demos ─────────────────────────────────────────────────────────────────

function BatchingDemo() {
  const counter = useStorageSubscribe(batchingStorage, (s) => s.counter)
  const items = useStorageSubscribe(batchingStorage, (s) => s.items)
  const [fireCount, setFireCount] = useState(0)

  const rapidFire = useCallback(() => {
    for (let i = 0; i < 20; i++) {
      batchingStorage.set('counter', i)
    }
    setFireCount((c) => c + 1)
  }, [])

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={rapidFire}>Rapid-fire 20 sets</button>
        <button onClick={() => {
          batchingStorage.set('items', ['a'])
          batchingStorage.set('items', ['a', 'b'])
          batchingStorage.set('items', ['a', 'b', 'c'])
        }}>3 sets on items</button>
        <button onClick={() => batchingStorage.reset()}>reset</button>
      </div>
      <p>counter: <strong>{counter}</strong> | items: <strong>{JSON.stringify(items)}</strong> | fires: {fireCount}</p>
    </div>
  )
}

function ShallowCompareDemo() {
  const user = useStorageSubscribe(shallowStorage, (s) => s.user)
  const [attempts, setAttempts] = useState(0)
  const [updates, setUpdates] = useState(0)

  useEffect(() => {
    return shallowStorage.subscribe('user', () => setUpdates((c) => c + 1))
  }, [])

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={() => {
          shallowStorage.set('user', { name: 'Alice', age: 30 })
          setAttempts((c) => c + 1)
        }}>Set same value (skip)</button>
        <button onClick={() => {
          shallowStorage.set('user', { name: 'Bob', age: 25 })
          setAttempts((c) => c + 1)
        }}>Set different value</button>
      </div>
      <p>user: <strong>{JSON.stringify(user)}</strong> | attempts: {attempts} | actual updates: {updates}</p>
    </div>
  )
}

function CustomComparatorDemo() {
  const score = useStorageSubscribe(customComparatorStorage, (s) => s.score)

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={() => {
          const cur = customComparatorStorage.get<number>('score') || 0
          customComparatorStorage.set('score', cur + 2)
        }}>+2 (skip if diff &lt; 5)</button>
        <button onClick={() => {
          const cur = customComparatorStorage.get<number>('score') || 0
          customComparatorStorage.set('score', cur + 10)
        }}>+10 (will update)</button>
        <button onClick={() => customComparatorStorage.set('score', 0)}>reset</button>
      </div>
      <p>score: <strong>{score}</strong></p>
    </div>
  )
}

function CombinedDemo() {
  const value = useStorageSubscribe(combinedStorage, (s) => s.value)
  const count = useStorageSubscribe(combinedStorage, (s) => s.count)

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={() => {
          combinedStorage.set('value', 'hello')
          combinedStorage.set('value', 'hello')
          combinedStorage.set('value', 'world')
        }}>3 sets (2 same + 1 different)</button>
        <button onClick={() => combinedStorage.update((s) => { s.count++ })}>count++</button>
      </div>
      <p>value: <strong>{value}</strong> | count: <strong>{count}</strong></p>
    </div>
  )
}

function BroadcastDemo() {
  const message = useStorageSubscribe(broadcastStorage, (s) => s.message)

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={() => broadcastStorage.set('message', `Hello at ${new Date().toLocaleTimeString()}`)}>
          Send message
        </button>
      </div>
      <p>message: <strong>{message}</strong></p>
      <p style={{ fontSize: 12, color: '#888' }}>Open 2 tabs to see sync</p>
    </div>
  )
}

function LoggerDemo() {
  const count = useStorageSubscribe(loggerStorage, (s) => s.count)

  return (
    <div>
      <div style={buttonRow}>
        <button onClick={() => loggerStorage.set('count', (loggerStorage.get<number>('count') || 0) + 1)}>
          count++ (см. консоль)
        </button>
        <button onClick={() => loggerStorage.get('count')}>get (не логируется)</button>
        <button onClick={() => loggerStorage.reset()}>reset</button>
      </div>
      <p>count: <strong>{count}</strong> — открой консоль: пишущие действия логируются, чтения молчат</p>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function MiddlewaresExample() {
  return (
    <div style={cardStyle}>
      <h2>Middlewares</h2>
      <p>
        Middleware перехватывают операции хранилища (set, get, delete, clear) и могут
        модифицировать, фильтровать или группировать их.
      </p>

      {/* ─── Конфигурация ────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Конфигурация</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<MyState>({
  name: 'my-store',
  initialState: { ... },
  middlewares: (getDefault) => [
    getDefault().batching({ batchSize: 5, batchDelay: 100 }),
    getDefault().shallowCompare(),
  ],
})
await storage.initialize()

// getDefault() возвращает объект с встроенными middleware:
// - batching(options?)   — группировка быстрых записей
// - shallowCompare(options?) — фильтрация идентичных значений

// Порядок в массиве = порядок обработки`}</pre>

      {/* ─── Batching ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>1. Batching Middleware</h3>
      <pre style={codeBlock}>{`import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<{ counter: number; items: string[] }>({
  name: 'batching-demo',
  initialState: { counter: 0, items: [] },
  middlewares: (getDefault) => [
    getDefault().batching({
      batchSize: 5,     // максимум операций в одном батче
      batchDelay: 100,  // задержка перед flush (ms)
    }),
  ],
})
await storage.initialize()

// 20 быстрых set — до хранилища дойдёт только последнее значение
for (let i = 0; i < 20; i++) {
  storage.set('counter', i)
}
// counter = 19 (не 20 уведомлений, а одно)

// Несколько set на один ключ — сохранится последний
storage.set('items', ['a'])
storage.set('items', ['a', 'b'])
storage.set('items', ['a', 'b', 'c'])
// items = ['a', 'b', 'c']`}</pre>
      <BatchingDemo />

      {/* ─── ShallowCompare ──────────────────────────────────────────── */}
      <h3 style={sectionTitle}>2. ShallowCompare Middleware</h3>
      <pre style={codeBlock}>{`const storage = new MemoryStorage<{ user: { name: string; age: number } }>({
  name: 'shallow-demo',
  initialState: { user: { name: 'Alice', age: 30 } },
  middlewares: (getDefault) => [
    getDefault().shallowCompare(),
  ],
})
await storage.initialize()

// Установка идентичного объекта — обновление НЕ произойдёт
storage.set('user', { name: 'Alice', age: 30 })  // skip

// Установка отличающегося объекта — обновление произойдёт
storage.set('user', { name: 'Bob', age: 25 })    // update`}</pre>
      <ShallowCompareDemo />

      {/* ─── Custom comparator ───────────────────────────────────────── */}
      <h3 style={sectionTitle}>3. ShallowCompare + Custom Comparator</h3>
      <pre style={codeBlock}>{`const storage = new MemoryStorage<{ score: number }>({
  name: 'custom-cmp',
  initialState: { score: 0 },
  middlewares: (getDefault) => [
    getDefault().shallowCompare({
      // Кастомная функция сравнения
      comparator: (prev, next) => {
        if (typeof prev === 'number' && typeof next === 'number') {
          return Math.abs(prev - next) < 5  // разница < 5 = "одинаковые"
        }
        return prev === next
      },
    }),
  ],
})
await storage.initialize()

storage.set('score', 2)   // skip (diff < 5)
storage.set('score', 10)  // update (diff >= 5)`}</pre>
      <CustomComparatorDemo />

      {/* ─── Combined ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>4. Комбинирование middlewares</h3>
      <pre style={codeBlock}>{`const storage = new MemoryStorage<{ value: string; count: number }>({
  name: 'combined',
  initialState: { value: 'hello', count: 0 },
  middlewares: (getDefault) => [
    // Порядок важен: сначала фильтрация, потом батчинг
    getDefault().shallowCompare(),
    getDefault().batching({ batchSize: 3, batchDelay: 50 }),
  ],
})
await storage.initialize()

// shallowCompare отфильтрует дубликаты, batching сгруппирует остальное
storage.set('value', 'hello')  // skip (shallowCompare)
storage.set('value', 'hello')  // skip (shallowCompare)
storage.set('value', 'world')  // пройдёт → в батч`}</pre>
      <CombinedDemo />

      {/* ─── BroadcastMiddleware ─────────────────────────────────────── */}
      <h3 style={sectionTitle}>5. BroadcastMiddleware (cross-tab sync)</h3>
      <pre style={codeBlock}>{`import { MemoryStorage, syncBroadcastMiddleware } from 'synapse-storage/core'

const storage = new MemoryStorage<{ message: string }>({
  name: 'broadcast-demo',
  initialState: { message: 'No messages' },
  middlewares: () => [
    syncBroadcastMiddleware({
      storageName: 'broadcast-demo',
      storageType: 'memory',
    }),
  ],
})
await storage.initialize()

// Изменения будут синхронизироваться между вкладками
storage.set('message', 'Hello from tab!')

// Для MemoryStorage — полная синхронизация данных
// Для LocalStorage/IndexedDB — только уведомление подписчиков
// (данные уже синхронны через storage engine)`}</pre>
      <BroadcastDemo />

      {/* ─── Logger ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>6. Logger Middleware (dev-only)</h3>
      <pre style={codeBlock}>{`const storage = new MemoryStorage<{ count: number }>({
  name: 'logged',
  initialState: { count: 0 },
  // Подключайте только в dev:
  middlewares: (getDefault) =>
    import.meta.env.DEV ? [getDefault().logger({ collapsed: true })] : [],
})
await storage.initialize()

storage.set('count', 1)   // → [synapse storage] set "count" (0ms) + prev/next
storage.get('count')      // чтения НЕ логируются

// Опции: { collapsed?: boolean; showState?: boolean }
// Standalone: loggerMiddleware (async) / syncLoggerMiddleware (sync)`}</pre>
      <LoggerDemo />

      {/* ─── Типы ────────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Типы</h3>
      <pre style={codeBlock}>{`import type {
  SyncMiddleware,         // Middleware для sync-хранилищ (Memory, LocalStorage)
  AsyncMiddleware,        // Middleware для async-хранилищ (IndexedDB)
  SyncMiddlewareAPI,      // API доступное внутри middleware (getState, dispatch)
  AsyncMiddlewareAPI,
  StorageAction,          // { type: 'set'|'get'|'delete'|'clear', key?, value? }
  SyncStorageConfig,      // Config с middlewares?: ConfigureSyncMiddlewares
  AsyncStorageConfig,     // Config с middlewares?: ConfigureAsyncMiddlewares
  BatchingMiddlewareOptions,     // { batchSize?, batchDelay? }
  ShallowCompareMiddlewareOptions, // { comparator?, segments? }
} from 'synapse-storage/core'

// Конфигурация middleware — callback с getDefault
type ConfigureSyncMiddlewares = (
  getDefault: () => SyncDefaultMiddlewares
) => SyncMiddleware[]

interface SyncDefaultMiddlewares {
  batching(options?: BatchingMiddlewareOptions): SyncMiddleware
  shallowCompare(options?: ShallowCompareMiddlewareOptions): SyncMiddleware
  logger(options?: LoggerMiddlewareOptions): SyncMiddleware  // dev-only
}

// Аналогичные AsyncDefaultMiddlewares для IndexedDB`}</pre>
    </div>
  )
}
