import { useState, useEffect, useRef } from 'react'
import { createEventBus } from 'synapse-storage/utils'
import { cardStyle, buttonRow } from './styles'

/**
 * Пример 8: createEventBus() — событийная шина для связи между модулями
 */

// Создаем EventBus
const eventBusPromise = createEventBus({
  name: 'demo-events',
  autoCleanup: true,
  maxEvents: 50,
})

function EventPublisher() {
  const [bus, setBus] = useState<Awaited<typeof eventBusPromise> | null>(null)
  const [publishCount, setPublishCount] = useState(0)

  useEffect(() => {
    eventBusPromise.then(setBus)
  }, [])

  if (!bus) return <div>Initializing EventBus...</div>

  const actions = bus.actions

  return (
    <div style={{ padding: 8, background: '#fff3e0', borderRadius: 4 }}>
      <h4>Publisher</h4>
      <div style={buttonRow}>
        <button onClick={async () => {
          await actions.publish({
            event: 'USER_CLICKED',
            data: { button: 'save', timestamp: Date.now() },
          })
          setPublishCount((c) => c + 1)
        }}>
          Publish USER_CLICKED
        </button>

        <button onClick={async () => {
          await actions.publish({
            event: 'DATA_LOADED',
            data: { items: [1, 2, 3], source: 'api' },
            metadata: { priority: 'high' },
          })
          setPublishCount((c) => c + 1)
        }}>
          Publish DATA_LOADED (high priority)
        </button>

        <button onClick={async () => {
          await actions.publish({
            event: 'NOTIFICATION_SENT',
            data: { message: 'Hello!', type: 'info' },
            metadata: { priority: 'low' },
          })
          setPublishCount((c) => c + 1)
        }}>
          Publish NOTIFICATION_SENT (low)
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

  const actions = bus.actions

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
      <h4>Subscriber</h4>
      <div style={buttonRow}>
        <button onClick={() => subscribe('USER_CLICKED')}>
          Subscribe to USER_CLICKED
        </button>
        <button onClick={() => subscribe('DATA_*')}>
          Subscribe to DATA_* (wildcard)
        </button>
        <button onClick={() => subscribe('*')}>
          Subscribe to * (all events)
        </button>
      </div>

      {subs.length > 0 && (
        <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
          Active subscriptions: {subs.join(', ')}
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

  const actions = bus.actions

  return (
    <div style={{ padding: 8, background: '#f3e5f5', borderRadius: 4, marginTop: 8 }}>
      <h4>History & Management</h4>
      <div style={buttonRow}>
        <button onClick={async () => {
          const h = await actions.getEventHistory({ eventType: 'USER_CLICKED', limit: 5 })
          setHistory(h)
        }}>
          Get USER_CLICKED history (last 5)
        </button>

        <button onClick={async () => {
          const s = await actions.getActiveSubscriptions(undefined as any)
          setAllSubs(s)
        }}>
          Get active subscriptions
        </button>

        <button onClick={async () => {
          await actions.clearEvents({ olderThan: 5000 })
          setHistory([])
        }}>
          Clear events older than 5s
        </button>

        <button onClick={async () => {
          await actions.clearEvents({})
          setHistory([])
        }}>
          Clear all events
        </button>
      </div>

      {history.length > 0 && (
        <div style={{ fontSize: 11, fontFamily: 'monospace' }}>
          <strong>History:</strong>
          <pre style={{ maxHeight: 100, overflow: 'auto' }}>{JSON.stringify(history, null, 2)}</pre>
        </div>
      )}

      {allSubs.length > 0 && (
        <div style={{ fontSize: 11, fontFamily: 'monospace' }}>
          <strong>Subscriptions:</strong>
          <pre style={{ maxHeight: 100, overflow: 'auto' }}>{JSON.stringify(allSubs, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

export function EventBusExample() {
  return (
    <div style={cardStyle}>
      <h2>createEventBus() — event bus</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        Событийная шина для связи между модулями. Построена на createSynapse + MemoryStorage + Dispatcher.
      </p>

      <EventPublisher />
      <EventSubscriber />
      <EventHistoryPanel />

      <h4>API заметки:</h4>
      <ul style={{ fontSize: 12, color: '#666' }}>
        <li><code>createEventBus({'{ name, autoCleanup, maxEvents }'})</code> — создает шину</li>
        <li><code>actions.publish({'{ event, data, metadata }'})</code> — публикация события</li>
        <li><code>actions.subscribe({'{ eventPattern, handler, options }'})</code> — подписка (поддержка wildcard *)</li>
        <li><code>actions.getEventHistory({'{ eventType, limit }'})</code> — история по типу</li>
        <li><code>actions.getActiveSubscriptions()</code> — список активных подписок</li>
        <li><code>actions.clearEvents({'{ olderThan }'})</code> — очистка (опционально по возрасту)</li>
        <li>metadata поддерживает <code>priority</code> ('low' | 'normal' | 'high') и <code>ttl</code></li>
      </ul>
    </div>
  )
}
