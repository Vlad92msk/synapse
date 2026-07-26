import { MemoryStorage } from 'synapse-storage/core'
import { toObservable } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'

import { initPokemonApi, pokemonApiClient } from './pokemon.api'
import { settingsStorage } from './pokemon.settings'
import { initialState } from './pokemon.store'
import type { PokemonState } from './pokemon.types'
import { PokemonDispatcher } from './pokemon.dispatcher'
import { PokemonEffects } from './pokemon.effects'
import { PokemonSelectors } from './pokemon.selectors'

/**
 * Сборка слоя данных через `createSynapse({ … })` — единственная C-форма.
 *
 * Конструкция ядра СИНХРОННА: `storage`/`dispatcher`/`selectors` строятся из `initialState`
 * в один тик (TState выводится из фабрики `storage`). Всё async (init API-клиента, резолв
 * endpoints) уезжает в фабрику `effects`. Возвращает ленивый `SynapseModule`-handle: эффекты
 * стартуют при первом `await pokemonSynapse` / `pokemonSynapse.ready()`, а не на импорте.
 * `destroy()` сбрасывает мемоизацию — handle пересоздаваемый.
 */
export const pokemonSynapse = createSynapse({
  storage: () => new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  // зависимости от другого хранилища — гейт СТАРТА эффектов (не конструкции).
  dependencies: [settingsStorage],
  dependencyTimeout: 10000,

  dispatcher: (s) => new PokemonDispatcher(s),
  selectors: (s) => new PokemonSelectors(s),
  // фабрика effects может быть async: сюда уехал async-пролог (init API-клиента).
  // Сервисы и внешние сторы — через конструктор эффектов (захват в замыкание).
  effects: async () => {
    await initPokemonApi()
    return new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage))
  },
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
