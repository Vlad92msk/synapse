import { useEffect } from 'react'
import { awaitSynapse } from 'synapse-storage/react'
import { cardStyle, sectionTitle } from '../styles'
import { pokemonSynapse } from './pokemon.synapse'
import { PokemonDemo } from './PokemonDemo'

/**
 * Pokemon Pokedex — продвинутый пример слоя управления данными на PokeAPI.
 *
 * Весь домен лежит рядом, по файлам-ответственностям:
 *   pokemon.types.ts       — доменные типы и форма состояния
 *   pokemon.api.ts         — ApiClient (endpoints, cache) + мапперы ответа
 *   pokemon.store.ts       — storage + initialState
 *   pokemon.selectors.ts   — производные значения (class Selectors)
 *   pokemon.dispatcher.ts  — намерения (class Dispatcher)
 *   pokemon.effects.ts     — side-effects на RxJS (class Effects)
 *   pokemon.synapse.ts     — сборка через createSynapse(factory)
 *
 * Здесь — только UI-обёртка: подъём ленивого synapse через `awaitSynapse` и демо
 * поверх него. Разбор кода — в docs/ru (раздел React / await-synapse, Рецепты).
 */

// awaitSynapse поднимает ленивый handle: фабрика стартует при создании awaiter,
// loadingComponent держится на экране, пока storage не инициализирован.
const pokemonAwaiter = awaitSynapse(pokemonSynapse, {
  loadingComponent: <div>Initializing...</div>,
  errorComponent: (error) => <div>Init failed: {error.message}</div>,
})

function PokemonContent() {
  // HOC рендерит этот компонент только когда synapse готов — store доступен синхронно.
  const store = pokemonAwaiter.getStoreIfReady()!

  // Первичная загрузка списка — один раз, когда модуль готов.
  useEffect(() => {
    store.actions.loadList()
  }, [store])

  return (
    <div style={cardStyle}>
      <h2>Pokemon Pokedex (advanced)</h2>
      <p>
        Полный слой управления данными на PokeAPI: ApiClient с кэшем, мапперы ответа,
        составные селекторы, диспетчер намерений, эффекты на RxJS и сборка через
        <code> createSynapse</code>. Каждый файл модуля — отдельная ответственность.
      </p>

      <h3 style={sectionTitle}>Demo</h3>
      <PokemonDemo store={store} />
    </div>
  )
}

// withSynapseReady: показывает loadingComponent до готовности, затем рендерит контент.
export const PokemonAdvancedExample = pokemonAwaiter.withSynapseReady(PokemonContent)
