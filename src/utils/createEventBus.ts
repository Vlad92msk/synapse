import { IStorage, MemoryStorage } from '../core'
import { createDispatcher } from '../reactive'
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

async function cleanupOldEvents(storage: IStorage<EventBusState>, maxEvents: number): Promise<void> {
  const state = await storage.getState()
  const events = Object.entries(state.events || {})

  if (events.length > maxEvents) {
    const sorted = events.sort((a, b) => b[1].timestamp - a[1].timestamp)
    const toKeep = sorted.slice(0, maxEvents)

    await storage.set('events', Object.fromEntries(toKeep))
  }
}

/**
 * Создает EventBus для связи между модулями
 *
 * @example
 * ```typescript
 * // Создание EventBus
 * const eventBus = await createEventBus({
 *   name: 'app-events',
 *   autoCleanup: true,
 *   maxEvents: 500
 * })
 *
 * // Использование в Synapse
 * const mySynapse = await createSynapse({
 *   dependencies: [eventBus],
 *   createEffectConfig: (dispatcher) => ({
 *     dispatchers: {
 *       dispatcher,
 *       eventBus: eventBus.dispatcher
 *     }
 *   }),
 *   effects: [
 *     createEffect((action$, _, __, { eventBus }) => {
 *       // Публикация события
 *       eventBus.dispatch.publish({
 *         event: 'USER_UPDATED',
 *         data: { userId: 123 }
 *       })
 *
 *       // Подписка на события
 *       eventBus.dispatch.subscribe({
 *         eventPattern: 'CORE_*',
 *         handler: (data, event) => console.log('Received:', event.event, data)
 *       })
 *     })
 *   ]
 * })
 * ```
 */
export const createEventBus = (config: EventBusConfig = {}) =>
  createSynapse({
    createStorageFn: async () => {
      return new MemoryStorage<EventBusState>({
        name: config.name || 'eventBus',
        initialState: {
          events: {},
          subscriptions: {},
        },
      }).initialize()
    },

    createDispatcherFn: (storage: IStorage<EventBusState>) =>
      createDispatcher({ storage }, (storage, { createAction }) => ({
        // Публикация события
        publish: createAction({
          type: 'PUBLISH_EVENT',
          meta: { description: 'Публикация события в EventBus' },
          action: async ({ event, data, metadata = {} }: { event: string; data: any; metadata?: Record<string, any> }) => {
            const eventId = `${event}_${Date.now()}_${Math.random()}`

            await storage.set(`events.${eventId}`, {
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

            // Очистка старых событий
            if (config.autoCleanup) {
              await cleanupOldEvents(storage, config.maxEvents || 1000)
            }

            console.log(`📢 Event published: ${event}`, data)
            return { eventId, event, data }
          },
        }),

        // Подписка на события
        subscribe: createAction({
          type: 'SUBSCRIBE_TO_EVENT',
          meta: { description: 'Подписка на события в EventBus' },
          action: async ({
            eventPattern,
            handler,
            options = {},
          }: {
            eventPattern: string
            handler: (data: any, event: EventBusEvent) => void | Promise<void>
            options?: Record<string, any>
          }) => {
            const subscriptionId = `sub_${Date.now()}_${Math.random()}`

            const unsubscribe = storage.subscribe(
              (state) => state.events,
              (events) => {
                Object.values(events || {}).forEach((event) => {
                  // Поддержка паттернов
                  if (matchEventPattern(event.event, eventPattern)) {
                    // Фильтрация по приоритету
                    if (options.priority && event.metadata.priority !== options.priority) {
                      return
                    }

                    try {
                      handler(event.data, event)
                    } catch (error) {
                      console.error(`Error in event handler for ${event.event}:`, error)
                    }
                  }
                })
              },
            )

            // Сохраняем подписку для управления
            await storage.set(`subscriptions.${subscriptionId}`, {
              id: subscriptionId,
              pattern: eventPattern,
              options,
              createdAt: Date.now(),
            })

            console.log(`🔔 Subscribed to: ${eventPattern}`)
            return { subscriptionId, unsubscribe }
          },
        }),

        // Получение истории событий
        getEventHistory: createAction({
          type: 'GET_EVENT_HISTORY',
          meta: { description: 'Получение истории событий' },
          action: async ({ eventType, limit = 100 }: { eventType: string; limit?: number }) => {
            const state = await storage.getState()
            return Object.values(state.events || {})
              .filter((e) => e.event === eventType)
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, limit)
          },
        }),

        // Очистка событий
        clearEvents: createAction({
          type: 'CLEAR_EVENTS',
          meta: { description: 'Очистка событий' },
          action: async ({ olderThan }: { olderThan?: number } = {}) => {
            if (olderThan) {
              const cutoff = Date.now() - olderThan
              await storage.update((state) => {
                Object.keys(state.events || {}).forEach((key) => {
                  if (state.events[key].timestamp < cutoff) {
                    delete state.events[key]
                  }
                })
              })
            } else {
              await storage.set('events', {})
            }
          },
        }),

        // Получение активных подписок
        getActiveSubscriptions: createAction({
          type: 'GET_SUBSCRIPTIONS',
          meta: { description: 'Получение активных подписок' },
          action: async () => {
            const state = await storage.getState()
            return Object.values(state.subscriptions || {})
          },
        }),
      })),
  })
