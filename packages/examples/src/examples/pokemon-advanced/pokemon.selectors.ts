import type { ISelectorModule, IStorageBase } from 'synapse-storage/core'
import type { PokemonState } from './pokemon.types'
import type { PokemonSettings } from './pokemon.settings'

// Тип внешних селекторов — соответствует externalSelectors в createSynapse
type ExternalSelectors = {
  settings: IStorageBase<PokemonSettings>
}

export function createPokemonSelectors(sm: ISelectorModule<PokemonState>, ext: ExternalSelectors) {
  const api = sm.createSelector((s) => s.api)
  const pokemonList = sm.createSelector((s) => s.pokemonList)
  const searchQuery = sm.createSelector((s) => s.searchQuery)
  const favorites = sm.createSelector((s) => s.favorites)
  const selectedPokemon = sm.createSelector((s) => s.selectedPokemon)
  const hasMore = sm.createSelector((s) => s.hasMore)

  // API-статусы
  const listStatus = sm.createSelector([api], (a) => a.listRequest.status)
  const detailsStatus = sm.createSelector([api], (a) => a.detailsRequest.status)
  const listError = sm.createSelector([api], (a) => a.listRequest.error)
  const detailsError = sm.createSelector([api], (a) => a.detailsRequest.error)

  // Комбинированные селекторы загрузки
  const isListLoading = sm.createSelector([listStatus], (s) => s === 'loading')
  const isDetailsLoading = sm.createSelector([detailsStatus], (s) => s === 'loading')

  // Фильтрованный список — композиция pokemonList + searchQuery
  const filteredList = sm.createSelector(
    [pokemonList, searchQuery],
    (list, query) => {
      if (!query) return list
      return list.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    },
  )

  // Производные данные по избранному
  const favoriteCount = sm.createSelector([favorites], (favs) => favs.length)

  const favoritePokemon = sm.createSelector(
    [pokemonList, favorites],
    (list, favs) => list.filter((p) => favs.includes(p.id)),
  )

  return {
    pokemonList, searchQuery, favorites, selectedPokemon, hasMore,
    listStatus, detailsStatus, listError, detailsError,
    isListLoading, isDetailsLoading,
    filteredList, favoriteCount, favoritePokemon,
  }
}
