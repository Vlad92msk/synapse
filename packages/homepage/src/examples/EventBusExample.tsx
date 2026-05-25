import { useState, useEffect, useRef } from 'react'
import { createEventBus } from 'synapse-storage/utils'
import { cardStyle, buttonRow, codeBlock, sectionTitle } from './styles'

// ─── Создание EventBus ──────────────────────────────────────────────────────

const eventBusPromise = createEventBus({
  name: 'demo-events',
  autoCleanup: true,
  maxEvents: 50,
})

// ─── Компонент-пример ───────────────────────────────────────────────────────

export function EventBusExample() {
  return (
    <div style={cardStyle}>
      <h2>createEventBus — событийная шина</h2>
      <p>
        Pub/sub шина для связи между модулями. Построена на createSynapse + MemoryStorage + Dispatcher.
        Поддерживает wildcard-паттерны, приоритеты, TTL, историю событий.
      </p>

      {/* ─── Импорты ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Импорты</h3>
      <pre style={codeBlock}>{`import { createEventBus } from 'synapse-storage/utils'`}</pre>

      {/* ─── Создание ─────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Создание</h3>
      <pre style={codeBlock}>{`const eventBusPromise = createEventBus({
  name: 'app-events',        // имя (для singleton/debug)
  autoCleanup: true,          // авто-очистка старых событий
  maxEvents: 1000,            // максимум хранимых событий (по умолчанию 1000)
})

// createEventBus возвращает Promise<SynapseStoreWithDispatcher>
const eventBus = await eventBusPromise

// Результат:
// {
//   storage: ISyncStorage<EventBusState>   — хранилище состояния
//   actions: EventBusActions               — типизированные action'ы
//   dispatcher: Dispatcher                 — raw dispatcher
//   selectors: {}
//   destroy: () => Promise<void>           — очистка
// }

// EventBusState:
// {
//   events: Record<string, EventBusEvent>
//   subscriptions: Record<string, SubscriptionInfo>
// }`}</pre>

      {/* ─── publish ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>actions.publish() — публикация события</h3>
      <pre style={codeBlock}>{`const eventBus = await createEventBus({ name: 'my-bus' })

// Публикация события
const result = await eventBus.actions.publish({
  event: 'USER_UPDATED',           // тип события (string)
  data: { userId: 123, name: 'John' },  // произвольные данные
  metadata: {                       // опциональные метаданные
    priority: 'high',               // 'low' | 'normal' | 'high'
    ttl: 60000,                     // время жизни события (мс)
  },
})

// Результат:
// {
//   eventId: string    — уникальный ID события
//   event: string      — тип события
//   data: any          — данные
// }

// EventBusEvent (хранится в storage):
// {
//   id: string
//   event: string
//   data: any
//   metadata: { ttl?: number | null, priority?: 'low' | 'normal' | 'high' }
//   timestamp: number
// }`}</pre>

      {/* ─── subscribe ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>actions.subscribe() — подписка на события</h3>
      <pre style={codeBlock}>{`// Подписка на конкретное событие
const { subscriptionId, unsubscribe } = await eventBus.actions.subscribe({
  eventPattern: 'USER_UPDATED',    // точное совпадение
  handler: (data, event) => {
    // data — event.data (payload)
    // event — полный EventBusEvent объект
    console.log(data)               // { userId: 123, name: 'John' }
    console.log(event.event)        // 'USER_UPDATED'
    console.log(event.timestamp)    // 1716633600000
  },
})

// Wildcard-паттерны
await eventBus.actions.subscribe({
  eventPattern: 'USER_*',          // все события, начинающиеся с USER_
  handler: (data, event) => {      // USER_UPDATED, USER_DELETED, USER_CREATED...
    console.log(event.event, data)
  },
})

await eventBus.actions.subscribe({
  eventPattern: '*',               // ВСЕ события
  handler: (data, event) => {
    console.log('Any event:', event.event)
  },
})

// Фильтр по приоритету
await eventBus.actions.subscribe({
  eventPattern: 'NOTIFICATION_*',
  handler: (data, event) => { ... },
  options: { priority: 'high' },   // только high-priority события
})

// Отписка
unsubscribe()`}</pre>

      {/* ─── getEventHistory ──────────────────────────────────────────── */}
      <h3 style={sectionTitle}>actions.getEventHistory() — история событий</h3>
      <pre style={codeBlock}>{`// Получить историю по типу события
const history = await eventBus.actions.getEventHistory({
  eventType: 'USER_UPDATED',      // тип события
  limit: 10,                       // максимум записей (по умолчанию 100)
})

// Возвращает EventBusEvent[] — отсортированные по timestamp (новые первые)
// [
//   { id: '...', event: 'USER_UPDATED', data: {...}, timestamp: 1716633600000 },
//   { id: '...', event: 'USER_UPDATED', data: {...}, timestamp: 1716633500000 },
// ]`}</pre>

      {/* ─── getActiveSubscriptions ───────────────────────────────────── */}
      <h3 style={sectionTitle}>actions.getActiveSubscriptions() — активные подписки</h3>
      <pre style={codeBlock}>{`const subscriptions = await eventBus.actions.getActiveSubscriptions()

// Возвращает массив:
// [
//   {
//     id: string,          — ID подписки
//     pattern: string,     — паттерн ('USER_*', '*', etc.)
//     options: {...},       — опции (priority, etc.)
//     createdAt: number,   — timestamp создания
//   }
// ]`}</pre>

      {/* ─── clearEvents ──────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>actions.clearEvents() — очистка событий</h3>
      <pre style={codeBlock}>{`// Очистить старые события
await eventBus.actions.clearEvents({
  olderThan: 60000,                // удалить события старше 60 секунд
})

// Очистить все события
await eventBus.actions.clearEvents({})`}</pre>

      {/* ─── destroy ──────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>destroy()</h3>
      <pre style={codeBlock}>{`// Полная очистка: подписки, хранилище, dispatcher
await eventBus.destroy()`}</pre>

      {/* ─── Пример: модули ───────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Пример: связь между модулями</h3>
      <pre style={codeBlock}>{`// module-a.ts — публикует события
const bus = await eventBusPromise

export async function saveUser(user: User) {
  await api.saveUser(user)
  await bus.actions.publish({
    event: 'USER_SAVED',
    data: { userId: user.id },
    metadata: { priority: 'high' },
  })
}

// module-b.ts — слушает события
const bus = await eventBusPromise

bus.actions.subscribe({
  eventPattern: 'USER_SAVED',
  handler: (data) => {
    // Обновить кэш, отправить уведомление, etc.
    console.log('User saved:', data.userId)
  },
})

// module-c.ts — слушает все USER_* события
bus.actions.subscribe({
  eventPattern: 'USER_*',
  handler: (data, event) => {
    analytics.track(event.event, data)
  },
})`}</pre>

      {/* ─── Live demo ────────────────────────────────────────────────── */}
      <h3 style={sectionTitle}>Live Demo</h3>
      <EventPublisher />
      <EventSubscriber />
      <EventHistoryPanel />
    </div>
  )
}

