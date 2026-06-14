import { useState, useEffect } from 'react'
import { useSelector } from 'synapse-storage/react'
import { buttonRow } from '../styles'
import { typeColor } from './helpers'
import type { PokemonSynapse } from '../pokemon-class'

export function PokemonDemo({ store }: { store: PokemonSynapse }) {
  const filteredList = useSelector(store.selectors.filteredList)
  const searchQuery = useSelector(store.selectors.searchQuery)
  const isListLoading = useSelector(store.selectors.isListLoading)
  const isDetailsLoading = useSelector(store.selectors.isDetailsLoading)
  const selectedPokemon = useSelector(store.selectors.selectedPokemon)
  const favorites = useSelector(store.selectors.favorites)
  const favoriteCount = useSelector(store.selectors.favoriteCount)
  const hasMore = useSelector(store.selectors.hasMore)
  const listError = useSelector(store.selectors.listError)
  const detailsError = useSelector(store.selectors.detailsError)

  const [watcherLogs, setWatcherLogs] = useState<string[]>([])

  useEffect(() => {
    const sub = store.dispatcher.watchers.watchFavoriteCount().subscribe((a: any) => {
      setWatcherLogs((prev) => [...prev.slice(-4), `[watchFavoriteCount] count = ${a.payload}`])
    })
    return () => sub.unsubscribe()
  }, [store])

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          value={searchQuery ?? ''}
          onChange={(e) => store.actions.setSearchQuery(e.target.value)}
          placeholder="Search pokemon..."
          style={{ width: '100%', padding: 8, boxSizing: 'border-box', borderRadius: 4, border: '1px solid #ccc' }}
        />
      </div>

      {/* Info bar */}
      <div style={{ ...buttonRow, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#666' }}>
          Favorites: {favoriteCount ?? 0} | Loaded: {filteredList?.length ?? 0} pokemon
        </span>
        <div style={buttonRow}>
          <button onClick={() => store.actions.loadList()} disabled={!!isListLoading}>
            Reload
          </button>
          {hasMore && (
            <button onClick={() => store.actions.loadMore()} disabled={!!isListLoading}>
              {isListLoading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      </div>

      {/* Errors */}
      {listError && <p style={{ color: 'red', fontSize: 13 }}>List error: {listError}</p>}
      {detailsError && <p style={{ color: 'red', fontSize: 13 }}>Details error: {detailsError}</p>}

      {/* Pokemon grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
        gap: 8,
        marginBottom: 12,
      }}>
        {filteredList?.map((p) => {
          const isFav = favorites?.includes(p.id)
          return (
            <div
              key={p.id}
              onClick={() => store.actions.selectPokemon(p.id)}
              style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 8,
                textAlign: 'center',
                cursor: 'pointer',
                background: selectedPokemon?.id === p.id ? '#e3f2fd' : '#fff',
                position: 'relative',
                transition: 'background 0.15s',
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); store.actions.toggleFavorite(p.id) }}
                style={{
                  position: 'absolute', top: 2, right: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 16, color: isFav ? '#f5c518' : '#ccc',
                }}
              >
                {isFav ? '\u2605' : '\u2606'}
              </button>
              <img
                src={p.sprite}
                alt={p.name}
                style={{ width: 64, height: 64, imageRendering: 'pixelated' }}
              />
              <div style={{ fontSize: 12, fontWeight: 500, textTransform: 'capitalize' }}>
                {p.name}
              </div>
              <div style={{ fontSize: 10, color: '#999' }}>#{p.id}</div>
            </div>
          )
        })}
      </div>

      {isListLoading && <p style={{ color: '#888', textAlign: 'center' }}>Loading pokemon...</p>}

      {/* Selected Pokemon details */}
      {(selectedPokemon || isDetailsLoading) && (
        <div style={{
          border: '1px solid #2196f3',
          borderRadius: 8,
          padding: 16,
          background: '#f8fbff',
          marginBottom: 12,
        }}>
          {isDetailsLoading ? (
            <p style={{ color: '#888' }}>Loading details...</p>
          ) : selectedPokemon ? (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <img
                  src={selectedPokemon.sprite}
                  alt={selectedPokemon.name}
                  style={{ width: 96, height: 96, imageRendering: 'pixelated' }}
                />
                <h3 style={{ margin: '4px 0 0', textTransform: 'capitalize' }}>
                  {selectedPokemon.name}
                  <span style={{ color: '#999', fontWeight: 400 }}> #{selectedPokemon.id}</span>
                </h3>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 4 }}>
                  {selectedPokemon.types.map((t) => (
                    <span key={t} style={{
                      padding: '2px 8px', borderRadius: 10,
                      fontSize: 11, background: typeColor(t), color: '#fff',
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  H: {selectedPokemon.height / 10}m | W: {selectedPokemon.weight / 10}kg
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Stats</div>
                {selectedPokemon.stats.map((stat) => (
                  <div key={stat.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 11, width: 110, color: '#666', textTransform: 'capitalize' }}>
                      {stat.name}
                    </span>
                    <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 10 }}>
                      <div style={{
                        width: `${Math.min(100, stat.value / 1.5)}%`,
                        background: stat.value > 100 ? '#4caf50' : stat.value > 60 ? '#ff9800' : '#f44336',
                        height: '100%', borderRadius: 4,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, width: 28, textAlign: 'right' }}>{stat.value}</span>
                  </div>
                ))}
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, marginBottom: 4 }}>Abilities</div>
                <div style={{ fontSize: 12, color: '#555', textTransform: 'capitalize' }}>
                  {selectedPokemon.abilities.join(', ')}
                </div>
              </div>
              <button
                onClick={() => store.actions.selectPokemon(null)}
                style={{
                  position: 'absolute', right: 24, background: 'none',
                  border: 'none', fontSize: 18, cursor: 'pointer', color: '#999',
                }}
              >
                x
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Watcher logs */}
      {watcherLogs.length > 0 && (
        <div style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>
          <strong>Watcher logs:</strong>
          {watcherLogs.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      )}
    </div>
  )
}
