import { MemoryStorage } from 'synapse-storage/core'
import { createSynapse } from 'synapse-storage/utils'
import type { PokemonState } from './pokemon.types'
import { initialState } from './pokemon.store'
import { createPokemonSelectors } from './pokemon.selectors'
import { createPokemonDispatcher } from './pokemon.dispatcher'
import { pokemonEffects } from './pokemon.effects'
import { pokemonApiClient, initPokemonApi } from './pokemon.api'
import { settingsStorage } from './pokemon.settings'

export const synapsePromise = createSynapse({

  // ─── Инициализация ────────────────────────────────────────────────────────
  // Вызывается после готовности зависимостей, до инициализации хранилища.
  // Подходит для инициализации API-клиентов, загрузки конфигов и т.д.
  setup: async () => {
    await initPokemonApi()
  },

  // ─── Хранилище ────────────────────────────────────────────────────────────
  // Два взаимоисключающих способа создать хранилище:
  //
  // 1. storage — готовый экземпляр IStorage:
  storage: new MemoryStorage<PokemonState>({ name: 'pokemon-advanced', initialState }),
  //
  // 2. createStorageFn — фабрика для ленивого/асинхронного создания хранилища.
  //    Полезно когда storage требует async-настройки (загрузка конфига, подключение к БД).
  //    Взаимоисключающе с storage — используется либо одно, либо другое.
  //
  //    createStorageFn: async () => {
  //      const config = await loadRemoteConfig()
  //      return new MemoryStorage<PokemonState>({ name: config.name, initialState })
  //    },

  // ─── Зависимости ──────────────────────────────────────────────────────────
  // Массив зависимостей, которые должны быть готовы до инициализации synapse.
  // Принимает { storage: IStorageBase } или Promise<SynapseStore>.
  // createSynapse дождётся resolve/initialize всех зависимостей
  // перед вызовом setup, созданием storage, selectors и effects.
  dependencies: [
    settingsStorage,          // IStorageBase напрямую
    // { storage: otherStorage },  // обёртка { storage } тоже работает
    // otherSynapsePromise,        // Promise от другого createSynapse
  ],

  // Таймаут ожидания зависимостей (мс). По умолчанию 30000.
  // При превышении — ошибка инициализации.
  dependencyTimeout: 10000,

  // ─── Селекторы ────────────────────────────────────────────────────────────
  createSelectorsFn: createPokemonSelectors,

  // Внешние селекторы — передаются вторым аргументом в createSelectorsFn.
  // Позволяют строить производные данные на основе селекторов из других synapse.
  // Например: { auth: authSynapse.selectors } — чтобы комбинировать с локальными.
  externalSelectors: {
    settings: settingsStorage,
  },

  // ─── Dispatcher ───────────────────────────────────────────────────────────
  createDispatcherFn: createPokemonDispatcher,

  // ─── Effects ──────────────────────────────────────────────────────────────
  createEffectConfig: () => ({
    services: { pokemonApi: pokemonApiClient.getEndpoints() },
    externalStates: {
      // IStorageBase — автоматически конвертируется в Observable внутри EffectsModule
      settings: settingsStorage,
    },
  }),

  effects: [pokemonEffects],
})

export type PokemonSynapse = Awaited<typeof synapsePromise>
