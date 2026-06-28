import { useEffect, useState } from 'react'
import { createSynapseAwaiter } from 'synapse-storage/utils'
import { cardStyle, sectionTitle } from './styles'
import { pokemonSynapse, type PokemonSynapse } from './pokemon-advanced/pokemon.synapse'
import { PokemonDemo } from './pokemon-advanced/PokemonDemo'

/**
 * createSynapseAwaiter — фреймворк-независимый примитив готовности под ленивым synapse-handle.
 * Это то, на чём построены React-обёртки `awaitSynapse` / `createSynapseCtx`; здесь показано
 * прямое (ручное) использование без HOC — пригодится в Node / RN / воркерах или когда нужен
 * контроль над тем, как готовность попадает в UI.
 *
 * Поверхность: isReady() / getStatus() / getStoreIfReady() / waitForReady() / onReady() /
 * onError() / destroy(). Скопируй и замени `pokemonSynapse` на свой handle.
 */
const pokemonAwaiter = createSynapseAwaiter(pokemonSynapse)

export function SynapseAwaiterExample() {
  // getStoreIfReady() отдаёт стор синхронно, если он уже готов (напр. после прежнего маунта).
  const [store, setStore] = useState<PokemonSynapse | null>(() => pokemonAwaiter.getStoreIfReady() ?? null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (pokemonAwaiter.isReady()) {
      setStore(pokemonAwaiter.getStoreIfReady()!)
      return
    }
    // Ручная интеграция: подписываемся на готовность/ошибку, оба колбэка возвращают unsubscribe.
    const offReady = pokemonAwaiter.onReady(setStore)
    const offError = pokemonAwaiter.onError(setError)
    return () => {
      offReady()
      offError()
    }
  }, [])

  useEffect(() => {
    store?.actions.loadList()
  }, [store])

  return (
    <div style={cardStyle}>
      <h2>createSynapseAwaiter (Pokemon)</h2>
      <p>
        Ванильный примитив готовности: <code>onReady</code> отдаёт готовый стор, дальше работаем с ним
        напрямую — тот же pokemon-модуль, но без React-HOC. Статус: <strong>{pokemonAwaiter.getStatus()}</strong>.
      </p>
      <h3 style={sectionTitle}>Demo</h3>
      {error ? (
        <div style={{ color: 'red' }}>Init failed: {error.message}</div>
      ) : store ? (
        <PokemonDemo store={store} />
      ) : (
        <div style={{ color: '#888' }}>Initializing…</div>
      )}
    </div>
  )
}
