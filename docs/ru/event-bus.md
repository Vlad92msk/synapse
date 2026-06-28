# createEventBus — Шина событий

> [Назад к оглавлению](./README.md) · [Песочница (Live demo)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/EventBusExample.tsx)

Pub/sub шина для общения **между независимыми модулями**. Построена на тех же кирпичах, что и
весь BLL: `createSynapse` + `MemoryStorage` + `Dispatcher` (см. [create-synapse-basic](./create-synapse-basic.md)).
Поддерживает wildcard-паттерны, приоритеты, TTL, историю событий.

Где это уместно в нашем домене: модуль pokemon (см. [pokemon-advanced](./pokemon-advanced.md)) знает
только про себя — он грузит список, ведёт избранное, держит выбранного покемона. Если на эти
действия должны реагировать **другие** части приложения (аналитика, тосты, бейдж в шапке), не нужно
связывать их жёстко. Pokemon публикует доменные события (`POKEMON_SELECTED`, `FAVORITE_TOGGLED`), а
кто угодно на них подписывается. Это «паттерн 3 / медиатор» из раздела [dependencies](./dependencies.md),
только оформленный как готовая утилита.

> Сам эталонный модуль pokemon шину **не зашивает** — event-bus это опциональная интеграция поверх
> него, поэтому канонического pokemon-файла у страницы нет, только запускаемая песочница.

## Импорты

```typescript
import { createEventBus } from 'synapse-storage/utils'
```

## Создание

```typescript
const eventBusHandle = createEventBus({
  name: 'pokemon-events',     // имя (для singleton/отладки)
  autoCleanup: true,          // автоочистка старых событий
  maxEvents: 1000,            // макс. хранимых событий (по умолчанию 1000)
})

// createEventBus возвращает SynapseModule-handle (ленивый, PromiseLike) —
// фабрика исполняется при первом await/ready()
const eventBus = await eventBusHandle

// Результат (Synapse<EventBusState, EventBusDispatcher, undefined>):
// {
//   storage: IStorage<EventBusState>       — хранилище состояния
//   actions: EventBusDispatcher            — типизированные экшены (алиас dispatcher)
//   dispatcher: EventBusDispatcher         — тот же инстанс диспетчера
//   selectors: undefined                   — селекторов у шины нет
//   state$: Observable<EventBusState>      — поток состояния (есть всегда)
//   destroy: () => Promise<void>           — очистка
// }

// EventBusState:
// {
//   events: Record<string, EventBusEvent>
//   subscriptions: Record<string, SubscriptionInfo>
// }
```

`actions` и `dispatcher` — один и тот же инстанс `EventBusDispatcher`; его поля (`publish`/`subscribe`/…)
и есть dispatch-функции. Везде ниже используется `eventBus.actions`.

## actions.publish() — Публикация события

```typescript
const eventBus = await createEventBus({ name: 'pokemon-events' })

// Публикация события
const result = await eventBus.actions.publish({
  event: 'POKEMON_SELECTED',            // тип события (строка)
  data: { id: 25, name: 'pikachu' },    // произвольные данные
  metadata: {                           // опциональные метаданные
    priority: 'high',                   // 'low' | 'normal' | 'high'
    ttl: 60000,                         // время жизни события (мс)
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
  eventPattern: 'POKEMON_SELECTED',  // точное совпадение
  handler: (data, event) => {
    // data — event.data (полезная нагрузка)
    // event — полный объект EventBusEvent
    console.log(data)               // { id: 25, name: 'pikachu' }
    console.log(event.event)        // 'POKEMON_SELECTED'
    console.log(event.timestamp)    // 1716633600000
  },
})

// Wildcard-паттерны
await eventBus.actions.subscribe({
  eventPattern: 'POKEMON_*',       // все события, начинающиеся с POKEMON_
  handler: (data, event) => {      // POKEMON_SELECTED, POKEMON_LOADED, ...
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
  eventPattern: 'FAVORITE_*',
  handler: (data, event) => { ... },
  options: { priority: 'high' },   // только высокоприоритетные события
})

// Отписка
unsubscribe()
```

