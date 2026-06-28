import { useEffect } from 'react'
import { createSynapseCtx, useSelector } from 'synapse-storage/react'
import { buttonRow, cardStyle, sectionTitle } from './styles'
import { pokemonSynapse } from './pokemon-advanced/pokemon.synapse'

/**
 * createSynapseCtx — отдать готовый pokemon-модуль в дерево компонентов через React-контекст,
 * без проп-дриллинга стора.
 *
 * Альтернатива `awaitSynapse` (см. PokemonAdvancedExample): там модуль поднимается HOC-ом и
 * прокидывается пропом; здесь Provider поднимает его один раз, а вложенные компоненты берут
 * `storage` / `selectors` / `actions` / `state$` из хуков контекста. Скопируй и замени
 * `pokemonSynapse` на свой synapse-handle.
 */
const PokemonCtx = createSynapseCtx(pokemonSynapse, {
  loadingComponent: <div style={{ padding: 16, color: '#888' }}>Initializing context…</div>,
})

// Компонент ничего не знает про создание модуля — только потребляет его из контекста.
function PokemonPanel() {
  const selectors = PokemonCtx.useSynapseSelectors()
  const actions = PokemonCtx.useSynapseActions()

  const list = useSelector(selectors.filteredList)
  const query = useSelector(selectors.searchQuery)
  const favoriteCount = useSelector(selectors.favoriteCount)
  const isLoading = useSelector(selectors.isListLoading)

  // Первичная загрузка — один раз, когда контекст готов.
  useEffect(() => {
    actions.loadList()
  }, [actions])

  return (
    <div>
      <input
        type="text"
        value={query ?? ''}
        onChange={(e) => actions.setSearchQuery(e.target.value)}
        placeholder="Search pokemon…"
        style={{ width: '100%', padding: 8, boxSizing: 'border-box', borderRadius: 4, border: '1px solid #ccc', marginBottom: 8 }}
      />

      <div style={{ ...buttonRow, justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#666' }}>
          Favorites: {favoriteCount ?? 0} | Loaded: {list?.length ?? 0}
        </span>
        <button onClick={() => actions.loadList()} disabled={!!isLoading}>
          {isLoading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
        {list?.map((p) => (
          <div
            key={p.id}
            onClick={() => actions.toggleFavorite(p.id)}
            style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, textAlign: 'center', cursor: 'pointer' }}
          >
            <img src={p.sprite} alt={p.name} style={{ width: 56, height: 56, imageRendering: 'pixelated' }} />
            <div style={{ fontSize: 12, textTransform: 'capitalize' }}>{p.name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// contextSynapse оборачивает компонент Provider-ом (поднимает модуль, держит loadingComponent).
const PokemonPanelWithCtx = PokemonCtx.contextSynapse(PokemonPanel)

export function SynapseCtxExample() {
  return (
    <div style={cardStyle}>
      <h2>createSynapseCtx (Pokemon)</h2>
      <p>
        Готовый pokemon-модуль раздаётся через React-контекст: <code>contextSynapse</code> поднимает
        его, а <code>useSynapseSelectors</code> / <code>useSynapseActions</code> дают доступ из любого
        вложенного компонента.
      </p>
      <h3 style={sectionTitle}>Demo</h3>
      <PokemonPanelWithCtx />
    </div>
  )
}
