# createEventBus — Шина событий

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/EventBusExample.tsx)

Pub/sub шина для общения между модулями. Построена на createSynapse + MemoryStorage + Dispatcher. Поддерживает wildcard-паттерны, приоритеты, TTL, историю событий.

## Импорты

```typescript
import { createEventBus } from 'synapse-storage/utils'
```

## Создание

```typescript
const eventBusHandle = createEventBus({
  name: 'app-events',        // имя (для singleton/отладки)
  autoCleanup: true,          // автоочистка старых событий
  maxEvents: 1000,            // макс. хранимых событий (по умолчанию 1000)
})

// createEventBus возвращает SynapseModule-handle (ленивый, PromiseLike) —
// фабрика исполняется при первом await/ready()
const eventBus = await eventBusHandle

// Результат:
// {
//   storage: ISyncStorage<EventBusState>   — хранилище состояния
//   actions: EventBusActions               — типизированные экшены
//   dispatcher: Dispatcher                 — raw dispatcher
//   selectors: {}
//   destroy: () => Promise<void>           — очистка
// }

// EventBusState:
// {
//   events: Record<string, EventBusEvent>
//   subscriptions: Record<string, SubscriptionInfo>
// }
```

## actions.publish() — Публикация события

```typescript
const eventBus = await createEventBus({ name: 'my-bus' })

// Публикация события
const result = await eventBus.actions.publish({
  event: 'USER_UPDATED',           // тип события (строка)
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
// }
```

## actions.subscribe() — Подписка на события

```typescript
// Подписка на конкретное событие
const { subscriptionId, unsubscribe } = await eventBus.actions.subscribe({
  eventPattern: 'USER_UPDATED',    // точное совпадение
  handler: (data, event) => {
    // data — event.data (полезная нагрузка)
    // event — полный объект EventBusEvent
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
    console.log('Любое событие:', event.event)
  },
})

// Фильтр по приоритету
await eventBus.actions.subscribe({
  eventPattern: 'NOTIFICATION_*',
  handler: (data, event) => { ... },
  options: { priority: 'high' },   // только высокоприоритетные события
})

// Отписка
unsubscribe()
```

## actions.getEventHistory() — История событий

```typescript
// Получить историю по типу события
const history = await eventBus.actions.getEventHistory({
  eventType: 'USER_UPDATED',      // тип события
  limit: 10,                       // макс. записей (по умолчанию 100)
})

// Возвращает EventBusEvent[] — отсортировано по timestamp (сначала новые)
// [
//   { id: '...', event: 'USER_UPDATED', data: {...}, timestamp: 1716633600000 },
//   { id: '...', event: 'USER_UPDATED', data: {...}, timestamp: 1716633500000 },
// ]
```

## actions.getActiveSubscriptions() — Активные подписки

```typescript
const subscriptions = await eventBus.actions.getActiveSubscriptions()

// Возвращает массив:
// [
//   {
//     id: string,          — ID подписки
//     pattern: string,     — паттерн ('USER_*', '*', и т.д.)
//     options: {...},       — опции (приоритет и т.д.)
//     createdAt: number,   — время создания
//   }
// ]
```

## actions.clearEvents() — Очистка событий

```typescript
// Очистить старые события
await eventBus.actions.clearEvents({
  olderThan: 60000,                // удалить события старше 60 секунд
})

// Очистить все события
await eventBus.actions.clearEvents({})
```

## destroy()

```typescript
// Полная очистка: подписки, хранилище, dispatcher
await eventBus.destroy()
```

## Пример: Общение между модулями

```typescript
// module-a.ts — публикует события
const bus = await eventBusHandle

export async function saveUser(user: User) {
  await api.saveUser(user)
  await bus.actions.publish({
    event: 'USER_SAVED',
    data: { userId: user.id },
    metadata: { priority: 'high' },
  })
}

// module-b.ts — слушает события
const bus = await eventBusHandle

bus.actions.subscribe({
  eventPattern: 'USER_SAVED',
  handler: (data) => {
    // Обновить кэш, отправить уведомление и т.д.
    console.log('Пользователь сохранён:', data.userId)
  },
})

// module-c.ts — слушает все USER_* события
bus.actions.subscribe({
  eventPattern: 'USER_*',
  handler: (data, event) => {
    analytics.track(event.event, data)
  },
})
```