// ─── Демо-компоненты ────────────────────────────────────────────────────────

function EventPublisher() {
  const [bus, setBus] = useState<Awaited<typeof eventBusPromise> | null>(null)
  const [publishCount, setPublishCount] = useState(0)

  useEffect(() => {
    eventBusPromise.then(setBus)
  }, [])

  if (!bus) return <div>Initializing EventBus...</div>

  const { actions } = bus

  return (
    <div style={{ padding: 8, background: '#fff3e0', borderRadius: 4 }}>
      <strong>Demo: Publisher</strong>
      <div style={buttonRow}>
        <button onClick={async () => {
          await actions.publish({
            event: 'USER_CLICKED',
            data: { button: 'save', timestamp: Date.now() },
          })
          setPublishCount((c) => c + 1)
        }}>
          publish USER_CLICKED
        </button>

        <button onClick={async () => {
          await actions.publish({
            event: 'DATA_LOADED',
            data: { items: [1, 2, 3], source: 'api' },
            metadata: { priority: 'high' },
          })
          setPublishCount((c) => c + 1)
        }}>
          publish DATA_LOADED (high)
        </button>

        <button onClick={async () => {
          await actions.publish({
            event: 'NOTIFICATION_SENT',
            data: { message: 'Hello!', type: 'info' },
            metadata: { priority: 'low' },
          })
          setPublishCount((c) => c + 1)
        }}>
          publish NOTIFICATION_SENT (low)
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#888' }}>Published: {publishCount} events</div>
    </div>
  )
}

