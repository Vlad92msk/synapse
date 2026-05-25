import type { IStorage } from 'synapse-storage/core'
import { createDispatcher } from 'synapse-storage/reactive'
import type { PokemonState, PokemonBrief, PokemonDetails } from './pokemon.types'

export function createPokemonDispatcher(storage: IStorage<PokemonState>) {
  return createDispatcher({ storage }, (_storage, { createAction, createWatcher }) => {

    // ── Загрузка списка ──────────────────────────────────────────────

    const loadList = createAction<void, { offset: number }>({
      meta: { description: 'Инициализация загрузки списка покемонов' },
      action: () => {
        storage.update((s: PokemonState) => {
          s.api.listRequest = { status: 'loading', error: null }
        })
        return { offset: 0 }
      },
    })

    const loadMore = createAction<void, { offset: number }>({
      meta: { description: 'Загрузка следующей страницы' },
      action: () => {
        const offset = storage.getStateSync().offset
        storage.update((s: PokemonState) => {
          s.api.listRequest = { status: 'loading', error: null }
        })
        return { offset }
      },
    })

    const loadListSuccess = createAction({
      action: (data: { list: PokemonBrief[]; hasMore: boolean; append: boolean }) => {
        storage.update((s: PokemonState) => {
          s.pokemonList = data.append ? [...s.pokemonList, ...data.list] : data.list
          s.offset = s.pokemonList.length
          s.hasMore = data.hasMore
          s.api.listRequest = { status: 'success', error: null }
        })
        return data
      },
    })

    const loadListError = createAction({
      action: (error: string) => {
        storage.update((s: PokemonState) => {
          s.api.listRequest = { status: 'error', error }
        })
        return error
      },
    })

    // ── Выбор покемона и загрузка деталей ─────────────────────────────

    const selectPokemon = createAction({
      action: (id: number | null) => {
        storage.update((s: PokemonState) => {
          s.selectedPokemonId = id
          if (id !== null) {
            s.api.detailsRequest = { status: 'loading', error: null }
          } else {
            s.selectedPokemon = null
            s.api.detailsRequest = { status: 'idle', error: null }
          }
        })
        return id
      },
    })

    const loadDetailsSuccess = createAction({
      action: (details: PokemonDetails) => {
        storage.update((s: PokemonState) => {
          s.selectedPokemon = details
          s.api.detailsRequest = { status: 'success', error: null }
        })
        return details
      },
    })

    const loadDetailsError = createAction({
      action: (error: string) => {
        storage.update((s: PokemonState) => {
          s.selectedPokemon = null
          s.api.detailsRequest = { status: 'error', error }
        })
        return error
      },
    })

    // ── Поиск и избранное ─────────────────────────────────────────────

    const setSearchQuery = createAction({
      action: (query: string) => {
        storage.set('searchQuery', query)
        return query
      },
    })

    const toggleFavorite = createAction({
      action: (id: number) => {
        storage.update((s: PokemonState) => {
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

    // ── Watcher: отслеживание кол-ва избранных ───────────────────────

    const watchFavoriteCount = createWatcher({
      selector: (s: PokemonState) => s.favorites.length,
      notifyAfterSubscribe: true,
    })

    return {
      loadList, loadMore, loadListSuccess, loadListError,
      selectPokemon, loadDetailsSuccess, loadDetailsError,
      setSearchQuery, toggleFavorite, watchFavoriteCount,
    }
  })
}

export type PokemonDispatcher = ReturnType<typeof createPokemonDispatcher>
