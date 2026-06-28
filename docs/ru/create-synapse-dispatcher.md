# createSynapse (диспетчер)

> [Назад к оглавлению](./README.md) · [Диспетчер модуля (`pokemon.dispatcher.ts`)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/pokemon-advanced/pokemon.dispatcher.ts) · [Песочница (Cart)](https://github.com/Vlad92msk/synapse/blob/master/packages/examples/src/examples/CreateSynapseDispatcherExample.tsx)

Следующий кирпич после [базовой сборки](./create-synapse-basic.md): добавляем **диспетчер**.
Он описывает **намерения** — именованные действия, меняющие состояние, — и **наблюдатели**
(watchers) для реактивного отслеживания. Эффекты (вызовы API по экшенам) — на
[следующей странице](./create-synapse-effects.md).

Домен тот же — `pokemon-advanced`.

## Диспетчер (`pokemon.dispatcher.ts`)

Экшены и наблюдатели объявляются как **поля класса**, имя экшена = имя поля. Сборщик
финализирует диспетчер (генерирует `actionType` из имён полей) до старта.

```typescript
import { Dispatcher } from 'synapse-storage/reactive'
import type { PokemonBrief, PokemonDetails, PokemonState } from './pokemon.types'

export class PokemonDispatcher extends Dispatcher<PokemonState> {
  // apiActions — вызываемая группа жизненного цикла запроса (см. dispatcher-detailed)
  readonly loadList = this.apiActions<void>((s) => s.api.listRequest)
  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)

  // signal — чистый сигнал-намерение без записи в состояние (его обработает эффект)
  readonly loadMore = this.signal<void>('Подгрузить следующую страницу')

  // action — намерение, которое само меняет состояние
  readonly selectPokemon = this.action((store, id: number | null) => {
    store.update((s) => {
      s.selectedPokemonId = id
      if (id === null) s.selectedPokemon = null
    })
    return id
  })

  readonly setSearchQuery = this.action((store, query: string) => {
    store.set('searchQuery', query)
    return query
  })

  readonly toggleFavorite = this.action((store, id: number) => {
    store.update((s) => {
      const idx = s.favorites.indexOf(id)
      if (idx >= 0) s.favorites.splice(idx, 1)
      else s.favorites.push(id)
    })
    return id
  })

  // Экшены, которыми эффект записывает результат запроса в состояние
  readonly applyPokemonList = this.action((store, data: { list: PokemonBrief[]; hasMore: boolean; append: boolean }) =>
    store.update((s) => {
      s.pokemonList = data.append ? [...s.pokemonList, ...data.list] : data.list
      s.offset = s.pokemonList.length
      s.hasMore = data.hasMore
    }),
  )

  readonly applyPokemonDetails = this.action((store, details: PokemonDetails) =>
    store.update((s) => {
      s.selectedPokemon = details
    }),
  )

  // watcher — реактивно отслеживает срез состояния
  readonly watchFavoriteCount = this.watcher({
    selector: (s) => s.favorites.length,
    meta: { description: 'отслеживание кол-ва избранных' },
    notifyAfterSubscribe: true,
  })
}
```

## this.action

`this.action((store, params) => result)` — handler в «рецептной» сигнатуре. **payload экшена
= возвращаемое значение** handler'а (поэтому `selectPokemon` возвращает `id`, а
`toggleFavorite` — `id`: их payload потом ловят эффекты).

```typescript
// Вызов через store.actions (имя экшена = имя поля)
store.actions.selectPokemon(25)
store.actions.setSearchQuery('pika')
store.actions.toggleFavorite(25)

// actionType генерируется из имени поля при финализации
store.actions.selectPokemon.actionType  // '[pokemon-advanced]selectPokemon'
```

> `store.actions.X` — это сокращение для `store.dispatcher.dispatch.X`.

## this.watcher

`this.watcher` реактивно отслеживает изменения состояния и отдаёт RxJS `Observable`:

```typescript
class PokemonDispatcher extends Dispatcher<PokemonState> {
  readonly watchFavoriteCount = this.watcher({
    selector: (state) => state.favorites.length,    // что отслеживать
    notifyAfterSubscribe: true,                      // вызвать сразу при подписке
    shouldTrigger: (prev, curr) => prev !== curr,    // фильтр (опционально)
  })
}

// Подписка — через реестр watchers (вызов фабрики → Observable)
const sub = store.dispatcher.watchers.watchFavoriteCount().subscribe((action) => {
  console.log('избранных:', action.payload)
})

sub.unsubscribe()
```

## signal и apiActions

`this.signal<T>(description?)` — чистый сигнал `(_store, payload) => payload`: ничего не
пишет в состояние, только бросает намерение в поток (его подхватит эффект — как `loadMore`).

`this.apiActions(accessor)` — вызываемая **группа** жизненного цикла запроса. Сам вызов
(`loadList()`) = init (статус `idle`), а `.loading()` / `.success()` / `.failure(error)` /
`.reset()` пишут статус по указанному пути состояния. Полная поверхность и правило `ofType`
— [Dispatcher (подробно)](./dispatcher-detailed.md).

## Сборка

```typescript
import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'

import { PokemonDispatcher } from './pokemon.dispatcher'
import { PokemonSelectors } from './pokemon.selectors'
import { initialState } from './pokemon.store'
import type { PokemonState } from './pokemon.types'

const pokemonSynapse = createSynapse(async () => {
  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState })
  return {
    storage,
    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    // effects — на следующей странице
  }
})
```

## Возвращаемое значение

```typescript
const store = await pokemonSynapse

store.storage     // IStorage<PokemonState>
store.selectors   // экземпляр PokemonSelectors
store.dispatcher  // экземпляр PokemonDispatcher (dispatch, watchers, action$)
store.actions     // алиас store.dispatcher.dispatch: { selectPokemon, setSearchQuery, ... }

// store.actions.selectPokemon === store.dispatcher.dispatch.selectPokemon

// Поток всех действий (RxJS Observable) — на нём строятся эффекты
store.dispatcher.actions.subscribe((action) => {
  console.log(action.type, action.payload)
})
```

## React (createSynapseCtx)

```typescript
import { createSynapseCtx } from 'synapse-storage/react'

// Передаём САМ handle (не вызов) — фабрика стартует лениво при первом mount Provider'а
export const { contextSynapse, useSynapseSelectors, useSynapseActions } =
  createSynapseCtx(pokemonSynapse, { loadingComponent: <div>Загрузка...</div> })
```

Подробнее — [createSynapseCtx](./synapse-ctx.md). Как намерения превращаются в реальные
вызовы API — [Effects](./create-synapse-effects.md).