function EventSubscriber() {
  const [bus, setBus] = useState<Awaited<typeof eventBusPromise> | null>(null)
  const [events, setEvents] = useState<Array<{ pattern: string; event: string; data: any; time: string }>>([])
  const unsubRefs = useRef<Array<{ id: string; unsub: VoidFunction }>>([])
  const [subs, setSubs] = useState<string[]>([])

  useEffect(() => {
    eventBusPromise.then(setBus)
    return () => {
      unsubRefs.current.forEach(({ unsub }) => unsub())
    }
  }, [])

  if (!bus) return null

  const { actions } = bus

  const subscribe = async (pattern: string) => {
    const result = await actions.subscribe({
      eventPattern: pattern,
      handler: (data, event) => {
        setEvents((prev) => [
          { pattern, event: event.event, data, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 19),
        ])
      },
    })
    unsubRefs.current.push({ id: result.subscriptionId, unsub: result.unsubscribe })
    setSubs((prev) => [...prev, `${pattern} (${result.subscriptionId.slice(0, 8)}...)`])
  }

  return (
    <div style={{ padding: 8, background: '#e8f5e9', borderRadius: 4, marginTop: 8 }}>
      <strong>Demo: Subscriber</strong>
      <div style={buttonRow}>
        <button onClick={() => subscribe('USER_CLICKED')}>subscribe('USER_CLICKED')</button>
        <button onClick={() => subscribe('DATA_*')}>subscribe('DATA_*')</button>
        <button onClick={() => subscribe('*')}>subscribe('*')</button>
      </div>

      {subs.length > 0 && (
        <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
          Active: {subs.join(', ')}
        </div>
      )}

      {events.length > 0 && (
        <div style={{ maxHeight: 150, overflow: 'auto', fontSize: 11, fontFamily: 'monospace' }}>
          {events.map((e, i) => (
            <div key={i} style={{ borderBottom: '1px solid #ddd', padding: '2px 0' }}>
              <span style={{ color: '#888' }}>{e.time}</span>{' '}
              <span style={{ color: '#2196f3' }}>[{e.pattern}]</span>{' '}
              <strong>{e.event}</strong>: {JSON.stringify(e.data)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EventHistoryPanel() {
  const [bus, setBus] = useState<Awaited<typeof eventBusPromise> | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [allSubs, setAllSubs] = useState<any[]>([])

  useEffect(() => {
    eventBusPromise.then(setBus)
  }, [])

  if (!bus) return null

  const { actions } = bus

  return (
    <div style={{ padding: 8, background: '#f3e5f5', borderRadius: 4, marginTop: 8 }}>
      <strong>Demo: History & Management</strong>
      <div style={buttonRow}>
        <button onClick={async () => {
          const h = await actions.getEventHistory({ eventType: 'USER_CLICKED', limit: 5 })
          setHistory(h)
        }}>
          getEventHistory('USER_CLICKED', 5)
        </button>

        <button onClick={async () => {
          const s = await actions.getActiveSubscriptions(undefined as any)
          setAllSubs(s)
        }}>
          getActiveSubscriptions()
        </button>

        <button onClick={async () => {
          await actions.clearEvents({ olderThan: 5000 })
          setHistory([])
        }}>
          clearEvents({'{ olderThan: 5000 }'})
        </button>

        <button onClick={async () => {
          await actions.clearEvents({})
          setHistory([])
        }}>
          clearEvents({'{ }'}) — all
        </button>
      </div>

      {history.length > 0 && (
        <div style={{ fontSize: 11, fontFamily: 'monospace' }}>
          <strong>History:</strong>
          <pre style={{ ...codeBlock, fontSize: 11, maxHeight: 100, overflow: 'auto' }}>{JSON.stringify(history, null, 2)}</pre>
        </div>
      )}

      {allSubs.length > 0 && (
        <div style={{ fontSize: 11, fontFamily: 'monospace' }}>
          <strong>Subscriptions:</strong>
          <pre style={{ ...codeBlock, fontSize: 11, maxHeight: 100, overflow: 'auto' }}>{JSON.stringify(allSubs, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
