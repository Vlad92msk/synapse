# SSR-гидрация (hydrate)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HydrateExample.tsx)

**TL;DR:** `storage.hydrate(state)` засевает стор готовым снапшотом. Основной сценарий — **SSR**: серверный снапшот попадает в клиентский стор до первого рендера, без мерцания и лишнего запроса.

## Зачем

`storage.hydrate(state)` заменяет состояние хранилища готовым снапшотом. Сервер сериализует состояние (например, первую страницу покемонов), клиент инициализирует им хранилище — первый рендер идёт уже с данными.

- **Sync-хранилища** (`MemoryStorage`, `LocalStorage`): `hydrate(state): void`
- **Async-хранилища** (`IndexedDBStorage`): `hydrate(state): Promise<void>`

## Когда использовать

- SSR/SSG: серверный снапшот нужно перенести в клиентский стор **до** первого рендера (без мигания, без повторного фетча).
- SPA с серверными данными: подмена состояния при навигации (`hydrate` после `initialize()` уведомляет подписчиков).

## Когда НЕ нужно

- Работаешь на уровне модуля `createSynapse`/[`createSynapseCtx`](./synapse-ctx.md) — там снапшот сеется пропом `dehydratedState`, «голый» `hydrate` вызывать не нужно.
- У провайдера **нет** серверных данных — гидрировать нечем; C-форма и так строит на сервере пустой стор из `initialState` (см. ниже).

## Поток сервер → клиент

Та же логика, что в реальном Next.js `page.tsx`: на сервере фетчим первую страницу и собираем
сериализуемый снапшот, на клиенте — засеваем им стор до первого рендера.

```typescript
// ── СЕРВЕР (Next.js Server Component / page.tsx) ──────────────────────────
// Фетчим первую страницу покемонов и формируем снапшот стора.
async function fetchFirstPokemonOnServer(): Promise<{ pokemonList: PokemonBrief[] }> {
  const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=12&offset=0')
  const data = await res.json()
  const pokemonList = data.results.map((p) => {
    const id = Number(p.url.split('/').filter(Boolean).pop())
    return { id, name: p.name, sprite: `.../sprites/pokemon/${id}.png` }
  })
  return { pokemonList } // уходит пропом в client-компонент
}
```

## Гидрация до initialize()

Вызванная **до** `initialize()`, `hydrate` засевает хранилище так, что инициализация
не перезатирает его `initialState`-ом — серверное состояние побеждает.

```typescript
import { MemoryStorage } from 'synapse-storage/core'

const storage = new MemoryStorage<{ pokemonList: PokemonBrief[] }>({
  name: 'pokemon-ssr',
  initialState: { pokemonList: [] },   // дефолт для «чистого» клиента
})

// На клиенте: снапшот пришёл с сервера пропом
storage.hydrate(serverState)

await storage.initialize()   // initialState НЕ перезатрёт гидрированное состояние
```

Первый клиентский рендер идёт уже со списком покемонов — без мигания и без повторного фетча.

## Гидрация после initialize()

Вызванная **после** `initialize()`, `hydrate` заменяет состояние и уведомляет подписчиков
(селекторы, React-хуки реактивно обновятся).

```typescript
await storage.initialize()

// позже, например при навигации между страницами в SPA с серверными данными
storage.hydrate(nextPageState)
// подписчики получат новое состояние
```

## С persist-миграциями

Если задана [`version`](./persist-migration.md), `hydrate` фиксирует текущую версию схемы:
серверный снапшот считается уже актуальным, миграция на нём не запускается.

## React / createSynapse

`hydrate` доступен на `synapse.storage` после сборки модуля:

```typescript
const synapse = await pokemonSynapse.ready()
synapse.storage.hydrate(serverState)
```

Чаще удобнее работать на уровне модуля: [`createSynapseCtx`](./synapse-ctx.md) готовит снапшот через
`dehydrate` и синхронно сеет стор через проп `dehydratedState` (SSR включён by construction, флаг `ssr`
не нужен) — ту же задачу решает целиком для модуля, а не для «голого» хранилища.

Для провайдера, у которого серверных данных **нет**, но который всё равно не должен блокировать SSR
(«фоновый» шелл над большим поддеревом — presence, relations, media-player), снапшота для гидрации
не существует. Тогда [ничего специального делать не нужно](./synapse-ctx.md#ssr--фоновые-провайдеры-без-серверных-данных):
C-форма синхронна, поэтому модуль сам строит на сервере «пустой» стор из `initialState` (`buildSyncShell`),
чтобы его `children` попали в HTML, а на клиенте апгрейдится до реального стора (эффекты стартуют в браузере).

## Типы

```typescript
interface ISyncStorage<T> {
  hydrate(state: T): void
  // ...
}

interface IAsyncStorage<T> {
  hydrate(state: T): Promise<void>
  // ...
}
```

## См. также

- [Persist-миграции](./persist-migration.md)
- [createSynapseCtx](./synapse-ctx.md) · [Pokemon (полный пример)](./pokemon-advanced.md)
