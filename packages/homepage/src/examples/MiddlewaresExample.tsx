import { useState, useEffect, useCallback } from 'react'
import { MemoryStorage, syncBroadcastMiddleware } from 'synapse-storage/core'
import { useStorageSubscribe } from 'synapse-storage/react'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример 9: Middlewares — batching, shallowCompare, broadcastMiddleware, custom middleware
 */

// --- 1. Batching middleware ---

const batchingStorage = new MemoryStorage<{
  counter: number
  items: string[]
  lastUpdate: string
}>({
  name: 'batching-demo',
  initialState: { counter: 0, items: [], lastUpdate: '' },
  middlewares: (getDefault) => {
    const defaults = getDefault()
    return [
      defaults.batching({ batchSize: 5, batchDelay: 100 }),
    ]
  },
})
batchingStorage.initialize()

function BatchingDemo() {
  const counter = useStorageSubscribe(batchingStorage, (s) => s.counter)
  const items = useStorageSubscribe(batchingStorage, (s) => s.items)
  const [rapidSetCount, setRapidSetCount] = useState(0)

  const rapidFire = useCallback(() => {
    // 20 быстрых обновлений — batching middleware объединит их
    for (let i = 0; i < 20; i++) {
      batchingStorage.set('counter', i)
    }
    setRapidSetCount((c) => c + 1)
  }, [])

  const addItems = useCallback(() => {
    // Несколько set подряд на один ключ — batching сохранит только последний
    const ts = Date.now()
    batchingStorage.set('items', ['a'])
    batchingStorage.set('items', ['a', 'b'])
    batchingStorage.set('items', ['a', 'b', 'c'])
    batchingStorage.set('lastUpdate', `batch at ${ts}`)
  }, [])

  return (
    <div style={{ padding: 8, background: '#fff3e0', borderRadius: 4 }}>
      <h4>1. Batching Middleware</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        Объединяет множественные set/update в батчи. Из 20 rapid-fire записей до хранилища дойдет только последнее значение.
      </p>
      <div style={buttonRow}>
        <button onClick={rapidFire}>Rapid-fire 20 sets on counter</button>
        <button onClick={addItems}>3 sets on items (batch)</button>
      </div>
      <div style={{ fontSize: 12 }}>
        counter: <strong>{counter}</strong> | items: <strong>{JSON.stringify(items)}</strong> | rapid-fire runs: {rapidSetCount}
      </div>
    </div>
  )
}

// --- 2. ShallowCompare middleware ---

const shallowStorage = new MemoryStorage<{
  user: { name: string; age: number }
  renderCount: number
}>({
  name: 'shallow-compare-demo',
  initialState: { user: { name: 'Alice', age: 30 }, renderCount: 0 },
  middlewares: (getDefault) => {
    const defaults = getDefault()
    return [
      defaults.shallowCompare(),
    ]
  },
})
shallowStorage.initialize()

function ShallowCompareDemo() {
  const user = useStorageSubscribe(shallowStorage, (s) => s.user)
  const [setAttempts, setSetAttempts] = useState(0)
  const [actualUpdates, setActualUpdates] = useState(0)

  useEffect(() => {
    const unsub = shallowStorage.subscribe('user', () => {
      setActualUpdates((c) => c + 1)
    })
    return unsub
  }, [])

  return (
    <div style={{ padding: 8, background: '#e3f2fd', borderRadius: 4, marginTop: 8 }}>
      <h4>2. ShallowCompare Middleware</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        Предотвращает лишние обновления при установке идентичных значений.
      </p>
      <div style={buttonRow}>
        <button onClick={() => {
          shallowStorage.set('user', { name: 'Alice', age: 30 })
          setSetAttempts((c) => c + 1)
        }}>
          Set same user (should skip)
        </button>
        <button onClick={() => {
          shallowStorage.set('user', { name: 'Bob', age: 25 })
          setSetAttempts((c) => c + 1)
        }}>
          Set different user
        </button>
        <button onClick={() => {
          shallowStorage.set('user', { name: 'Alice', age: 30 })
          setSetAttempts((c) => c + 1)
        }}>
          Set back to Alice
        </button>
      </div>
      <div style={{ fontSize: 12 }}>
        user: <strong>{JSON.stringify(user)}</strong>
        <br />
        Set attempts: {setAttempts} | Actual storage updates: {actualUpdates}
      </div>
    </div>
  )
}

// --- 3. Custom ShallowCompare with custom comparator ---

const customComparatorStorage = new MemoryStorage<{
  score: number
  data: { x: number; y: number }
}>({
  name: 'custom-comparator-demo',
  initialState: { score: 0, data: { x: 0, y: 0 } },
  middlewares: (getDefault) => {
    const defaults = getDefault()
    return [
      defaults.shallowCompare({
        // Custom comparator: считаем значения равными если разница < 5
        comparator: (prev: any, next: any) => {
          if (typeof prev === 'number' && typeof next === 'number') {
            return Math.abs(prev - next) < 5
          }
          return prev === next
        },
      }),
    ]
  },
})
customComparatorStorage.initialize()

