import { Selectors } from 'synapse-storage/core'

import type { PokemonState } from '../pokemon-advanced/pokemon.types'

/**
 * Class-based селекторы (этап 4 ROADMAP). Поля — настоящие `SelectorAPI` сразу после
 * конструирования (eager). Промежуточные слайсы — `private`-поля, наружу не видны, но
 * работают как зависимости в `this.combine([...])`.
 */
export class PokemonSelectors extends Selectors<PokemonState> {
  private readonly api = this.select((s) => s.api)

  readonly pokemonList = this.select((s) => s.pokemonList)
  readonly searchQuery = this.select((s) => s.searchQuery)
  readonly favorites = this.select((s) => s.favorites)
  readonly selectedPokemon = this.select((s) => s.selectedPokemon)
  readonly hasMore = this.select((s) => s.hasMore)

  readonly listStatus = this.combine([this.api], (a) => a.listRequest.status)
  readonly detailsStatus = this.combine([this.api], (a) => a.detailsRequest.status)
  readonly listError = this.combine([this.api], (a) => a.listRequest.error)
  readonly detailsError = this.combine([this.api], (a) => a.detailsRequest.error)

  readonly isListLoading = this.combine([this.listStatus], (s) => s === 'loading')
  readonly isDetailsLoading = this.combine([this.detailsStatus], (s) => s === 'loading')

  readonly filteredList = this.combine([this.pokemonList, this.searchQuery], (list, query) =>
    query ? list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : list,
  )

  readonly favoriteCount = this.combine([this.favorites], (favs) => favs.length)
  readonly favoritePokemon = this.combine([this.pokemonList, this.favorites], (list, favs) => list.filter((p) => favs.includes(p.id)))
}