Внутри `subscribe` подписывается на срез `state.events` хранилища: при публикации нового события
все подходящие по паттерну подписчики получают вызов `handler`. Ошибка в обработчике не роняет
шину — она логируется через внутренний `handleCallbackError`.

## actions.getEventHistory() — История событий

```typescript
// Получить историю по типу события
const history = await eventBus.actions.getEventHistory({
  eventType: 'POKEMON_SELECTED',  // тип события
  limit: 10,                       // макс. записей (по умолчанию 100)
})

// Возвращает EventBusEvent[] — отсортировано по timestamp (сначала новые)
// [
//   { id: '...', event: 'POKEMON_SELECTED', data: {...}, timestamp: 1716633600000 },
//   { id: '...', event: 'POKEMON_SELECTED', data: {...}, timestamp: 1716633500000 },
// ]
```

## actions.getActiveSubscriptions() — Активные подписки

```typescript
const subscriptions = await eventBus.actions.getActiveSubscriptions()

// Возвращает массив:
// [
//   {
//     id: string,          — ID подписки
//     pattern: string,     — паттерн ('POKEMON_*', '*', и т.д.)
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

При `autoCleanup: true` старые события подрезаются автоматически при каждой публикации: как только
их число превышает `maxEvents`, остаются только `maxEvents` самых свежих (по `timestamp`).

## destroy()

```typescript
// Полная очистка: активные подписки, хранилище, dispatcher
await eventBus.destroy()
```

`destroy()` сначала вызывает все накопленные `unsubscribe`, затем гасит модуль и сбрасывает
мемоизацию handle (повторный `await eventBusHandle` пересоберёт шину заново).

## Пример: pokemon публикует, другие модули слушают

```typescript
// pokemon-events.ts — общая шина домена
import { createEventBus } from 'synapse-storage/utils'

export const pokemonEventsHandle = createEventBus({ name: 'pokemon-events', autoCleanup: true })

// ─── pokemon-side: публикуем доменные события ────────────────────────────────
// Удобное место — обёртка над намерениями диспетчера (см. dispatcher-detailed)
// или эффект, который уже видит поток действий модуля.
const bus = await pokemonEventsHandle

export async function selectAndAnnounce(store: PokemonSynapse, pokemon: PokemonBrief) {
  store.actions.selectPokemon(pokemon.id)
  await bus.actions.publish({
    event: 'POKEMON_SELECTED',
    data: { id: pokemon.id, name: pokemon.name },
    metadata: { priority: 'high' },
  })
}

// ─── analytics.ts — слушает все события домена ───────────────────────────────
const bus = await pokemonEventsHandle

bus.actions.subscribe({
  eventPattern: 'POKEMON_*',
  handler: (data, event) => {
    analytics.track(event.event, data)   // POKEMON_SELECTED, FAVORITE_TOGGLED, ...
  },
})

// ─── toaster.ts — реагирует только на избранное ─────────────────────────────
bus.actions.subscribe({
  eventPattern: 'FAVORITE_TOGGLED',
  handler: (data) => {
    showToast(`Покемон ${data.name} ${data.added ? 'добавлен в' : 'убран из'} избранное`)
  },
})
```

Модули `analytics` и `toaster` не знают про pokemon-синапс и не импортируют его — связь только через
имена событий. Это и есть развязка, ради которой нужна шина.

## Связь с createSynapse: шина как externalDispatcher

Если нужно не просто слушать события снаружи, а **вливать** их в поток действий другого synapse
(чтобы его эффекты реагировали на события шины как на обычные экшены), шину передают через
`externalDispatchers` — это «вариант коммуникации 3» из раздела [dependencies](./dependencies.md):

```typescript
const bus = await pokemonEventsHandle

const mySynapse = createSynapse(() => ({
  storage,
  dispatcher: new MyDispatcher(storage),
  effects: new MyEffects(),
  externalDispatchers: { eventBus: bus.dispatcher },  // экшены шины попадут в action$
}))
```

## См. также

- [dependencies](./dependencies.md) — паттерны общения модулей (шина = медиатор / externalDispatchers).
- [create-synapse-basic](./create-synapse-basic.md) — из чего собрана сама шина (storage + dispatcher).
- [pokemon-advanced](./pokemon-advanced.md) — эталонный модуль, события которого публикует шина.
