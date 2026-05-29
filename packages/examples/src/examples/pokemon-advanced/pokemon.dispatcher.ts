import { createDispatcher } from 'synapse-storage/reactive'
import type { IStorage } from 'synapse-storage/core'

import type { PokemonBrief, PokemonDetails, PokemonState } from './pokemon.types'
import { createApiActions, defineAction, defineWatcher } from 'synapse-storage'


/** Функция создания диспетчера — используется в createSynapse и для вывода типа */
export const createPokemonDispatcher = (storage: IStorage<PokemonState>) => {
  const action = defineAction<PokemonState>()
  const watcher = defineWatcher<PokemonState>()

  const listRequest = createApiActions<PokemonState>((draft) => draft.api.listRequest)
  const detailsRequest = createApiActions<PokemonState>((draft) => draft.api.detailsRequest)

  const loadList = action({
    meta: { description: 'Намерение загрузить список покемонов' },
    action: (storage) => {
      storage.update((s) => {
        s.api.listRequest = { status: 'idle', error: null }
      })
    },
  })

  const loadMore = action({
    meta: { description: 'Намерение загрузить следующую страницу' },
    action: (storage) => {
      storage.update((s) => {
        s.api.listRequest = { status: 'idle', error: null }
      })
    },
  })

  const selectPokemon = action({
    action: (storage, id: number | null) => {
      storage.update((s) => {
        s.selectedPokemonId = id
        if (id === null) {
          s.selectedPokemon = null
        }
        s.api.detailsRequest = { status: 'idle', error: null }
      })
      return id
    },
  })

  const applyPokemonList = action({
    action: (storage, data: { list: PokemonBrief[]; hasMore: boolean; append: boolean }) => {
      storage.update((s) => {
        s.pokemonList = data.append ? [...s.pokemonList, ...data.list] : data.list
        s.offset = s.pokemonList.length
        s.hasMore = data.hasMore
      })
    },
  })

  const applyPokemonDetails = action({
    action: (storage, details: PokemonDetails) => {
      storage.update((s) => {
        s.selectedPokemon = details
      })
    },
  })

  const setSearchQuery = action({
    action: (storage, query: string) => {
      storage.set('searchQuery', query)
      return query
    },
  })

  const toggleFavorite = action({
    action: (storage, id: number) => {
      storage.update((s) => {
        const idx = s.favorites.indexOf(id)
        if (idx >= 0) {
          s.favorites.splice(idx, 1)
        } else {
          s.favorites.push(id)
        }
      })
      return id
    },
  })

  const watchFavoriteCount = watcher({
    selector: (s) => s.favorites.length,
    meta: { description: 'отслеживание кол-ва избранных' },
    notifyAfterSubscribe: true,
  })

  return createDispatcher({ storage }, {
    loadList,
    loadMore,
    selectPokemon,

    loadListInit: listRequest.init,
    loadListLoading: listRequest.loading,
    loadListSuccess: listRequest.success,
    loadListFailure: listRequest.failure,
    loadListReset: listRequest.reset,

    loadDetailsInit: detailsRequest.init,
    loadDetailsLoading: detailsRequest.loading,
    loadDetailsSuccess: detailsRequest.success,
    loadDetailsFailure: detailsRequest.failure,
    loadDetailsReset: detailsRequest.reset,

    applyPokemonList,
    applyPokemonDetails,

    setSearchQuery,
    toggleFavorite,

    watchFavoriteCount,
  })
}

/** Тип диспетчера с конкретными типами всех экшенов */
export type PokemonDispatcher = ReturnType<typeof createPokemonDispatcher>
