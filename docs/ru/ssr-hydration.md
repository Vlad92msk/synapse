# SSR-гидрация (hydrate)

> [Назад к оглавлению](./README.md) · [Рабочий пример на GitHub](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/HydrateExample.tsx)

`storage.hydrate(state)` заменяет состояние хранилища готовым снапшотом. Основной сценарий —
**SSR**: сервер сериализует состояние (например, первую страницу покемонов), клиент
инициализирует им хранилище, чтобы избежать мерцания и лишнего запроса данных.

- **Sync-хранилища** (`MemoryStorage`, `LocalStorage`): `hydrate(state): void`
- **Async-хранилища** (`IndexedDBStorage`): `hydrate(state): Promise<void>`

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

Чаще удобнее работать на уровне модуля: [`createSynapseCtx({ ssr: true })`](./synapse-ctx.md)
готовит снапшот через `dehydrate` и синхронно сеет стор на клиенте через проп `dehydratedState` —
ту же задачу решает целиком для модуля, а не для «голого» хранилища.

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