function CustomComparatorDemo() {
  const score = useStorageSubscribe(customComparatorStorage, (s) => s.score)
  const [attempts, setAttempts] = useState(0)

  return (
    <div style={{ padding: 8, background: '#f1f8e9', borderRadius: 4, marginTop: 8 }}>
      <h4>3. Custom Comparator</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        ShallowCompare с кастомным comparator: изменения менее 5 единиц игнорируются.
      </p>
      <div style={buttonRow}>
        <button onClick={() => {
          const current = customComparatorStorage.get<number>('score') || 0
          customComparatorStorage.set('score', current + 2) // +2, разница < 5 -> skip
          setAttempts((c) => c + 1)
        }}>
          +2 (should skip if diff &lt; 5)
        </button>
        <button onClick={() => {
          const current = customComparatorStorage.get<number>('score') || 0
          customComparatorStorage.set('score', current + 10) // +10, разница > 5 -> update
          setAttempts((c) => c + 1)
        }}>
          +10 (should update)
        </button>
        <button onClick={() => {
          customComparatorStorage.set('score', 0)
          setAttempts(0)
        }}>
          Reset
        </button>
      </div>
      <div style={{ fontSize: 12 }}>
        score: <strong>{score}</strong> | attempts: {attempts}
      </div>
    </div>
  )
}

// --- 4. Combining middlewares ---

const combinedStorage = new MemoryStorage<{
  value: string
  count: number
}>({
  name: 'combined-middleware-demo',
  initialState: { value: 'hello', count: 0 },
  middlewares: (getDefault) => {
    const defaults = getDefault()
    return [
      // Порядок важен: сначала shallowCompare (фильтрация), потом batching (группировка)
      defaults.shallowCompare(),
      defaults.batching({ batchSize: 3, batchDelay: 50 }),
    ]
  },
})
combinedStorage.initialize()

function CombinedMiddlewareDemo() {
  const value = useStorageSubscribe(combinedStorage, (s) => s.value)
  const count = useStorageSubscribe(combinedStorage, (s) => s.count)

  return (
    <div style={{ padding: 8, background: '#fce4ec', borderRadius: 4, marginTop: 8 }}>
      <h4>4. Combining Middlewares</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        shallowCompare + batching вместе. Сначала фильтрация, потом батчинг.
      </p>
      <div style={buttonRow}>
        <button onClick={() => {
          combinedStorage.set('value', 'hello')
          combinedStorage.set('value', 'hello')
          combinedStorage.set('value', 'world')
        }}>
          3 sets (2 same + 1 different)
        </button>
        <button onClick={() => {
          combinedStorage.update((s) => { s.count++ })
        }}>
          Increment count
        </button>
      </div>
      <div style={{ fontSize: 12 }}>
        value: <strong>{value}</strong> | count: <strong>{count}</strong>
      </div>
    </div>
  )
}

// --- 5. BroadcastMiddleware (cross-tab sync) ---

const broadcastStorage = new MemoryStorage<{
  sharedMessage: string
  tabId: string
}>({
  name: 'broadcast-demo',
  initialState: { sharedMessage: 'No messages yet', tabId: `tab-${Math.random().toString(36).slice(2, 6)}` },
  middlewares: () => [
    syncBroadcastMiddleware({ storageName: 'broadcast-demo', storageType: 'memory' }),
  ],
})
broadcastStorage.initialize()

function BroadcastDemo() {
  const sharedMessage = useStorageSubscribe(broadcastStorage, (s) => s.sharedMessage)
  const tabId = useStorageSubscribe(broadcastStorage, (s) => s.tabId)

  return (
    <div style={{ padding: 8, background: '#e8eaf6', borderRadius: 4, marginTop: 8 }}>
      <h4>5. BroadcastMiddleware (cross-tab sync)</h4>
      <p style={{ fontSize: 12, color: '#666' }}>
        Синхронизация MemoryStorage между вкладками через BroadcastChannel API.
        Откройте 2 вкладки чтобы увидеть синхронизацию.
      </p>
      <div style={buttonRow}>
        <button onClick={() => broadcastStorage.set('sharedMessage', `Hello from ${tabId} at ${new Date().toLocaleTimeString()}`)}>
          Send message from this tab
        </button>
      </div>
      <div style={{ fontSize: 12 }}>
        Tab ID: <strong>{tabId}</strong>
        <br />
        Shared message: <strong>{sharedMessage}</strong>
      </div>
    </div>
  )
}

export function MiddlewaresExample() {
  return (
    <div style={cardStyle}>
      <h2>Storage Middlewares</h2>

      <BatchingDemo />
      <ShallowCompareDemo />
      <CustomComparatorDemo />
      <CombinedMiddlewareDemo />
      <BroadcastDemo />

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li>
          <code>middlewares: (getDefault) =&gt; [...]</code> — конфигурация через callback
        </li>
        <li>
          <code>getDefault().batching({'{ batchSize, batchDelay }'})</code> — группировка быстрых записей
        </li>
        <li>
          <code>getDefault().shallowCompare({'{ comparator?, segments? }'})</code> — фильтрация одинаковых значений
        </li>
        <li>
          <code>syncBroadcastMiddleware({'{ storageName, storageType }'})</code> — cross-tab sync через BroadcastChannel
        </li>
        <li>Порядок middleware в массиве определяет порядок обработки</li>
        <li>broadcastMiddleware для MemoryStorage синхронизирует данные; для LocalStorage/IndexedDB только уведомляет подписчиков</li>
      </ul>
    </div>
  )
}
