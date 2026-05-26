import { createDispatcher, defineActions } from 'synapse-storage/reactive'
import type { IStorage } from 'synapse-storage/core'
import type { PokemonState, PokemonBrief, PokemonDetails } from './pokemon.types'

/**
 * defineActions<PokemonState>() — сохраняет узкие типы каждого экшена.
 * TypeScript инферит return type, поэтому DispatchActions / store.actions
 * знают конкретные сигнатуры (loadList: void → void, и т.д.).
 *
 * 5 состояний на каждый API-запрос:
 *   idle     — намерение (ещё не решено, будет ли реальный запрос)
 *   loading  — запрос отправлен, UI показывает спиннер
 *   success  — данные получены
 *   failure  — ошибка
 *   reset    — сброс в начальное состояние (валидация не прошла / отмена)
 *
 * Экшен из UI (loadList, loadMore, selectPokemon) ставит status = 'idle'.
 * Эффект решает — вызывать запрос (→ loading) или сбросить (→ reset).
 */
export const pokemonActions = defineActions<PokemonState>()((storage, { createAction, createWatcher }) => ({
  // ─── List: intent ─────────────────────────────────────────────────────────
  loadList: createAction<void, void>({
    meta: { description: 'Намерение загрузить список покемонов' },
    action: () => {
      storage.update((s) => {
        s.api.listRequest = { status: 'idle', error: null }
      })
    },
  }),

  loadMore: createAction<void, void>({
    meta: { description: 'Намерение загрузить следующую страницу' },
    action: () => {
      storage.update((s) => {
        s.api.listRequest = { status: 'idle', error: null }
      })
    },
  }),

  // ─── List: lifecycle ──────────────────────────────────────────────────────
  loadListLoading: createAction<void, void>({
    action: () => {
      storage.update((s) => {
        s.api.listRequest = { status: 'loading', error: null }
      })
    },
  }),

  loadListSuccess: createAction({
    action: (data: { list: PokemonBrief[]; hasMore: boolean; append: boolean }) => {
      storage.update((s) => {
        s.pokemonList = data.append ? [...s.pokemonList, ...data.list] : data.list
        s.offset = s.pokemonList.length
        s.hasMore = data.hasMore
        s.api.listRequest = { status: 'success', error: null }
      })
      return data
    },
  }),

  loadListFailure: createAction({
    action: (error: string) => {
      storage.update((s) => {
        s.api.listRequest = { status: 'error', error }
      })
      return error
    },
  }),

  loadListReset: createAction<void, void>({
    action: () => {
      storage.update((s) => {
        s.api.listRequest = { status: 'reset', error: null }
      })
    },
  }),

  // ─── Details: intent ──────────────────────────────────────────────────────
  selectPokemon: createAction({
    action: (id: number | null) => {
      storage.update((s) => {
        s.selectedPokemonId = id
        if (id !== null) {
          s.api.detailsRequest = { status: 'idle', error: null }
        } else {
          s.selectedPokemon = null
          s.api.detailsRequest = { status: 'idle', error: null }
        }
      })
      return id
    },
  }),

  // ─── Details: lifecycle ───────────────────────────────────────────────────
  loadDetailsLoading: createAction<void, void>({
    action: () => {
      storage.update((s) => {
        s.api.detailsRequest = { status: 'loading', error: null }
      })
    },
  }),

  loadDetailsSuccess: createAction({
    action: (details: PokemonDetails) => {
      storage.update((s) => {
        s.selectedPokemon = details
        s.api.detailsRequest = { status: 'success', error: null }
      })
      return details
    },
  }),

  loadDetailsFailure: createAction({
    action: (error: string) => {
      storage.update((s) => {
        s.selectedPokemon = null
        s.api.detailsRequest = { status: 'error', error }
      })
      return error
    },
  }),

  loadDetailsReset: createAction<void, void>({
    action: () => {
      storage.update((s) => {
        s.api.detailsRequest = { status: 'reset', error: null }
      })
    },
  }),

  // ─── UI actions (не связаны с API) ────────────────────────────────────────
  setSearchQuery: createAction({
    action: (query: string) => {
      storage.set('searchQuery', query)
      return query
    },
  }),

  toggleFavorite: createAction({
    action: (id: number) => {
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
  }),

  // ─── Watchers ─────────────────────────────────────────────────────────────
  watchFavoriteCount: createWatcher({
    selector: (s) => s.favorites.length,
    meta: { description: 'отслеживание кол-ва избранных' },
    notifyAfterSubscribe: true,
  }),
}))

/** Функция создания диспетчера — используется в createSynapse и для вывода типа */
export const createPokemonDispatcher = (storage: IStorage<PokemonState>) =>
  createDispatcher({ storage }, pokemonActions)

/** Тип диспетчера с конкретными типами всех экшенов */
export type PokemonDispatcher = ReturnType<typeof createPokemonDispatcher>
