# createSynapse (базовый)

> [Назад к оглавлению](./README.md) · [Сборка модуля (`pokemon.synapse.ts`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/pokemon.synapse.ts) · [Минимальная песочница (storage + selectors)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/CreateSynapseBasicExample.tsx)

`createSynapse(factory)` собирает **слой управления данными** в один ленивый модуль.
Минимальная форма — **хранилище + селекторы**, без диспетчера и эффектов: изменения идут
через хранилище напрямую. Диспетчер и эффекты добавим на следующих страницах
([Dispatcher](./create-synapse-dispatcher.md), [Effects](./create-synapse-effects.md)).

Всё на одном домене — `pokemon-advanced` (см. [Pokemon пример](./pokemon-advanced.md)).
Здесь берём из него ровно два кирпича: `pokemon.store.ts` и `pokemon.selectors.ts`.

## Хранилище и состояние (`pokemon.store.ts`)

```typescript
import type { PokemonState } from './pokemon.types'

export const initialState: PokemonState = {
  api: {
    listRequest: { status: 'idle', error: null },
    detailsRequest: { status: 'idle', error: null },
  },
  pokemonList: [],
  offset: 0,
  hasMore: true,
  selectedPokemonId: null,
  selectedPokemon: null,
  searchQuery: '',
  favorites: [],
}
```

## Селекторы (`pokemon.selectors.ts`)

Селекторы — производные значения. Поля класса становятся настоящими `SelectorAPI` сразу
после конструирования (eager), имя селектора = имя поля. Промежуточные слайсы можно
держать `private` — наружу не видны, но работают как зависимости в `combine`.

```typescript
import { Selectors } from 'synapse-storage/core'
import type { PokemonState } from './pokemon.types'

export class PokemonSelectors extends Selectors<PokemonState> {
  // private = промежуточный слайс, наружу не экспортируется
  private readonly api = this.select((s) => s.api)

  // Простые селекторы — одно поле состояния
  readonly pokemonList = this.select((s) => s.pokemonList)
  readonly searchQuery = this.select((s) => s.searchQuery)
  readonly favorites = this.select((s) => s.favorites)

  // Комбинированные — зависят от других селекторов и пересчитываются мемоизированно
  readonly isListLoading = this.combine([this.api], (a) => a.listRequest.status === 'loading')

  // Фильтр списка по строке поиска
  readonly filteredList = this.combine([this.pokemonList, this.searchQuery], (list, query) =>
    query ? list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : list,
  )

  // Избранное — пересечение списка и id-шников в favorites
  readonly favoriteCount = this.combine([this.favorites], (favs) => favs.length)
  readonly favoritePokemon = this.combine([this.pokemonList, this.favorites], (list, favs) =>
    list.filter((p) => favs.includes(p.id)),
  )
}
```

> Полный набор селекторов (статусы и ошибки обоих запросов, `selectedPokemon`, `hasMore`)
> — в `pokemon.selectors.ts`. Подробнее о селекторах как таковых — [Селекторы](./selector-system.md).

## Сборка: createSynapse(factory)

`createSynapse(factory)` возвращает **ленивый handle**. Фабрика исполняется один раз —
при первом `await` / `ready()`, а не на импорте (это важно для SSR и для того, чтобы
импорт модуля не дёргал сеть).

Минимальная форма — только storage + selectors:

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

import { PokemonSelectors } from './pokemon.selectors'
import { initialState } from './pokemon.store'
import type { PokemonState } from './pokemon.types'

const pokemonSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })
  return {
    storage,
    selectors: new PokemonSelectors(storage),
    // dispatcher / effects — добавим на следующих страницах
  }
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
```

## Возвращаемое значение

```typescript
// Handle — thenable: await дёргает фабрику и возвращает собранный модуль
const store = await pokemonSynapse

// Результат (базовый — без диспетчера):
store.storage    // IStorage<PokemonState> — хранилище
store.selectors  // экземпляр PokemonSelectors — поля = SelectorAPI
store.state$     // Observable<PokemonState> — поток состояния (есть ВСЕГДА, даже без эффектов)
store.dispatcher // undefined (диспетчера нет)
store.actions    // undefined (алиас диспетчера)

// Сам handle:
pokemonSynapse.ready()        // Promise<store> — то же, что await
pokemonSynapse.isReady()      // boolean
pokemonSynapse.getSnapshot()  // store | undefined — синхронный доступ (нужен SSR)
pokemonSynapse.destroy()      // Promise<void> — очистка + сброс мемоизации (handle пересоздаваем)
```

## Использование в React

Без диспетчера читаем через `useSelector`, а пишем через хранилище **напрямую**:

```typescript
import { useSelector } from 'synapse-storage/react'

const filteredList = useSelector(store.selectors.filteredList)
const favoriteCount = useSelector(store.selectors.favoriteCount)
const searchQuery = useSelector(store.selectors.searchQuery)

// Изменение состояния — через хранилище напрямую
store.storage.set('searchQuery', 'pika')

store.storage.update((s) => {
  const i = s.favorites.indexOf(25)
  if (i >= 0) s.favorites.splice(i, 1)
  else s.favorites.push(25)
})
```

> Прямые `storage.set/update` хороши для простого state. Как только появляются
> именованные намерения и побочные эффекты (загрузка из API) — это работа
> [Dispatcher](./create-synapse-dispatcher.md) и [Effects](./create-synapse-effects.md).

## Async-инициализация в фабрике

Фабрика — обычная `async`-функция, поэтому любой пролог (запрос за seed-данными,
`init()` API-клиента) делается прямо в ней, до сборки модуля:

```typescript
const pokemonSynapse = createSynapse(async () => {
  // async-пролог выполняется один раз при первом await
  const seed = await fetch('https://pokeapi.co/api/v2/pokemon?limit=12').then((r) => r.json())

  const storage = new MemoryStorage<PokemonState>({
    name: 'pokemon-advanced',
    initialState: { ...initialState, /* ...подготовленный seed... */ },
  })
  return {
    storage,
    selectors: new PokemonSelectors(storage),
  }
})
```

> В полном модуле этот пролог — `await initPokemonApi()` (инициализация `pokemonApiClient`).
> Как это выглядит вместе с диспетчером, эффектами и зависимостями — [Pokemon пример](./pokemon-advanced.md).
