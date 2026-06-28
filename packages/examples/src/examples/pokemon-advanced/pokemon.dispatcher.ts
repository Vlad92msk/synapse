import { Dispatcher } from 'synapse-storage/reactive'

import type { PokemonBrief, PokemonDetails, PokemonState } from './pokemon.types'

/**
 * Диспетчер домена — описывает намерения. Экшены объявлены как поля класса,
 * имя экшена = имя поля. Группа `apiActions` раскрывается в жизненный цикл запроса
 * (init / loading / success / failure / reset) одним полем.
 */
export class PokemonDispatcher extends Dispatcher<PokemonState> {
  /** Намерение загрузить список с начала. `loadList()` = init (idle), `.loading/.success/.failure` — статусы. */
  readonly loadList = this.apiActions<void>((s) => s.api.listRequest)

  /** Намерение подгрузить следующую страницу (статус пишется через `loadList.*`). */
  readonly loadMore = this.signal<void>('Подгрузить следующую страницу')

  /** Жизненный цикл запроса деталей. */
  readonly loadDetails = this.apiActions<void>((s) => s.api.detailsRequest)

  readonly selectPokemon = this.action((store, id: number | null) => {
    store.update((s) => {
      s.selectedPokemonId = id
      if (id === null) s.selectedPokemon = null
    })
    return id
  })

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

  readonly watchFavoriteCount = this.watcher({
    selector: (s) => s.favorites.length,
    meta: { description: 'отслеживание кол-ва избранных' },
    notifyAfterSubscribe: true,
  })
}
