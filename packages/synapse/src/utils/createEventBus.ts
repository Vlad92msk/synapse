import { handleCallbackError } from '../_utils/error-handling.util'
import { ISyncStorage, MemoryStorage } from '../core'
import { Dispatcher } from '../reactive'
import { createSynapse } from './createSynapse'

export interface EventBusEvent {
  id: string
  event: string
  data: any
  metadata: {
    ttl?: number | null
    priority?: 'low' | 'normal' | 'high'
    [key: string]: any
  }
  timestamp: number
}

export interface EventBusState {
  events: Record<string, EventBusEvent>
  subscriptions: Record<string, any>
}

export interface EventBusConfig {
  name?: string
  autoCleanup?: boolean
  maxEvents?: number
}

function matchEventPattern(eventName: string, pattern: string): boolean {
  if (pattern === '*') return true
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    return regex.test(eventName)
  }
  return eventName === pattern
}

function cleanupOldEvents(storage: ISyncStorage<EventBusState>, maxEvents: number): void {
  const state = storage.getState()
  const events = Object.entries(state.events || {})

  if (events.length > maxEvents) {
    const sorted = events.sort((a, b) => b[1].timestamp - a[1].timestamp)
    const toKeep = sorted.slice(0, maxEvents)

    storage.set('events', Object.fromEntries(toKeep))
  }
}

/**
 * Class-диспетчер EventBus. Экшены объявляются как поля (имя экшена = имя поля),
 * сервисы (storage-каст, реестр активных подписок, config) захватываются в замыкания
 * через конструктор.
 */
class EventBusDispatcher extends Dispatcher<EventBusState> {
  /** MemoryStorage синхронный — безопасно кастуем для синхронного API. */
  readonly #sync: ISyncStorage<EventBusState>
  /** Активные подписки для очистки при destroy. */
  readonly #activeSubscriptions = new Map<string, VoidFunction>()
  readonly #config: EventBusConfig

  constructor(storage: MemoryStorage<EventBusState>, config: EventBusConfig) {
    super(storage)
    this.#sync = storage as ISyncStorage<EventBusState>
    this.#config = config
  }

  /** Публикация события в EventBus. */
  readonly publish = this.action(
    (_storage, { event, data, metadata = {} }: { event: string; data: any; metadata?: Record<string, any> }) => {
      const storage = this.#sync
      const eventId = `${event}_${Date.now()}_${Math.random()}`

      storage.set(`events.${eventId}`, {
        id: eventId,
        event,
        data,
        metadata: {
          ttl: metadata.ttl || null,
          priority: metadata.priority || 'normal',
          ...metadata,
        },
        timestamp: Date.now(),
      })

      if (this.#config.autoCleanup) {
        cleanupOldEvents(storage, this.#config.maxEvents || 1000)
      }

      return { eventId, event, data }
    },
    { type: 'PUBLISH_EVENT', meta: { description: 'Публикация события в EventBus' } },
  )

  /** Подписка на события в EventBus. */
  readonly subscribe = this.action(
    (
      _storage,
      {
        eventPattern,
        handler,
        options = {},
      }: {
        eventPattern: string
        handler: (data: any, event: EventBusEvent) => void | Promise<void>
        options?: Record<string, any>
      },
    ) => {
      const storage = this.#sync
      const subscriptionId = `sub_${Date.now()}_${Math.random()}`

      const unsubscribe = storage.subscribe(
        (state) => state.events,
        (events) => {
          Object.values(events || {}).forEach((event) => {
            if (matchEventPattern(event.event, eventPattern)) {
              if (options.priority && event.metadata.priority !== options.priority) {
                return
              }
              try {
                handler(event.data, event)
              } catch (error) {
                handleCallbackError(`EventBus: error in handler for "${event.event}"`, error)
              }
            }
          })
        },
      )

      storage.set(`subscriptions.${subscriptionId}`, {
        id: subscriptionId,
        pattern: eventPattern,
        options,
        createdAt: Date.now(),
      })

      this.#activeSubscriptions.set(subscriptionId, unsubscribe)

      const wrappedUnsubscribe = () => {
        this.#activeSubscriptions.delete(subscriptionId)
        unsubscribe()
      }

      return { subscriptionId, unsubscribe: wrappedUnsubscribe }
    },
    { type: 'SUBSCRIBE_TO_EVENT', meta: { description: 'Подписка на события в EventBus' } },
  )

  /** Получение истории событий. */
  readonly getEventHistory = this.action(
    (_storage, { eventType, limit = 100 }: { eventType: string; limit?: number }) => {
      const state = this.#sync.getState()
      return Object.values(state.events || {})
        .filter((e) => e.event === eventType)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit)
    },
    { type: 'GET_EVENT_HISTORY', meta: { description: 'Получение истории событий' } },
  )

  /** Очистка событий. */
  readonly clearEvents = this.action(
    (_storage, { olderThan }: { olderThan?: number } = {}) => {
      const storage = this.#sync
      if (olderThan) {
        const cutoff = Date.now() - olderThan
        storage.update((state) => {
          Object.keys(state.events || {}).forEach((key) => {
            if (state.events[key].timestamp < cutoff) {
              delete state.events[key]
            }
          })
        })
      } else {
        storage.set('events', {})
      }
    },
    { type: 'CLEAR_EVENTS', meta: { description: 'Очистка событий' } },
  )

  /** Получение активных подписок. */
  readonly getActiveSubscriptions = this.action(
    () => {
      const state = this.#sync.getState()
      return Object.values(state.subscriptions || {})
    },
    { type: 'GET_SUBSCRIPTIONS', meta: { description: 'Получение активных подписок' } },
  )

  override destroy(): void {
    this.#activeSubscriptions.forEach((unsub) => unsub())
    this.#activeSubscriptions.clear()
    super.destroy()
  }
}

/**
 * Создает EventBus для связи между модулями.
 *
 * Возвращает `SynapseModule`-handle (ленивый, PromiseLike): фабрика исполняется при
 * первом `await`/`ready()`. `eventBus.dispatcher` — инстанс class-диспетчера, его поля
 * (`publish`/`subscribe`/...) и есть dispatch-функции.
 *
 * @example
 * ```typescript
 * const eventBus = createEventBus({ name: 'app-events', autoCleanup: true, maxEvents: 500 })
 * const bus = await eventBus
 *
 * bus.dispatcher.publish({ event: 'USER_UPDATED', data: { userId: 123 } })
 * bus.dispatcher.subscribe({ eventPattern: 'CORE_*', handler: (data, event) => {} })
 *
 * // Использование как зависимости / внешнего диспетчера другого synapse:
 * const mySynapse = createSynapse(() => ({
 *   storage,
 *   dispatcher: new MyDispatcher(storage),
 *   effects: new MyEffects(),
 *   externalDispatchers: { eventBus: bus.dispatcher },
 * }))
 * ```
 */
export const createEventBus = (config: EventBusConfig = {}) =>
  createSynapse(() => {
    const storage = new MemoryStorage<EventBusState>({
      name: config.name || 'eventBus',
      initialState: {
        events: {},
        subscriptions: {},
      },
    })

    return {
      storage,
      dispatcher: new EventBusDispatcher(storage, config),
    }
  })
