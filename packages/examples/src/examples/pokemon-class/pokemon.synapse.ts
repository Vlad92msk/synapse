import { MemoryStorage } from 'synapse-storage/core'
import { toObservable } from 'synapse-storage/reactive'
import { createSynapse } from 'synapse-storage/utils'

import { initPokemonApi, pokemonApiClient } from '../pokemon-advanced/pokemon.api'
import { settingsStorage } from '../pokemon-advanced/pokemon.settings'
import { initialState } from '../pokemon-advanced/pokemon.store'
import type { PokemonState } from '../pokemon-advanced/pokemon.types'
import { PokemonDispatcher } from './pokemon.dispatcher'
import { PokemonEffects } from './pokemon.effects'
import { PokemonSelectors } from './pokemon.selectors'

/**
 * Class-based сборка (этап 4 ROADMAP) — новая перегрузка `createSynapse(factory)`.
 *
 * Возвращает ленивый `SynapseModule`-handle: фабрика исполняется один раз при первом
 * `await pokemonSynapse` / `pokemonSynapse.ready()`, а не на импорте. `destroy()`
 * сбрасывает мемоизацию — handle пересоздаваемый.
 */
export const pokemonSynapse = createSynapse(async () => {
  // async-пролог: инициализация API-клиента (бывший `setup`).
  await initPokemonApi()

  const storage = new MemoryStorage<PokemonState>({ name: 'pokemon-class', initialState })

  return {
    storage,
    // зависимости от другого хранилища — формат не изменился.
    dependencies: [settingsStorage],
    dependencyTimeout: 10000,

    dispatcher: new PokemonDispatcher(storage),
    selectors: new PokemonSelectors(storage),
    // сервисы и внешние сторы — через конструктор эффектов (захват в замыкание).
    effects: new PokemonEffects(pokemonApiClient.getEndpoints(), toObservable(settingsStorage)),
  }
})

export type PokemonSynapse = Awaited<typeof pokemonSynapse>
